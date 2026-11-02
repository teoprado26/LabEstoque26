import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import { ScanLine } from 'lucide-react-native';
import { useCallback, useMemo, useState } from 'react';
import { View } from 'react-native';
import { LeitorQR } from '@/components/LeitorQR';
import { Aviso, Botao, Campo, Card, Opcoes, Selo, SeloLote, Tela, T } from '@/components/ui';
import { listarLocais, listarProjetos, lerNumero, type Opcao } from '@/data/cadastros';
import { carregarEstoque, type ItemEstoque } from '@/data/servicoKpis';
import { saldoDisponivel, validadeEfetiva } from '@/domain/disponibilidade';
import { hoje } from '@/domain/datas';
import { ordenarFEFO } from '@/domain/fefo';
import { fmtData, fmtQtd } from '@/domain/formato';
import { useSessao } from '@/lib/sessao';
import { mensagemErro, supabase } from '@/lib/supabase';

export default function Dispensar() {
  const params = useLocalSearchParams<{ item?: string; lote?: string }>();
  const { lab } = useSessao();
  const [estoque, setEstoque] = useState<ItemEstoque[]>([]);
  const [projetos, setProjetos] = useState<Opcao[]>([]);
  const [locais, setLocais] = useState<Record<string, string>>({});
  const [itemId, setItemId] = useState<string | null>(params.item ?? null);
  const [posicao, setPosicao] = useState<string | null>(null); // `${loteId}|${localId}`
  const [busca, setBusca] = useState('');
  const [qtd, setQtd] = useState('');
  const [projeto, setProjeto] = useState<string | null>(null);
  const [finalidade, setFinalidade] = useState('');
  const [justificativa, setJustificativa] = useState('');
  const [lendo, setLendo] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [sucesso, setSucesso] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  const recarregar = useCallback(async () => {
    if (!lab) return;
    const [e, p, l] = await Promise.all([carregarEstoque(lab.id), listarProjetos(lab.id), listarLocais(lab.id)]);
    setEstoque(e);
    setProjetos(p);
    setLocais(Object.fromEntries(l.map((x) => [x.id, x.nome])));
  }, [lab]);

  useFocusEffect(useCallback(() => { recarregar().catch((e) => setErro(mensagemErro(e))); }, [recarregar]));

  const dia = hoje();
  const item = estoque.find((i) => i.itemId === itemId) ?? null;
  const fefo = useMemo(() => (item ? ordenarFEFO(item.posicoes, dia) : []), [item, dia]);
  const sugerido = fefo[0] ?? null;
  const chave = (p: { loteId: string; localId: string }) => `${p.loteId}|${p.localId}`;
  const escolhida = fefo.find((p) => chave(p) === posicao) ?? sugerido;
  const foraDoFEFO = !!(escolhida && sugerido && (validadeEfetiva(escolhida) ?? '9999') > (validadeEfetiva(sugerido) ?? '9999'));
  const quantidade = lerNumero(qtd);

  function lerLote(loteId: string) {
    setLendo(false);
    const it = estoque.find((i) => i.posicoes.some((p) => p.loteId === loteId));
    if (!it) {
      setErro('Lote lido não tem saldo disponível neste laboratório.');
      return;
    }
    setItemId(it.itemId);
    const p = it.posicoes.find((x) => x.loteId === loteId && saldoDisponivel(x, dia) > 0);
    setPosicao(p ? chave(p) : null);
    if (!p) setErro('Lote lido não está disponível (quarentena, bloqueado, vencido ou em local não conforme).');
  }

  async function confirmar() {
    if (!escolhida || !quantidade || !projeto) return;
    setEnviando(true);
    setErro(null);
    const { error } = await supabase.rpc('fn_dispensar', {
      p_lote: escolhida.loteId, p_local: escolhida.localId, p_qtd: quantidade, p_projeto: projeto,
      p_finalidade: finalidade.trim(), p_justificativa_fefo: foraDoFEFO ? justificativa.trim() : null,
    });
    setEnviando(false);
    if (error) return setErro(mensagemErro(error));
    setSucesso(`Dispensado ${fmtQtd(quantidade, item!.unidade)} do lote ${escolhida.numero}.`);
    setQtd('');
    setJustificativa('');
    setPosicao(null);
    await recarregar();
  }

  return (
    <Tela titulo="Dispensar" voltar>
      {sucesso ? <Aviso tom="ok">{sucesso}</Aviso> : null}
      {erro ? <Aviso>{erro}</Aviso> : null}

      {lendo ? (
        <LeitorQR onLote={lerLote} onCancelar={() => setLendo(false)} />
      ) : (
        <Botao tipo="secundario" titulo="Ler QR do lote" icone={<ScanLine size={20} color="rgb(138 149 143)" />} onPress={() => { setErro(null); setSucesso(null); setLendo(true); }} />
      )}

      {!item ? (
        <View className="gap-2">
          <Campo rotulo="Ou busque o item" placeholder="Nome ou código" value={busca} onChangeText={setBusca} />
          {estoque
            .filter((i) => i.disponivel > 0 && (!busca || `${i.nome} ${i.codigo}`.toLowerCase().includes(busca.toLowerCase())))
            .slice(0, 20)
            .map((i) => (
              <Card key={i.itemId} onPress={() => setItemId(i.itemId)}>
                <T v="subtitle">{i.nome}</T>
                <T v="caption">Disponível {fmtQtd(i.disponivel, i.unidade)}</T>
              </Card>
            ))}
        </View>
      ) : (
        <View className="gap-4">
          <Card className="gap-1">
            <T v="subtitle">{item.nome}</T>
            <T v="caption">Disponível {fmtQtd(item.disponivel, item.unidade)}</T>
            <Botao tipo="secundario" titulo="Trocar item" onPress={() => { setItemId(null); setPosicao(null); }} />
          </Card>

          <T v="label">Lote (ordem FEFO)</T>
          {fefo.length === 0 ? <Aviso tom="warn">Nenhum lote disponível para este item.</Aviso> : null}
          {fefo.map((p) => {
            const sel = escolhida && chave(p) === chave(escolhida);
            return (
              <Card key={chave(p)} onPress={() => setPosicao(chave(p))} className={`gap-1 ${sel ? 'border-2 border-primary bg-primary-soft' : ''}`}>
                <View className="flex-row flex-wrap items-center gap-2">
                  <T v="code">Lote {p.numero}</T>
                  <SeloLote status={p.status} />
                  {sugerido && chave(p) === chave(sugerido) ? <Selo tom="primary" texto="Sugerido FEFO" /> : null}
                </View>
                <T v="caption">{locais[p.localId] ?? ''} · validade {fmtData(validadeEfetiva(p))} · disponível {fmtQtd(saldoDisponivel(p, dia), item.unidade)}</T>
              </Card>
            );
          })}

          {foraDoFEFO ? (
            <Campo rotulo="Justificativa para não usar o lote FEFO" value={justificativa} onChangeText={setJustificativa} ajuda="Obrigatória: existe lote que vence antes." multiline />
          ) : null}
          <Campo rotulo={`Quantidade (${item.unidade})`} keyboardType="decimal-pad" value={qtd} onChangeText={setQtd}
            erro={quantidade != null && escolhida && quantidade > saldoDisponivel(escolhida, dia) ? 'Maior que o disponível no lote.' : null} />
          <Opcoes rotulo="Projeto" valor={projeto} opcoes={projetos.map((p) => ({ valor: p.id, rotulo: p.nome }))} onChange={setProjeto} />
          {projetos.length === 0 ? <T v="caption">Cadastre um projeto antes de dispensar.</T> : null}
          <Campo rotulo="Finalidade" placeholder="Ex.: cultivo de linhagem HeLa" value={finalidade} onChangeText={setFinalidade} />
          <Botao
            titulo="Confirmar dispensação"
            onPress={confirmar}
            carregando={enviando}
            desabilitado={!escolhida || !quantidade || quantidade <= 0 || !projeto || !finalidade.trim() || (foraDoFEFO && !justificativa.trim())}
          />
        </View>
      )}
    </Tela>
  );
}
