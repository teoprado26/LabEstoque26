import { Info } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { KPI_POR_ID } from '@/kpis/catalog';
import { statusDoKpi, variacao, type KpiResultado } from '@/kpis/resultado';
import { fmtMoeda, fmtNumero, fmtPct } from '@/domain/formato';
import { useCor } from './sds';
import { Card, SeloDado, SeloStatus, T } from './ui';

export function formatarValor(id: string, valor: number): string {
  const u = KPI_POR_ID[id].unidade;
  if (u === '%') return fmtPct(valor);
  if (u === 'R$') return fmtMoeda(valor);
  if (u === 'dias') return `${fmtNumero(valor)} dias`;
  return fmtNumero(valor);
}

export function KpiCard({ r, anterior, rotulo, detalhe }: { r: KpiResultado; anterior?: KpiResultado; rotulo?: string; detalhe?: string }) {
  const def = KPI_POR_ID[r.id];
  const [metodologia, setMetodologia] = useState(false);
  const cor = useCor();
  const status = statusDoKpi(def, r.valor);
  const delta = variacao(r.valor, anterior?.valor ?? null);

  return (
    <Card className="gap-2">
      <View className="flex-row items-start justify-between gap-2">
        <T v="label" className="flex-1">{rotulo ?? def.nome}</T>
        <Pressable
          onPress={() => setMetodologia((m) => !m)}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel={`Metodologia de ${def.nome}`}
        >
          <Info size={18} color={cor('icon-secondary')} />
        </Pressable>
      </View>

      {r.valor == null ? (
        <T v="subtitle" className="text-secondary">Dados insuficientes</T>
      ) : (
        <T v="kpi">{formatarValor(r.id, r.valor)}</T>
      )}

      <View className="flex-row flex-wrap items-center gap-2">
        <SeloStatus status={status} />
        <SeloDado selo={r.selo} />
        <T v="caption">n = {r.n}</T>
      </View>

      {delta != null ? (
        <T v="caption">
          {delta >= 0 ? '▲' : '▼'} {def.unidade === '%' ? `${fmtNumero(Math.abs(delta), 1)} p.p.` : formatarValor(r.id, Math.abs(delta))} vs. período anterior
        </T>
      ) : null}
      {detalhe ? <T v="caption">{detalhe}</T> : null}
      {def.meta != null ? <T v="caption">Meta: {def.polaridade === 'menor_melhor' ? '≤' : '≥'} {formatarValor(r.id, def.meta)}</T> : null}

      {metodologia ? (
        <View className="gap-1 rounded-md bg-secondary p-3">
          <T v="caption" className="text-default">{def.formula}</T>
          <T v="caption">{def.metodologia}</T>
        </View>
      ) : null}
    </Card>
  );
}
