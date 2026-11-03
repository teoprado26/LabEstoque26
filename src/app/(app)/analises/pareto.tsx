// Pareto (componente único): escolha o tema e a métrica; destaque das causas que somam até 80%.
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { View } from 'react-native';
import { GraficoPareto } from '@/components/graficos';
import { Aviso, Card, Carregando, Opcoes, Selecionar, Selo, Tela, T } from '@/components/ui';
import { carregarPareto } from '@/data/servicoAnalises';
import { ultimosDias } from '@/data/servicoKpis';
import { METRICAS_DO_TEMA, TEMAS_PARETO, pareto, type LinhaPareto, type MetricaPareto, type TemaPareto } from '@/domain/pareto';
import { fmtMoeda, fmtNumero, fmtPct } from '@/domain/formato';
import { useSessao } from '@/lib/sessao';
import { mensagemErro } from '@/lib/supabase';

const ROTULO_METRICA: Record<MetricaPareto, string> = { frequencia: 'Ocorrências', quantidade: 'Quantidade', valor: 'Valor (R$)' };

export default function ParetoTela() {
  const { lab } = useSessao();
  const [tema, setTema] = useState<TemaPareto>('causas_perda');
  const [metrica, setMetrica] = useState<MetricaPareto>('valor');
  const [dias, setDias] = useState<'90' | '180' | '365'>('180');
  const [linhas, setLinhas] = useState<LinhaPareto[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  useFocusEffect(useCallback(() => {
    if (!lab) return;
    setLinhas(null);
    carregarPareto(lab.id, tema, ultimosDias(Number(dias))).then(setLinhas).catch((e) => setErro(mensagemErro(e)));
  }, [lab, tema, dias]));

  const metricas = METRICAS_DO_TEMA[tema];
  const m = metricas.includes(metrica) ? metrica : metricas[0];
  const barras = linhas ? pareto(linhas, m) : [];
  const fmt = (v: number) => (m === 'valor' ? fmtMoeda(v) : m === 'quantidade' && tema === 'atrasos_fornecedor' ? `${fmtNumero(v)} dias de atraso` : fmtNumero(v, v % 1 ? 1 : 0));
  const vitais = barras.filter((b) => b.vital);

  return (
    <Tela titulo="Pareto" voltar>
      <T v="caption">Em geral, poucas causas explicam a maior parte do problema. As barras escuras somam até 80% do total: atacar essas primeiro rende mais.</T>
      <Selecionar rotulo="Tema" valor={tema} permitirVazio={false} onChange={(v) => setTema(v as TemaPareto)}
        opcoes={(Object.keys(TEMAS_PARETO) as TemaPareto[]).map((t) => ({ valor: t, rotulo: TEMAS_PARETO[t] }))} />
      <Opcoes rotulo="Medir por" valor={m} onChange={setMetrica} opcoes={metricas.map((x) => ({ valor: x, rotulo: ROTULO_METRICA[x] }))} />
      <Opcoes rotulo="Período" valor={dias} onChange={setDias} opcoes={[{ valor: '90', rotulo: '90 dias' }, { valor: '180', rotulo: '180 dias' }, { valor: '365', rotulo: '12 meses' }]} />
      {erro ? <Aviso>{erro}</Aviso> : null}
      {tema === 'nao_conformidades_armazenamento' ? <Aviso tom="warn">As verificações de armazenamento entram na Fase 3; ainda não há dados para este tema.</Aviso> : null}
      {!linhas ? <Carregando /> : barras.length === 0 ? <T v="caption">Sem registros para este tema no período.</T> : (
        <>
          <Card className="gap-2">
            <T v="label">{TEMAS_PARETO[tema]} · {ROTULO_METRICA[m].toLowerCase()}</T>
            <GraficoPareto barras={barras} formatar={fmt} />
          </Card>
          <Aviso tom="warn">{vitais.length} de {barras.length} {vitais.length === 1 ? 'categoria explica' : 'categorias explicam'} {fmtPct(vitais[vitais.length - 1]?.acumulado ?? 0, 0)} do total: {vitais.map((b) => b.categoria).join(', ')}.</Aviso>
          <Card className="gap-1">
            <T v="label">Tabela</T>
            {barras.map((b, i) => (
              <View key={b.categoria} className="flex-row items-center gap-2 border-t border-default py-2">
                <T v="code" className="w-6">{i + 1}</T>
                <T v="body" className="flex-1" numberOfLines={2}>{b.categoria}</T>
                <View className="items-end">
                  <T v="caption" className="text-default">{fmt(b.valor)}</T>
                  <T v="caption">{fmtPct(b.participacao)} · acum. {fmtPct(b.acumulado)}</T>
                </View>
                {b.vital ? <Selo tom="primary" texto="80%" /> : null}
              </View>
            ))}
          </Card>
        </>
      )}
    </Tela>
  );
}
