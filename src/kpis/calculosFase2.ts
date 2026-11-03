// KPIs da Fase 2 (K05, K06, K08, K10, K11, K17–K22). Uma função por KPI; painel, PDF e CSV chamam estas.
import { KPI_POR_ID } from './catalog';
import { insuficiente, percentual, type KpiResultado } from './resultado';
import { diasEntre } from '../domain/datas';
import { desvio, diasEntreInstantes, media, mediana, percentil } from '../domain/estatistica';

const min = (id: string) => KPI_POR_ID[id].minimoAmostra;

// ---------- K05 dias em ruptura ----------
export interface DiaItem { dia: string; itemId: string; ativo: boolean; disponivel: number }

export function k05DiasRuptura(snaps: DiaItem[]): KpiResultado {
  const porItem = new Map<string, DiaItem[]>();
  for (const s of snaps) if (s.ativo) porItem.set(s.itemId, [...(porItem.get(s.itemId) ?? []), s]);
  if (porItem.size === 0) return insuficiente('K05');
  let dias = 0;
  let eventos = 0;
  const itensComRuptura: string[] = [];
  for (const [itemId, lista] of porItem) {
    lista.sort((a, b) => (a.dia < b.dia ? -1 : 1));
    let emRuptura = false;
    let teve = false;
    for (const s of lista) {
      const zero = s.disponivel <= 0;
      if (zero) {
        dias++;
        teve = true;
        if (!emRuptura) eventos++;
      }
      emRuptura = zero;
    }
    if (teve) itensComRuptura.push(itemId);
  }
  return {
    id: 'K05', valor: dias, numerador: dias, denominador: null, n: porItem.size, selo: 'Real', registros: itensComRuptura,
    extra: { eventos, duracaoMedia: eventos ? dias / eventos : null, eventosPorItem: eventos / porItem.size },
  };
}

// ---------- K06 tempo de atendimento (h) ----------
export interface Atendimento { id: string; criadaEm: string; aprovadaEm: string | null; atendidaEm: string }

export function k06TempoAtendimento(reqs: Atendimento[]): KpiResultado {
  if (reqs.length < min('K06')) return insuficiente('K06', reqs.length);
  const horas = reqs.map((r) => diasEntreInstantes(r.aprovadaEm ?? r.criadaEm, r.atendidaEm) * 24);
  const med = mediana(horas)!;
  return { id: 'K06', valor: med, numerador: null, denominador: null, n: reqs.length, selo: 'Real', registros: reqs.map((r) => r.id), extra: { p90: percentil(horas, 0.9) } };
}

// ---------- K08 cobertura insuficiente ----------
export interface CoberturaLT { itemId: string; criticidade: 'V' | 'E' | 'D'; coberturaDias: number | null; leadTimeDias: number | null }

export function k08CoberturaInsuficiente(itens: CoberturaLT[]): KpiResultado {
  const avaliaveis = itens.filter((i) => i.coberturaDias != null && i.leadTimeDias != null);
  if (avaliaveis.length === 0) return insuficiente('K08');
  const abaixo = avaliaveis.filter((i) => (i.coberturaDias as number) < (i.leadTimeDias as number));
  return {
    id: 'K08', valor: abaixo.length, numerador: abaixo.length, denominador: null, n: avaliaveis.length, selo: 'Projetado',
    registros: abaixo.map((i) => i.itemId), extra: { vitais: abaixo.filter((i) => i.criticidade === 'V').length },
  };
}

// ---------- K10 giro ----------
/** valorConsumido no período; valoresDiarios = valor total do estoque em cada snapshot do período. */
export function k10Giro(valorConsumido: number, valoresDiarios: number[], diasPeriodo: number): KpiResultado {
  const medio = media(valoresDiarios);
  if (medio == null || medio <= 0 || valoresDiarios.length < min('K10') || diasPeriodo <= 0) return insuficiente('K10', valoresDiarios.length);
  const giro = (valorConsumido * (365 / diasPeriodo)) / medio;
  return { id: 'K10', valor: giro, numerador: valorConsumido, denominador: medio, n: valoresDiarios.length, selo: 'Real', extra: { tempoMedioDias: giro > 0 ? 365 / giro : null } };
}

// ---------- K11 sem movimentação ----------
export interface ItemParado { itemId: string; saldo: number; valor: number | null; ultimaDispensacao: string | null; desde: string | null }

export function k11SemMovimentacao(itens: ItemParado[], hoje: string, limiteDias = 180): KpiResultado {
  const comSaldo = itens.filter((i) => i.saldo > 0);
  const parados = comSaldo.filter((i) => {
    const ref = i.ultimaDispensacao ?? i.desde;
    return ref != null && diasEntre(ref, hoje) >= limiteDias;
  });
  return {
    id: 'K11', valor: parados.length, numerador: parados.length, denominador: null, n: comSaldo.length, selo: 'Real', registros: parados.map((i) => i.itemId),
    extra: { valorImobilizado: parados.reduce((s, i) => s + (i.valor ?? 0), 0) },
  };
}

// ---------- K17 acuracidade financeira ----------
export interface ContagemValor { id: string; saldoSistema: number; divergencia: number; custo: number | null }

