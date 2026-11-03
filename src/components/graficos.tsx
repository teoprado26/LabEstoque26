// Gráficos em SVG (react-native-svg), um eixo só, marcas finas, toque para detalhar e tabela ao lado.
// Cores de série da paleta validada do guia de visualização (série 1 azul, série 2 laranja), por tema.
import { useColorScheme } from 'nativewind';
import { useState } from 'react';
import { View, type LayoutChangeEvent } from 'react-native';
import Svg, { Circle, G, Line, Path, Rect, Text as SvgText } from 'react-native-svg';
import type { BarraPareto } from '@/domain/pareto';
import type { LinhaABC } from '@/domain/abc';
import { fmtNumero, fmtPct } from '@/domain/formato';
import { useCor } from './sds';
import { T } from './ui';

const SERIE = {
  light: { s1: '#2a78d6', s1claro: '#86b6ef', s2: '#eb6834' },
  dark: { s1: '#3987e5', s1claro: '#184f95', s2: '#d95926' },
};

function useSerie() {
  const { colorScheme } = useColorScheme();
  return SERIE[colorScheme === 'dark' ? 'dark' : 'light'];
}

function useLargura(inicial = 320) {
  const [w, setW] = useState(inicial);
  return { w, onLayout: (e: LayoutChangeEvent) => setW(Math.max(200, e.nativeEvent.layout.width)) };
}

/** Topo arredondado em 4px e base reta na linha de base. */
const barra = (x: number, y: number, larg: number, alt: number) => {
  const r = Math.min(4, larg / 2, alt);
  return `M${x},${y + alt} L${x},${y + r} Q${x},${y} ${x + r},${y} L${x + larg - r},${y} Q${x + larg},${y} ${x + larg},${y + r} L${x + larg},${y + alt} Z`;
};

// ---------------------------------------------------------------- Pareto
export function GraficoPareto({ barras, formatar }: { barras: BarraPareto[]; formatar: (v: number) => string }) {
  const { w, onLayout } = useLargura();
  const cor = useCor();
  const s = useSerie();
  const [sel, setSel] = useState<number | null>(null);
  const H = 220, esq = 36, dir = 8, topo = 12, base = 24;
  const lista = barras.slice(0, 12);
  const n = Math.max(1, lista.length);
  const passo = (w - esq - dir) / n;
  const larg = Math.max(4, Math.min(32, passo - 4));
  const y = (pct: number) => topo + (1 - pct / 100) * (H - topo - base);
  const cx = (i: number) => esq + passo * i + passo / 2;
  const linha = lista.map((b, i) => `${i ? 'L' : 'M'}${cx(i)},${y(b.acumulado)}`).join(' ');
  const b = sel != null ? lista[sel] : null;

  return (
    <View className="gap-2" onLayout={onLayout}>
      <Svg width={w} height={H} accessibilityLabel="Diagrama de Pareto">
        {[0, 50, 100].map((g) => (
          <G key={g}>
            <Line x1={esq} x2={w - dir} y1={y(g)} y2={y(g)} stroke={cor('border-default')} strokeWidth={1} />
            <SvgText x={esq - 6} y={y(g) + 4} fontSize={11} fill={cor('text-secondary')} textAnchor="end">{g}%</SvgText>
          </G>
        ))}
        {/* Referência de 80%: tracejada, recessiva. */}
        <Line x1={esq} x2={w - dir} y1={y(80)} y2={y(80)} stroke={cor('text-secondary')} strokeWidth={1} strokeDasharray="4 4" />
        <SvgText x={w - dir} y={y(80) - 4} fontSize={11} fill={cor('text-secondary')} textAnchor="end">80%</SvgText>
        {lista.map((bb, i) => (
          <G key={bb.categoria} onPress={() => setSel(sel === i ? null : i)}>
            {/* Área de toque maior que a barra. */}
            <Rect x={esq + passo * i} y={topo} width={passo} height={H - topo - base} fill="transparent" />
            <Path d={barra(cx(i) - larg / 2, y(bb.participacao), larg, Math.max(1, y(0) - y(bb.participacao)))} fill={bb.vital ? s.s1 : s.s1claro}
              opacity={sel == null || sel === i ? 1 : 0.5} />
            <SvgText x={cx(i)} y={H - 8} fontSize={11} fill={cor('text-secondary')} textAnchor="middle">{i + 1}</SvgText>
          </G>
        ))}
        <Path d={linha} stroke={s.s2} strokeWidth={2} fill="none" />
        {lista.map((bb, i) => (
          <Circle key={bb.categoria} cx={cx(i)} cy={y(bb.acumulado)} r={4} fill={s.s2} stroke={cor('bg-default')} strokeWidth={2} />
        ))}
      </Svg>
      <View className="flex-row flex-wrap gap-4">
        <Legenda cor={s.s1} rotulo="Participação (grupo até 80%)" />
        <Legenda cor={s.s1claro} rotulo="Participação (demais)" />
        <Legenda cor={s.s2} rotulo="Acumulado" linha />
      </View>
      {b ? (
        <View className="rounded-md border border-default p-3">
          <T v="label">{sel! + 1}. {b.categoria}</T>
          <T v="caption" className="text-default">{formatar(b.valor)} · {fmtPct(b.participacao)} do total · acumulado {fmtPct(b.acumulado)}</T>
        </View>
      ) : <T v="caption">Toque numa barra para ver o valor. Os números no eixo correspondem à tabela abaixo.</T>}
    </View>
  );
}

