// Movimentação rápida: entrada (+) ou saída por FEFO (−) em poucos toques.
import { router, useLocalSearchParams, type Href } from 'expo-router';
import { Minus, Plus } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { IconButton, Tabs } from '@/components/sds';
import { Aviso, Botao, Campo, Card, Carregando, Selecionar, Tela, T } from '@/components/ui';
import { entradaRapida, lotesParaEntrada, planejarSaida, saidaRapida } from '@/data/rapida';
import { useEstoque } from '@/data/useEstoque';
import { lerNumero } from '@/domain/entrada';
import { fmtData, fmtNumero, fmtQtd } from '@/domain/formato';
import { mensagemErro } from '@/lib/supabase';

type Modo = 'saida' | 'entrada';

export default function Rapida() {
  const params = useLocalSearchParams<{ modo?: Modo; item?: string }>();
  const { estoque, projetos, nomesLocais, erro: erroCarga, recarregar } = useEstoque();
  const [modo, setModo] = useState<Modo>(params.modo ?? 'saida');
  const [itemId, setItemId] = useState<string | null>(params.item ?? null);
  const [busca, setBusca] = useState('');
  const [qtd, setQtd] = useState('1');
  const [loteEscolhido, setLote] = useState<string | null>(null);
  const [projeto, setProjeto] = useState<string | null>(null);
  const [finalidade, setFinalidade] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  const item = estoque?.find((i) => i.itemId === itemId) ?? null;
  const lotes = item ? lotesParaEntrada(item) : [];
  // Padrão: o lote de validade mais longa; vale a escolha da pessoa enquanto ela existir na lista.
  const lote = lotes.some((l) => l.loteId === loteEscolhido) ? loteEscolhido : lotes[0]?.loteId ?? null;
  if (!estoque) return erroCarga ? <Tela titulo="Movimentação rápida" voltar><Aviso>{erroCarga}</Aviso></Tela> : <Carregando />;

  const quantidade = lerNumero(qtd) ?? 0;
  const ajustar = (d: number) => setQtd(fmtNumero(Math.max(0, quantidade + d), quantidade % 1 ? 2 : 0));
  const plano = item && modo === 'saida' ? planejarSaida(item, quantidade) : null;
  const atalhos = item?.unidade === 'un' ? [1, 5, 10, 50] : [1, 10, 50, 100];
  const candidatos = estoque.filter((i) => i.ativo && (modo === 'saida' ? i.disponivel > 0 : true))
    .filter((i) => !busca || `${i.nome} ${i.codigo}`.toLowerCase().includes(busca.toLowerCase()))
    .sort((a, b) => a.nome.localeCompare(b.nome)).slice(0, 12);
  const pendencia = !item ? 'Escolha o item.' : quantidade <= 0 ? 'Informe a quantidade.'
    : modo === 'entrada' ? (!lote ? 'Este item não tem lote liberado para somar. Use Receber.' : null)
    : plano!.falta > 0 ? `Disponível insuficiente (${fmtQtd(item.disponivel, item.unidade)}).` : !projeto ? 'Escolha o projeto.' : !finalidade.trim() ? 'Informe a finalidade.' : null;

  async function confirmar() {
    if (!item || pendencia) return;
    setEnviando(true);
    setErro(null);
    setOk(null);
    try {
      if (modo === 'entrada') {
        const l = lotes.find((x) => x.loteId === lote)!;
        await entradaRapida(item, l, quantidade);
        setOk(`Entrada de ${fmtQtd(quantidade, item.unidade)} no lote ${l.numero}.`);
      } else {
        const feitos = await saidaRapida(item, quantidade, projeto!, finalidade.trim());
        setOk(`Saída registrada: ${feitos.join(' + ')}.`);
      }
      setQtd('1');
      await recarregar();
    } catch (e) {
      setErro(mensagemErro(e));
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Tela titulo="Movimentação rápida" voltar>
      <Tabs value={modo} onChange={(m) => { setModo(m); setOk(null); setErro(null); }} tabs={[{ value: 'saida', label: 'Saída FEFO (−)' }, { value: 'entrada', label: 'Entrada (+)' }]} />
      <T v="caption">{modo === 'saida'
        ? 'Retira do lote que vence primeiro e passa para o próximo se precisar. Para escolher outro lote, use Dispensar.'
        : 'Soma unidades a um lote já liberado (mesmo número e validade). Lote novo entra em quarentena pela tela Receber.'}</T>
      {ok ? <Aviso tom="ok">{ok}</Aviso> : null}
      {erro ? <Aviso>{erro}</Aviso> : null}

      <Campo rotulo="Item" placeholder="Busque por nome ou código" value={busca} onChangeText={setBusca} />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
        {candidatos.map((i) => (
          <Pressable key={i.itemId} onPress={() => setItemId(i.itemId)} accessibilityRole="radio" accessibilityState={{ selected: i.itemId === itemId }}
            className={`min-h-12 justify-center rounded-md px-3 ${i.itemId === itemId ? 'bg-brand' : 'bg-brand-tertiary active:bg-brand-secondary'}`}>
            <T v="label" className={i.itemId === itemId ? 'text-on-brand' : 'text-on-brand-tertiary'}>{i.nome}</T>
          </Pressable>
        ))}
      </ScrollView>

      {item ? (
        <Card className="gap-3">
          <T v="subtitle">{item.nome}</T>
          <T v="caption">{item.codigo} · disponível {fmtQtd(item.disponivel, item.unidade)}</T>
          <T v="label">Quantidade ({item.unidade})</T>
          <View className="flex-row items-center gap-3">
            <IconButton icon={Minus} label="Diminuir" onPress={() => ajustar(-1)} />
            <View className="flex-1"><Campo rotulo="" value={qtd} onChangeText={setQtd} keyboardType="decimal-pad" accessibilityLabel={`Quantidade em ${item.unidade}`} /></View>
            <IconButton icon={Plus} label="Aumentar" onPress={() => ajustar(1)} />
          </View>
          <View className="flex-row flex-wrap gap-2">
            {atalhos.map((a) => <Botao key={a} tipo="secundario" titulo={`+${a}`} onPress={() => ajustar(a)} />)}
          </View>

          {modo === 'entrada' ? (
            lotes.length ? (
              <Selecionar rotulo="Lote" valor={lote} onChange={setLote} permitirVazio={false}
                opcoes={lotes.map((l) => ({ valor: l.loteId, rotulo: `${l.numero} · validade ${fmtData(l.validade)} · ${nomesLocais[l.localId] ?? ''}` }))} />
            ) : <Botao titulo="Receber lote novo" onPress={() => router.push({ pathname: '/receber', params: { item: item.itemId } })} />
          ) : (
            <>
              {plano && plano.partes.length ? (
                <T v="caption">Sai de: {plano.partes.map((p) => `${fmtQtd(p.qtd, item.unidade)} do lote ${p.numero}`).join(' + ')}</T>
              ) : null}
              <Selecionar rotulo="Projeto" valor={projeto} onChange={setProjeto} permitirVazio={false} opcoes={projetos.map((p) => ({ valor: p.id, rotulo: p.nome }))} />
              <Campo rotulo="Finalidade" placeholder="Ex.: ensaio, aula prática" value={finalidade} onChangeText={setFinalidade} />
            </>
          )}
          {pendencia ? <T v="caption">{pendencia}</T> : null}
          <Botao titulo={modo === 'saida' ? 'Registrar saída' : 'Registrar entrada'} onPress={confirmar} carregando={enviando} desabilitado={!!pendencia} />
          <Botao tipo="sutil" titulo="Ver ficha do item" onPress={() => router.push(`/item/${item.itemId}` as Href)} />
        </Card>
      ) : null}
    </Tela>
  );
}