export function k17AcuracidadeFinanceira(contagens: ContagemValor[]): KpiResultado {
  const comCusto = contagens.filter((c) => c.custo != null);
  const registrado = comCusto.reduce((s, c) => s + c.saldoSistema * (c.custo as number), 0);
  const divergente = comCusto.reduce((s, c) => s + Math.abs(c.divergencia) * (c.custo as number), 0);
  if (comCusto.length < Math.max(1, min('K17')) || registrado <= 0) return insuficiente('K17', comCusto.length);
  return {
    id: 'K17', valor: Math.max(0, (1 - divergente / registrado) * 100), numerador: divergente, denominador: registrado, n: comCusto.length,
    selo: comCusto.length < contagens.length ? 'Estimado' : 'Real', registros: comCusto.map((c) => c.id),
  };
}

// ---------- K18, K19 ----------
export const k18Rastreabilidade = (r: { total: number; completas: number }) => percentual('K18', r.completas, r.total, r.total, min('K18'));
export const k19Retroativos = (r: { total: number; retroativas: number }) => percentual('K19', r.retroativas, r.total, r.total, min('K19'));

// ---------- K20, K21, K22 ----------
export interface PedidoRecebido {
  id: string; fornecedor: string | null; solicitadoEm: string; aprovadoEm: string | null; enviadoEm: string | null;
  previstoPara: string | null; recebidoEm: string; conferidoEm: string | null; liberadoEm: string | null; completo: boolean;
}

export function k20LeadTime(pedidos: PedidoRecebido[]): KpiResultado {
  const dias = pedidos.map((p) => diasEntreInstantes(p.enviadoEm ?? p.aprovadoEm ?? p.solicitadoEm, p.recebidoEm));
  if (dias.length < min('K20')) return insuficiente('K20', dias.length);
  return { id: 'K20', valor: mediana(dias), numerador: null, denominador: null, n: dias.length, selo: 'Real', registros: pedidos.map((p) => p.id), extra: { p90: percentil(dias, 0.9), desvio: desvio(dias) } };
}

export const ETAPAS_CICLO = ['aprovacao', 'compra', 'entrega', 'conferencia', 'liberacao'] as const;
export type EtapaCiclo = (typeof ETAPAS_CICLO)[number];

export function k21CicloAbastecimento(pedidos: PedidoRecebido[]): KpiResultado {
  const completos = pedidos.filter((p) => p.liberadoEm && p.aprovadoEm && p.enviadoEm && p.conferidoEm);
  if (completos.length < min('K21')) return insuficiente('K21', completos.length);
  const etapa = (f: (p: PedidoRecebido) => [string, string]) => mediana(completos.map((p) => diasEntreInstantes(...f(p))))!;
  const extra: Record<string, number | null> = {
    aprovacao: etapa((p) => [p.solicitadoEm, p.aprovadoEm!]),
    compra: etapa((p) => [p.aprovadoEm!, p.enviadoEm!]),
    entrega: etapa((p) => [p.enviadoEm!, p.recebidoEm]),
    conferencia: etapa((p) => [p.recebidoEm, p.conferidoEm!]),
    liberacao: etapa((p) => [p.conferidoEm!, p.liberadoEm!]),
  };
  const total = mediana(completos.map((p) => diasEntreInstantes(p.solicitadoEm, p.liberadoEm!)))!;
  const gargalo = ETAPAS_CICLO.reduce((g, e) => ((extra[e] ?? 0) > (extra[g] ?? 0) ? e : g), ETAPAS_CICLO[0]);
  return { id: 'K21', valor: total, numerador: null, denominador: null, n: completos.length, selo: 'Real', extra: { ...extra, gargalo: ETAPAS_CICLO.indexOf(gargalo) } };
}

/** No prazo = recebido (data em São Paulo) até a data prevista. */
export function k22EntregasNoPrazo(pedidos: PedidoRecebido[], diaRecebido: (iso: string) => string): KpiResultado {
  const comPrevisao = pedidos.filter((p) => p.previstoPara);
  const bons = comPrevisao.filter((p) => p.completo && diaRecebido(p.recebidoEm) <= (p.previstoPara as string));
  return { ...percentual('K22', bons.length, comPrevisao.length, comPrevisao.length, min('K22')), registros: comPrevisao.map((p) => p.id) };
}

export interface ResumoFornecedor { fornecedor: string; pedidos: number; leadTimeMediano: number | null; p90: number | null; noPrazo: number | null }

export function porFornecedor(pedidos: PedidoRecebido[], diaRecebido: (iso: string) => string): ResumoFornecedor[] {
  const grupos = new Map<string, PedidoRecebido[]>();
  for (const p of pedidos) grupos.set(p.fornecedor ?? 'Sem fornecedor', [...(grupos.get(p.fornecedor ?? 'Sem fornecedor') ?? []), p]);
  return [...grupos].map(([fornecedor, ps]) => {
    const lt = k20LeadTime(ps);
    const prazo = k22EntregasNoPrazo(ps, diaRecebido);
    return { fornecedor, pedidos: ps.length, leadTimeMediano: lt.valor, p90: (lt.extra?.p90 as number) ?? null, noPrazo: prazo.valor };
  }).sort((a, b) => b.pedidos - a.pedidos);
}
