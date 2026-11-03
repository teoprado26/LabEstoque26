import { Info } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { KPI_POR_ID } from '@/kpis/catalog';
import { statusDoKpi, variacao, type KpiResultado } from '@/kpis/resultado';
import { fmtMoeda, fmtNumero, fmtPct } from '@/domain/formato';
import { Meter, useCor } from './sds';
import { Card, SeloDado, SeloStatus, T } from './ui';

export function formatarValor(id: string, valor: number): string {
  const u = KPI_POR_ID[id].unidade;
  if (u === '%') return fmtPct(valor);
  if (u === 'R$') return fmtMoeda(valor);
  if (u === 'dias') return `${fmtNumero(valor, valor < 10 ? 1 : 0)} dias`;
  if (u === 'h') return `${fmtNumero(valor, valor < 10 ? 1 : 0)} h`;
  if (u === 'giro') return `${fmtNumero(valor, 1)}× ao ano`;
  if (u === 'itens') return `${fmtNumero(valor)} ${valor === 1 ? 'item' : 'itens'}`;
  return fmtNumero(valor);
}

const LEITURA = { maior_melhor: 'Quanto maior, melhor', menor_melhor: 'Quanto menor, melhor', tendencia_queda: 'O ideal é cair com o tempo', informativo: 'Informativo' } as const;

/** Card de KPI didático: o que é, valor, meta, leitura, tendência e metodologia (ⓘ). */
export function KpiCard({ r, anterior, rotulo, detalhe }: { r: KpiResultado; anterior?: KpiResultado; rotulo?: string; detalhe?: string }) {
  const def = KPI_POR_ID[r.id];
  const [metodologia, setMetodologia] = useState(false);
  const cor = useCor();
  const status = statusDoKpi(def, r.valor);
  const delta = variacao(r.valor, anterior?.valor ?? null);
  const melhorou = delta == null || delta === 0 ? null : def.polaridade === 'menor_melhor' || def.polaridade === 'tendencia_queda' ? delta < 0 : delta > 0;
  const tomBarra = status === 'ok' ? 'positive' : status === 'alerta' ? 'warning' : status === 'critico' ? 'danger' : 'brand';

  return (
    <Card className="gap-2">
      <View className="flex-row items-start justify-between gap-2">
        <T v="label" className="flex-1">{rotulo ?? def.nome}</T>
        <Pressable onPress={() => setMetodologia((m) => !m)} hitSlop={12} accessibilityRole="button" accessibilityLabel={`Como é calculado: ${def.nome}`}>
          <Info size={18} color={cor('icon-secondary')} />
        </Pressable>
      </View>
      <T v="caption">{def.objetivo}</T>

      {r.valor == null ? (
        <View className="gap-1">
          <T v="subtitle" className="text-secondary">Dados insuficientes</T>
          <T v="caption">Ainda não há registros suficientes no período para calcular com segurança.</T>
        </View>
      ) : (
        <T v="kpi">{formatarValor(r.id, r.valor)}</T>
      )}

      {r.valor != null && def.unidade === '%' ? (
        <View className="gap-1 py-1">
          <Meter valor={r.valor} meta={def.meta} tom={tomBarra} label={`${def.nome}: ${fmtPct(r.valor)}`} />
          {def.meta != null ? <T v="caption">A marca na barra é a meta ({def.polaridade === 'menor_melhor' ? '≤' : '≥'} {fmtPct(def.meta, 0)}).</T> : null}
        </View>
      ) : null}

      <View className="flex-row flex-wrap items-center gap-2">
        <SeloStatus status={status} />
        <SeloDado selo={r.selo} />
        <T v="caption">n = {r.n}</T>
      </View>

      <T v="caption">
        {LEITURA[def.polaridade]}
        {def.meta != null && def.unidade !== '%' ? ` · meta ${def.polaridade === 'menor_melhor' ? '≤' : '≥'} ${formatarValor(r.id, def.meta)}` : ''}
      </T>
      {delta != null ? (
        <T v="caption">
          {delta >= 0 ? '▲' : '▼'} {def.unidade === '%' ? `${fmtNumero(Math.abs(delta), 1)} p.p.` : formatarValor(r.id, Math.abs(delta))} em relação ao período anterior
          {melhorou == null ? '' : melhorou ? ' (melhorou)' : ' (piorou)'}
        </T>
      ) : null}
      {detalhe ? <T v="caption">{detalhe}</T> : null}

      {metodologia ? (
        <View className="gap-1 rounded-md bg-secondary p-3">
          <T v="label">Como é calculado</T>
          <T v="caption" className="text-default">{def.formula}</T>
          <T v="caption" className="text-default">{def.metodologia}</T>
        </View>
      ) : null}
    </Card>
  );
}
