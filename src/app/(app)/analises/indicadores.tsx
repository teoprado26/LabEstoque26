// Indicadores completos, agrupados por tema (as mesmas abas do painel da especificação).
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { View } from 'react-native';
import { KpiCard } from '@/components/KpiCard';
import { Aviso, Carregando, Opcoes, Tela, T } from '@/components/ui';
import { carregarIndicadores, type Indicadores } from '@/data/servicoAnalises';
import { ultimosDias } from '@/data/servicoKpis';
import { ETAPAS_CICLO } from '@/kpis/calculosFase2';
import { fmtData, fmtDataHora, fmtMoeda, fmtNumero, fmtPct } from '@/domain/formato';
import { useSessao } from '@/lib/sessao';
import { mensagemErro } from '@/lib/supabase';

type Aba = 'atendimento' | 'estoque' | 'perdas' | 'confiabilidade' | 'abastecimento';
const ROTULO_ETAPA: Record<string, string> = { aprovacao: 'aprovação', compra: 'processamento da compra', entrega: 'entrega', conferencia: 'conferência', liberacao: 'liberação' };
const n = (v: number | null | undefined, casas = 0) => (v == null ? '—' : fmtNumero(v, casas));

export default function IndicadoresTela() {
  const { lab } = useSessao();
  const [dias, setDias] = useState<'30' | '90' | '180' | '365'>('90');
  const [aba, setAba] = useState<Aba>('atendimento');
  const [d, setD] = useState<Indicadores | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  useFocusEffect(useCallback(() => {
    if (!lab) return;
    setD(null);
    carregarIndicadores(lab.id, ultimosDias(Number(dias))).then(setD).catch((e) => setErro(mensagemErro(e)));
  }, [lab, dias]));

  const a = d?.atual ?? {};
  const p = d?.anterior ?? {};
  const k = (id: string, detalhe?: string, rotulo?: string) => (a[id] ? <KpiCard key={id} r={a[id]} anterior={p[id]} detalhe={detalhe} rotulo={rotulo} /> : null);

  return (
    <Tela titulo="Indicadores" voltar>
      <Opcoes rotulo="Período" valor={dias} onChange={setDias} opcoes={[
        { valor: '30', rotulo: '30 dias' }, { valor: '90', rotulo: '90 dias' }, { valor: '180', rotulo: '180 dias' }, { valor: '365', rotulo: '12 meses' },
      ]} />
      <Opcoes rotulo="Tema" valor={aba} onChange={setAba} opcoes={[
        { valor: 'atendimento', rotulo: 'Atendimento' }, { valor: 'estoque', rotulo: 'Estoque e reposição' }, { valor: 'perdas', rotulo: 'Perdas e validade' },
        { valor: 'confiabilidade', rotulo: 'Confiabilidade' }, { valor: 'abastecimento', rotulo: 'Abastecimento' },
      ]} />
      {erro ? <Aviso>{erro}</Aviso> : null}
      {!d ? <Carregando /> : (
        <View className="gap-4">
          <T v="caption">{fmtData(d.periodo.de)} a {fmtData(d.periodo.ate)} · comparado ao período anterior · atualizado em {fmtDataHora(d.atualizadoEm)}</T>
          {aba === 'atendimento' ? (
            <>
              {k('K01', `Itens vitais: ${a.K01?.extra?.vitais == null ? 'dados insuficientes' : fmtPct(a.K01.extra.vitais)}.`)}
              {k('K02')}{k('K03')}{k('K04')}
              {k('K05', a.K05?.extra ? `${n(a.K05.extra.eventos)} eventos · duração média ${n(a.K05.extra.duracaoMedia, 1)} dias · ${n(a.K05.extra.eventosPorItem, 2)} eventos por item.` : undefined)}
              {k('K06', a.K06?.extra?.p90 != null ? `P90: ${n(a.K06.extra.p90, 1)} h (9 de cada 10 requisições foram atendidas em até esse tempo).` : undefined, 'Tempo de atendimento (mediana)')}
            </>
          ) : null}
          {aba === 'estoque' ? (
            <>
              {k('K07', 'Mediana da cobertura dos itens com histórico suficiente. Veja cada item na ficha do produto.', 'Cobertura (mediana dos itens)')}
              {k('K08', a.K08?.extra ? `${n(a.K08.extra.vitais)} vitais com cobertura menor que o lead time.` : undefined)}
              {k('K09', a.K09?.extra ? `${a.K09.extra.vitais} vitais · ${a.K09.extra.semParametro} sem ponto de reposição.` : undefined)}
              {k('K10', a.K10?.extra?.tempoMedioDias != null ? `Tempo médio em estoque: ${n(a.K10.extra.tempoMedioDias)} dias.` : undefined)}
              {k('K11', a.K11?.extra ? `Valor imobilizado: ${fmtMoeda(a.K11.extra.valorImobilizado ?? 0)}.` : undefined)}
              {k('K12')}
            </>
          ) : null}
          {aba === 'perdas' ? (
            <>
              {k('K13')}{k('K14')}
              {k('K15', a.K15?.extra ? `30 dias: ${fmtMoeda(a.K15.extra.h30 ?? 0)} · 60 dias: ${fmtMoeda(a.K15.extra.h60 ?? 0)} · 90 dias: ${fmtMoeda(a.K15.extra.h90 ?? 0)}.` : undefined, 'Valor em risco de vencimento (90 dias)')}
            </>
          ) : null}
          {aba === 'confiabilidade' ? <>{k('K16')}{k('K17')}{k('K18')}{k('K19')}</> : null}
          {aba === 'abastecimento' ? (
            <>
              {k('K20', a.K20?.extra ? `P90: ${n(a.K20.extra.p90, 1)} dias · desvio-padrão ${n(a.K20.extra.desvio, 1)} dias.` : undefined, 'Lead time do fornecedor (mediana)')}
              {k('K21', a.K21?.valor != null ? `Etapas (mediana em dias): ${ETAPAS_CICLO.map((e) => `${ROTULO_ETAPA[e]} ${n(a.K21.extra?.[e], 1)}`).join(' · ')}. Gargalo: ${ROTULO_ETAPA[ETAPAS_CICLO[Number(a.K21.extra?.gargalo ?? 0)]]}.` : undefined, 'Ciclo total de abastecimento (mediana)')}
              {k('K22')}
            </>
          ) : null}
        </View>
      )}
    </Tela>
  );
}
