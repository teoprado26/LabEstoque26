// Diagrama de Pareto (seção 9.2): um único cálculo para todos os temas e métricas.

export const TEMAS_PARETO = {
  causas_perda: 'Causas de perda',
  causas_ruptura: 'Causas de ruptura',
  motivos_nao_atendimento: 'Motivos de não atendimento',
  atrasos_fornecedor: 'Atrasos por fornecedor',
  divergencias_inventario: 'Divergências de inventário',
  itens_maior_consumo: 'Itens de maior consumo',
  itens_maior_custo: 'Itens de maior custo',
  nao_conformidades_armazenamento: 'Não conformidades de armazenamento',
} as const;
export type TemaPareto = keyof typeof TEMAS_PARETO;

export type MetricaPareto = 'frequencia' | 'quantidade' | 'valor';

/** Métricas que fazem sentido em cada tema (ex.: atraso não tem valor em R$). */
export const METRICAS_DO_TEMA: Record<TemaPareto, MetricaPareto[]> = {
  causas_perda: ['valor', 'frequencia', 'quantidade'],
  causas_ruptura: ['frequencia', 'quantidade'],
  motivos_nao_atendimento: ['frequencia', 'quantidade'],
  atrasos_fornecedor: ['quantidade', 'frequencia'],
  divergencias_inventario: ['valor', 'frequencia', 'quantidade'],
  itens_maior_consumo: ['quantidade', 'frequencia', 'valor'],
  itens_maior_custo: ['valor'],
  nao_conformidades_armazenamento: ['frequencia'],
};

export interface LinhaPareto {
  categoria: string;
  frequencia: number;
  quantidade: number;
  valor: number;
}

export interface BarraPareto {
  categoria: string;
  valor: number;
  participacao: number;
  acumulado: number;
  /** Faz parte do grupo que soma até 80% (o "poucos vitais"). */
  vital: boolean;
}

export function pareto(linhas: LinhaPareto[], metrica: MetricaPareto, corte = 80): BarraPareto[] {
  const ls = linhas
    .map((l) => ({ categoria: l.categoria, valor: Number(l[metrica]) }))
    .filter((l) => l.valor > 0)
    .sort((a, b) => b.valor - a.valor || a.categoria.localeCompare(b.categoria));
  const total = ls.reduce((s, l) => s + l.valor, 0);
  if (!total) return [];
  let acum = 0;
  return ls.map((l) => {
    const antes = acum;
    acum += (l.valor / total) * 100;
    // Destaca até a categoria que faz o acumulado cruzar o corte (inclusive).
    return { ...l, participacao: (l.valor / total) * 100, acumulado: Math.min(100, acum), vital: antes < corte };
  });
}
