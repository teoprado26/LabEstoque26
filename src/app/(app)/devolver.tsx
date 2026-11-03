// Devolução: o material volta como lote derivado BLOQUEADO até o gestor avaliar (reintegrar ou descartar).
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { EscolherItem } from '@/components/Escolher';
import { Aviso, Botao, Campo, Card, Carregando, Opcoes, Selecionar, SeloLote, Tela, T } from '@/components/ui';
import { ROTULO_CONDICAO, devolver } from '@/data/operacoes';
import { listarLotesDoItem, type LoteDoItem } from '@/data/rastreabilidade';
import { useEstoque } from '@/data/useEstoque';
import { lerNumero } from '@/domain/entrada';
import { fmtData, fmtQtd } from '@/domain/formato';
import { CONDICOES_DEVOLUCAO, type CondicaoDevolucao } from '@/domain/tipos';
import { mensagemErro } from '@/lib/supabase';

export default function Devolver() {
  const params = useLocalSearchParams<{ item?: string }>();
  const { estoque, locais, erro: erroCarga } = useEstoque();
  const [itemId, setItemId] = useState<string | null>(params.item ?? null);
  const [lotes, setLotes] = useState<LoteDoItem[]>([]);
  const [lote, setLote] = useState<string | null>(null);
  const [local, setLocal] = useState<string | null>(null);
  const [qtd, setQtd] = useState('');
  const [condicao, setCondicao] = useState<CondicaoDevolucao | null>(null);
  const [obs, setObs] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    if (!itemId) return;
    // Só lotes originais (não as próprias devoluções) podem receber devolução.
    listarLotesDoItem(itemId).then((ls) => setLotes(ls.filter((l) => !l.lote_origem_id))).catch((e) => setErro(mensagemErro(e)));
  }, [itemId]);

  if (!estoque) return erroCarga ? <Tela titulo="Devolver" voltar><Aviso>{erroCarga}</Aviso></Tela> : <Carregando />;
  const item = estoque.find((i) => i.itemId === itemId) ?? null;
  const quantidade = lerNumero(qtd);
  const l = lotes.find((x) => x.id === lote);
  const pendencia = !lote ? 'Escolha o lote de onde o material saiu.' : !local ? 'Escolha onde o material ficará guardado.'
    : !quantidade || quantidade <= 0 ? 'Informe a quantidade devolvida.' : !condicao ? 'Informe a condição do material.' : null;

  async function enviar() {
    if (!lote || !local || !quantidade || !condicao) return;
    setEnviando(true);
    setErro(null);
    try {
      await devolver({ lote, local, qtd: quantidade, condicao, observacao: obs.trim() || null });
      setOk(`Devolução de ${fmtQtd(quantidade, item!.unidade)} registrada. O material fica BLOQUEADO até a avaliação do gestor.`);
      setQtd(''); setCondicao(null); setObs(''); setLote(null);
    } catch (e) {
      setErro(mensagemErro(e));
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Tela titulo="Devolver" voltar>
      <T v="caption">Para material dispensado que não foi usado. Ele não volta direto para o disponível: entra bloqueado e o gestor decide se reintegra ou descarta.</T>
      {ok ? <Aviso tom="ok">{ok}</Aviso> : null}
      {erro ? <Aviso>{erro}</Aviso> : null}
      {!item ? (
        <EscolherItem itens={estoque} onEscolher={setItemId} filtro={(i) => i.ativo} vazio="Nenhum item ativo." />
      ) : (
        <View className="gap-4">
          <Card className="gap-1">
            <T v="subtitle">{item.nome}</T>
            <Botao tipo="sutil" titulo="Trocar item" onPress={() => { setItemId(null); setLote(null); }} />
          </Card>
          <T v="label">Lote de origem</T>
          {lotes.length === 0 ? <T v="caption">Nenhum lote registrado para este item.</T> : null}
          {lotes.map((x) => (
            <Card key={x.id} selecionado={lote === x.id} onPress={() => setLote(x.id)} className="gap-1">
              <View className="flex-row flex-wrap items-center gap-2"><T v="code">Lote {x.numero}</T><SeloLote status={x.status} /></View>
              <T v="caption">Validade {fmtData(x.validade)}</T>
            </Card>
          ))}
          <Selecionar rotulo="Guardar em" valor={local} onChange={setLocal} permitirVazio={false} opcoes={locais.map((x) => ({ valor: x.id, rotulo: x.nome }))} />
          <Campo rotulo={`Quantidade devolvida (${item.unidade})`} keyboardType="decimal-pad" value={qtd} onChangeText={setQtd} />
          <Opcoes rotulo="Condição" valor={condicao} onChange={setCondicao} opcoes={CONDICOES_DEVOLUCAO.map((c) => ({ valor: c, rotulo: ROTULO_CONDICAO[c] }))} />
          <Campo rotulo="Observação" value={obs} onChangeText={setObs} multiline />
          {pendencia ? <T v="caption">{pendencia}</T> : null}
          <Botao titulo="Registrar devolução" onPress={enviar} carregando={enviando} desabilitado={!!pendencia} />
          {l ? <Botao tipo="sutil" titulo="Ver rastreabilidade do lote" onPress={() => router.push(`/lote/${l.id}`)} /> : null}
        </View>
      )}
    </Tela>
  );
}
