// Parâmetros de reposição por item (seção 8).
import type { Criticidade } from './tipos';

export const Z_POR_NIVEL: Record<number, number> = { 0.98: 2.05, 0.95: 1.65, 0.9: 1.28 };
export const NIVEL_PADRAO: Record<Criticidade, number> = { V: 0.98, E: 0.95, D: 0.9 };

export interface SerieConsumo {
  /** Consumo líquido por dia (dispensação − devoluções reintegradas), um valor por dia da janela. */
  consumoPorDia: number[];
  /** Para cada dia, se o item tinha disponível > 0. Dias sem disponibilidade saem da média. */
  disponivelNoDia: boolean[];
  /** Nº de dispensações na janela. */
  saidas: number;
  /** Dias de histórico do item (desde a primeira entrada). */
  diasHistorico: number;
}

export interface EstatConsumo {
  media: number;
  desvio: number;
  cv: number | null;
  diasConsiderados: number;
}

export function estatisticasConsumo(s: SerieConsumo): EstatConsumo {
  const dias = s.consumoPorDia.filter((_, i) => s.disponivelNoDia[i]);
  const n = dias.length;
  if (n === 0) return { media: 0, desvio: 0, cv: null, diasConsiderados: 0 };
  const media = dias.reduce((a, b) => a + b, 0) / n;
  const variancia = n > 1 ? dias.reduce((a, b) => a + (b - media) ** 2, 0) / (n - 1) : 0;
  const desvio = Math.sqrt(variancia);
  return { media, desvio, cv: media > 0 ? desvio / media : null, diasConsiderados: n };
}

export interface LeadTime {
  media: number;
  desvio: number;
  origem: 'item' | 'fornecedor' | 'manual';
}

/** Lead time do item se houver ≥ 3 pedidos; senão o do fornecedor; senão o manual. */
export function escolherLeadTime(
  pedidosItem: number[],
  fornecedor: { media: number; desvio: number } | null,
  manualDias: number | null,
): LeadTime | null {
  if (pedidosItem.length >= 3) {
    const n = pedidosItem.length;
    const media = pedidosItem.reduce((a, b) => a + b, 0) / n;
    const desvio = Math.sqrt(pedidosItem.reduce((a, b) => a + (b - media) ** 2, 0) / (n - 1));
    return { media, desvio, origem: 'item' };
  }
  if (fornecedor) return { ...fornecedor, origem: 'fornecedor' };
  if (manualDias != null) return { media: manualDias, desvio: 0, origem: 'manual' };
  return null;
}

export interface EntradaReposicao {
  serie: SerieConsumo;
  leadTime: LeadTime | null;
  criticidade: Criticidade;
  nivelServico?: number;
  periodoRevisaoDias: number;
  posicaoProjetada: number;
  multiploEmbalagem: number;
  /** Validade típica de um lote novo, em dias; limita a compra ao que pode ser consumido. */
  validadeTipicaDias: number | null;
  minimoDiasHistorico?: number;
  minimoSaidas?: number;
  manual?: { es?: number | null; pr?: number | null; justificativa?: string | null };
}

export interface ParametrosReposicao {
  consumoMedio: number;
  desvioConsumo: number;
  z: number;
  esCalculado: number | null;
  prCalculado: number | null;
  esEmUso: number | null;
  prEmUso: number | null;
  estoqueMaximo: number | null;
  quantidadeSugerida: number | null;
  abaixoDoPR: boolean;
  parametroManualRecomendado: boolean;
  motivosManual: string[];
}

const arred = (x: number, casas = 4) => Math.round(x * 10 ** casas) / 10 ** casas;

export function calcularReposicao(e: EntradaReposicao): ParametrosReposicao {
  const minDias = e.minimoDiasHistorico ?? 60;
  const minSaidas = e.minimoSaidas ?? 3;
  const nivel = e.nivelServico ?? NIVEL_PADRAO[e.criticidade];
  const z = Z_POR_NIVEL[nivel] ?? 1.65;
  const st = estatisticasConsumo(e.serie);

  const motivos: string[] = [];
  if (e.serie.diasHistorico < minDias) motivos.push(`histórico menor que ${minDias} dias`);
  if (e.serie.saidas < minSaidas) motivos.push(`menos de ${minSaidas} saídas na janela`);
  if (st.cv != null && st.cv > 1) motivos.push('demanda irregular (CV > 1)');
  if (!e.leadTime) motivos.push('sem lead time');

  let es: number | null = null;
  let pr: number | null = null;
  if (e.leadTime && st.diasConsiderados > 0) {
    const { media: lt, desvio: slt } = e.leadTime;
    es = arred(z * Math.sqrt(lt * st.desvio ** 2 + st.media ** 2 * slt ** 2));
    pr = arred(st.media * lt + es);
  }

  const esEmUso = e.manual?.es ?? es;
  const prEmUso = e.manual?.pr ?? pr;
  const emax = prEmUso != null ? arred(prEmUso + st.media * e.periodoRevisaoDias) : null;

  let sugerida: number | null = null;
  if (emax != null) {
    let q = Math.max(0, emax - e.posicaoProjetada);
    if (e.validadeTipicaDias != null && st.media > 0) q = Math.min(q, st.media * e.validadeTipicaDias);
    const m = e.multiploEmbalagem > 0 ? e.multiploEmbalagem : 1;
    sugerida = q > 0 ? Math.ceil(arred(q / m)) * m : 0;
  }

  return {
    consumoMedio: arred(st.media),
    desvioConsumo: arred(st.desvio),
    z,
    esCalculado: es,
    prCalculado: pr,
    esEmUso,
    prEmUso,
    estoqueMaximo: emax,
    quantidadeSugerida: sugerida,
    abaixoDoPR: prEmUso != null && e.posicaoProjetada <= prEmUso,
    parametroManualRecomendado: motivos.length > 0,
    motivosManual: motivos,
  };
}
