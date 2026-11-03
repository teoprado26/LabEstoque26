// Avaliação de devoluções pelo gestor: reintegrar (volta a LIBERADO/ABERTO) ou descartar (perda + BAIXADO).
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { View } from 'react-native';
import { ButtonGroup } from '@/components/sds';
import { Aviso, Botao, Campo, Card, Carregando, Selo, Tela, T } from '@/components/ui';
import { ROTULO_CONDICAO, avaliarDevolucao } from '@/data/operacoes';
import { fmtDataHora, fmtQtd } from '@/domain/formato';
import type { CondicaoDevolucao } from '@/domain/tipos';
import { useSessao } from '@/lib/sessao';
import { mensagemErro, supabase } from '@/lib/supabase';

interface Dev {
  id: string;
  condicao: CondicaoDevolucao;
  observacao: string | null;
  movimentacoes: { quantidade: number; ocorrido_em: string; lote_id: string; itens: { nome: string; unidade_estoque: string }; lotes: { numero: string } };
}

export default function Devolucoes() {
  const { lab, pode } = useSessao();
  const [lista, setLista] = useState<Dev[] | null>(null);
  const [obs, setObs] = useState<Record<string, string>>({});
  const [erro, setErro] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    if (!lab) return;
    const { data, error } = await supabase.from('devolucoes')
      .select('id, condicao, observacao, movimentacoes!devolucoes_movimentacao_id_fkey ( quantidade, ocorrido_em, lote_id, itens ( nome, unidade_estoque ), lotes ( numero ) )')
      .eq('lab_id', lab.id).is('avaliacao', null);
    if (error) setErro(error.message);
    else setLista(data as unknown as Dev[]);
  }, [lab]);

  useFocusEffect(useCallback(() => { carregar(); }, [carregar]));

  async function decidir(d: Dev, avaliacao: 'reintegrar' | 'descartar') {
    setErro(null);
    try {
      await avaliarDevolucao(d.id, avaliacao, obs[d.id]?.trim() || null);
      setOk(avaliacao === 'reintegrar' ? `${d.movimentacoes.itens.nome}: reintegrado ao estoque.` : `${d.movimentacoes.itens.nome}: descartado e registrado como perda.`);
      await carregar();
    } catch (e) {
      setErro(mensagemErro(e));
    }
  }

  if (!lista) return erro ? <Tela titulo="Devoluções" voltar><Aviso>{erro}</Aviso></Tela> : <Carregando />;

  return (
    <Tela titulo="Devoluções" voltar>
      <T v="caption">Material devolvido fica bloqueado até a decisão. Reintegrar devolve ao uso (aberto, se veio aberto). Descartar registra a perda como descarte técnico.</T>
      {ok ? <Aviso tom="ok">{ok}</Aviso> : null}
      {erro ? <Aviso>{erro}</Aviso> : null}
      {lista.length === 0 ? <T v="caption">Nenhuma devolução aguardando avaliação.</T> : null}
      {lista.map((d) => (
        <Card key={d.id} className="gap-2">
          <T v="subtitle">{d.movimentacoes.itens.nome}</T>
          <View className="flex-row flex-wrap items-center gap-2">
            <Selo tom="crit" texto="BLOQUEADO" />
            <Selo tom={d.condicao === 'integro_fechado' ? 'ok' : 'warn'} texto={ROTULO_CONDICAO[d.condicao]} />
          </View>
          <T v="caption">{fmtQtd(Number(d.movimentacoes.quantidade), d.movimentacoes.itens.unidade_estoque)} · lote {d.movimentacoes.lotes.numero} · {fmtDataHora(d.movimentacoes.ocorrido_em)}</T>
          {d.observacao ? <T v="caption">{d.observacao}</T> : null}
          <Botao tipo="sutil" titulo="Ver rastreabilidade" onPress={() => router.push(`/lote/${d.movimentacoes.lote_id}`)} />
          {pode('gestor') ? (
            <>
              <Campo rotulo="Observação da avaliação" value={obs[d.id] ?? ''} onChangeText={(t) => setObs((o) => ({ ...o, [d.id]: t }))} />
              <ButtonGroup>
                <Botao titulo="Reintegrar" onPress={() => decidir(d, 'reintegrar')} />
                <Botao tipo="perigo" titulo="Descartar" onPress={() => decidir(d, 'descartar')} />
              </ButtonGroup>
            </>
          ) : <T v="caption">A avaliação é feita pelo gestor de estoque.</T>}
        </Card>
      ))}
    </Tela>
  );
}