function Legenda({ cor, rotulo, linha }: { cor: string; rotulo: string; linha?: boolean }) {
  return (
    <View className="flex-row items-center gap-2">
      <View style={{ width: 12, height: linha ? 2 : 12, borderRadius: linha ? 1 : 3, backgroundColor: cor }} />
      <T v="caption">{rotulo}</T>
    </View>
  );
}

// ---------------------------------------------------------------- Curva ABC
export function GraficoCurvaABC({ linhas, cortes = [80, 95] }: { linhas: LinhaABC[]; cortes?: [number, number] }) {
  const { w, onLayout } = useLargura();
  const cor = useCor();
  const s = useSerie();
  const [sel, setSel] = useState<number | null>(null);
  const H = 200, esq = 36, dir = 8, topo = 12, base = 24;
  const n = linhas.length;
  if (!n) return null;
  const x = (i: number) => esq + ((i + 1) / n) * (w - esq - dir);
  const y = (pct: number) => topo + (1 - pct / 100) * (H - topo - base);
  const caminho = `M${esq},${y(0)} ` + linhas.map((l, i) => `L${x(i)},${y(l.acumulado)}`).join(' ');
  const l = sel != null ? linhas[sel] : null;
  return (
    <View className="gap-2" onLayout={onLayout}>
      <Svg width={w} height={H} accessibilityLabel="Curva ABC">
        {[0, 50, 100].map((g) => (
          <G key={g}>
            <Line x1={esq} x2={w - dir} y1={y(g)} y2={y(g)} stroke={cor('border-default')} strokeWidth={1} />
            <SvgText x={esq - 6} y={y(g) + 4} fontSize={11} fill={cor('text-secondary')} textAnchor="end">{g}%</SvgText>
          </G>
        ))}
        {cortes.map((c, k) => (
          <G key={c}>
            <Line x1={esq} x2={w - dir} y1={y(c)} y2={y(c)} stroke={cor('text-secondary')} strokeWidth={1} strokeDasharray="4 4" />
            <SvgText x={w - dir} y={y(c) - 4} fontSize={11} fill={cor('text-secondary')} textAnchor="end">{k === 0 ? 'A' : 'B'} até {c}%</SvgText>
          </G>
        ))}
        <Path d={caminho} stroke={s.s1} strokeWidth={2} fill="none" />
        {linhas.map((li, i) => (
          <G key={li.itemId} onPress={() => setSel(sel === i ? null : i)}>
            <Rect x={x(i) - (w - esq - dir) / n / 2} y={topo} width={(w - esq - dir) / n} height={H - topo - base} fill="transparent" />
            {n <= 40 || sel === i ? <Circle cx={x(i)} cy={y(li.acumulado)} r={sel === i ? 5 : 3} fill={s.s1} stroke={cor('bg-default')} strokeWidth={2} /> : null}
          </G>
        ))}
        <SvgText x={(w + esq) / 2} y={H - 6} fontSize={11} fill={cor('text-secondary')} textAnchor="middle">itens em ordem de valor consumido →</SvgText>
      </Svg>
      {l ? (
        <View className="rounded-md border border-default p-3">
          <T v="label">{l.posicao}. {l.nome} · classe {l.classe}</T>
          <T v="caption" className="text-default">{fmtPct(l.participacao)} do consumo · acumulado {fmtPct(l.acumulado)}</T>
        </View>
      ) : <T v="caption">Toque na curva para ver o item.</T>}
    </View>
  );
}

// ---------------------------------------------------------------- Barras horizontais
/** Uma série, rótulos diretos à esquerda e valor à direita (uma linha por categoria). */
export function BarrasHorizontais({ linhas, formatar, maximo }: { linhas: { rotulo: string; valor: number; destaque?: boolean }[]; formatar: (v: number) => string; maximo?: number }) {
  const s = useSerie();
  const max = maximo ?? Math.max(1, ...linhas.map((l) => l.valor));
  return (
    <View className="gap-3">
      {linhas.map((l) => (
        <View key={l.rotulo} className="gap-1">
          <View className="flex-row justify-between gap-2">
            <T v="caption" className="flex-1 text-default" numberOfLines={1}>{l.rotulo}</T>
            <T v="caption" className="text-default">{formatar(l.valor)}</T>
          </View>
          <View className="h-2 w-full rounded-full bg-secondary">
            <View style={{ width: `${Math.max(1, (l.valor / max) * 100)}%`, backgroundColor: l.destaque ? s.s2 : s.s1, height: 8, borderRadius: 4 }} />
          </View>
        </View>
      ))}
    </View>
  );
}

export const fmtDias = (v: number) => `${fmtNumero(v, v < 10 ? 1 : 0)} dias`;
