import type { KpiDef } from './catalog';

export type Selo = 'Real' | 'Estimado' | 'Projetado' | 'Dados insuficientes';
export type StatusKpi = 'ok' | 'alerta' | 'critico' | 'neutro';

export interface KpiResultado {
  id: string;
  /** null = Dados insuficientes. Nunca exibir 0% ou 100% no lugar. */
  valor: number | null;
  numerador: number | null;
  denominador: number | null;
  n: number;
  selo: Selo;
  /** Ids dos registros que compõem o valor (para o detalhamento e o Excel). */
  registros?: string[];
  extra?: Record<string, number | null>;
}

export function insuficiente(id: string, n = 0): KpiResultado {
  return { id, valor: null, numerador: null, denominador: null, n, selo: 'Dados insuficientes' };
}

/** Razão × 100 com regra de amostra mínima: denominador 0 ou n < mínimo → Dados insuficientes. */
export function percentual(
  id: string,
  numerador: number,
  denominador: number,
  n: number,
  minimo: number,
  selo: Exclude<Selo, 'Dados insuficientes'> = 'Real',
): KpiResultado {
  if (denominador <= 0 || n < Math.max(1, minimo)) return insuficiente(id, n);
  return { id, valor: (numerador / denominador) * 100, numerador, denominador, n, selo };
}

export interface Meta {
  meta: number | null;
  limiteAlerta: number | null;
}

export function statusDoKpi(def: KpiDef, valor: number | null, override?: Partial<Meta>): StatusKpi {
  const meta = override?.meta !== undefined ? override.meta : def.meta;
  const limite = override?.limiteAlerta !== undefined ? override.limiteAlerta : def.limiteAlerta;
  if (valor == null || meta == null) return 'neutro';
  if (def.polaridade === 'maior_melhor') {
    if (valor >= meta) return 'ok';
    return limite != null && valor >= limite ? 'alerta' : 'critico';
  }
  if (def.polaridade === 'menor_melhor') {
    if (valor <= meta) return 'ok';
    return limite != null && valor <= limite ? 'alerta' : 'critico';
  }
  return 'neutro';
}

/** Variação em relação ao período anterior, em pontos (para %) ou relativa (demais). */
export function variacao(atual: number | null, anterior: number | null): number | null {
  if (atual == null || anterior == null) return null;
  return atual - anterior;
}
