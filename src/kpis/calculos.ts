// Uma função por KPI da Fase 1. Painel, PDF e Excel chamam estas funções, nunca reimplementam a fórmula.
import { KPI_POR_ID } from './catalog';
import { insuficiente, percentual, type KpiResultado } from './resultado';
import { quantidadeUtilizavel, valorEmRisco } from '../domain/fefo';
import type { Criticidade, MotivoPerda, MovTipo, PosicaoLote } from '../domain/tipos';

const min = (id: string) => KPI_POR_ID[id].minimoAmostra;

// ---------- K01 ----------
export interface SnapshotItemDia {
  dia: string;
  itemId: string;
  ativo: boolean;
  criticidade: Criticidade;
  disponivel: number;
}

export function k01Disponibilidade(snaps: SnapshotItemDia[]): KpiResultado {
  const ativos = snaps.filter((s) => s.ativo);
  const comDisp = ativos.filter((s) => s.disponivel > 0);
  const vitais = ativos.filter((s) => s.criticidade === 'V');
  const vitaisDisp = vitais.filter((s) => s.disponivel > 0);
  const dias = new Set(ativos.map((s) => s.dia)).size;
  const r = percentual('K01', comDisp.length, ativos.length, dias, min('K01'));
  return { ...r, extra: { vitais: vitais.length ? (vitaisDisp.length / vitais.length) * 100 : null, dias } };
}

// ---------- K02–K04 ----------
export interface LinhaRequisicao {
  id: string;
  qtdSolicitada: number;
  qtdAprovada: number | null;
  qtdAtendida: number;
  canceladaPeloSolicitante: boolean;
  foraDoCatalogo: boolean;
  /** Preenchida só quando o não atendimento foi por falta de estoque (não por reserva planejada). */
  causaRuptura: string | null;
}

const consideradas = (ls: LinhaRequisicao[]) => ls.filter((l) => !l.canceladaPeloSolicitante && !l.foraDoCatalogo);

export function k02AtendimentoLinhas(linhas: LinhaRequisicao[]): KpiResultado {
  const ls = consideradas(linhas);
  const ok = ls.filter((l) => l.qtdAtendida >= (l.qtdAprovada ?? l.qtdSolicitada));
  return { ...percentual('K02', ok.length, ls.length, ls.length, min('K02')), registros: ls.map((l) => l.id) };
}

export function k03AtendimentoQuantidade(linhas: LinhaRequisicao[]): KpiResultado {
  const ls = consideradas(linhas);
  const atendida = ls.reduce((s, l) => s + l.qtdAtendida, 0);
  const solicitada = ls.reduce((s, l) => s + l.qtdSolicitada, 0);
  return { ...percentual('K03', atendida, solicitada, ls.length, min('K03')), registros: ls.map((l) => l.id) };
}

export function k04Ruptura(linhas: LinhaRequisicao[]): KpiResultado {
  const ls = consideradas(linhas);
  const rup = ls.filter((l) => l.causaRuptura != null && l.qtdAtendida < (l.qtdAprovada ?? l.qtdSolicitada));
  return { ...percentual('K04', rup.length, ls.length, ls.length, min('K04')), registros: rup.map((l) => l.id) };
}

// ---------- K07 ----------
export interface DadosCobertura {
  itemId: string;
  posicoes: PosicaoLote[];
  consumoMedioDiario: number;
  diasHistorico: number;
  saidasNaJanela: number;
}

export function k07Cobertura(d: DadosCobertura, dia: string, minimoDiasHistorico = 60): KpiResultado {
  if (d.diasHistorico < minimoDiasHistorico || d.saidasNaJanela < min('K07') || d.consumoMedioDiario <= 0) {
    return insuficiente('K07', d.saidasNaJanela);
  }
  const util = quantidadeUtilizavel(d.posicoes, d.consumoMedioDiario, dia);
  return {
    id: 'K07',
    valor: util / d.consumoMedioDiario,
    numerador: util,
    denominador: d.consumoMedioDiario,
    n: d.saidasNaJanela,
    selo: 'Projetado',
  };
}

// ---------- K09 ----------
export interface ItemReposicao {
  itemId: string;
  criticidade: Criticidade;
  posicaoProjetada: number;
  prEmUso: number | null;
}

export function k09AbaixoDoPR(itens: ItemReposicao[]): KpiResultado {
  const comPR = itens.filter((i) => i.prEmUso != null);
  if (comPR.length === 0) return insuficiente('K09');
  const abaixo = comPR.filter((i) => i.posicaoProjetada <= (i.prEmUso as number));
  return {
    id: 'K09',
    valor: abaixo.length,
    numerador: abaixo.length,
    denominador: null,
    n: comPR.length,
    selo: 'Real',
    registros: abaixo.map((i) => i.itemId),
    extra: { vitais: abaixo.filter((i) => i.criticidade === 'V').length, semParametro: itens.length - comPR.length },
  };
}

// ---------- K12 ----------
export interface PosicaoValor {
  saldo: number;
  custoMedio: number | null;
}

export function k12ValorEstoque(posicoes: PosicaoValor[]): KpiResultado {
  const comCusto = posicoes.filter((p) => p.custoMedio != null);
  const valor = comCusto.reduce((s, p) => s + p.saldo * (p.custoMedio as number), 0);
  return {
    id: 'K12',
    valor,
    numerador: valor,
    denominador: null,
    n: posicoes.length,
    selo: 'Real',
    extra: { semCusto: posicoes.length - comCusto.length },
  };
}

// ---------- K13–K14 ----------
export interface MovValorada {
  id: string;
  tipo: MovTipo;
  quantidade: number;
  custoLote: number | null;
  custoMedio: number | null;
  motivo?: MotivoPerda | string | null;
  /** Para DEVOLUCAO: true se o lote foi reintegrado (volta a reduzir o consumo). */
  reintegrada?: boolean;
}

function valorar(m: MovValorada): { valor: number; estimado: boolean } {
  if (m.custoLote != null) return { valor: m.quantidade * m.custoLote, estimado: false };
  return { valor: m.quantidade * (m.custoMedio ?? 0), estimado: true };
}

export function k13IndicePerdas(movs: MovValorada[]): KpiResultado {
  let perdido = 0;
  let consumido = 0;
  let estimado = false;
  const registros: string[] = [];
  for (const m of movs) {
    if (m.tipo === 'PERDA') {
      const v = valorar(m);
      perdido += v.valor;
      estimado ||= v.estimado;
      registros.push(m.id);
    } else if (m.tipo === 'DISPENSACAO') {
      consumido += valorar(m).valor;
      registros.push(m.id);
    } else if (m.tipo === 'DEVOLUCAO' && m.reintegrada) {
      consumido -= valorar(m).valor;
      registros.push(m.id);
    }
  }
  const r = percentual('K13', perdido, consumido + perdido, registros.length, min('K13'), estimado ? 'Estimado' : 'Real');
  return { ...r, registros, extra: { valorPerdido: perdido, valorConsumido: consumido } };
}

export function k14ValorVencido(movs: MovValorada[]): KpiResultado {
  const ps = movs.filter((m) => m.tipo === 'PERDA' && m.motivo === 'vencimento');
  const vals = ps.map(valorar);
  const valor = vals.reduce((s, v) => s + v.valor, 0);
  return {
    id: 'K14',
    valor,
    numerador: valor,
    denominador: null,
    n: ps.length,
    selo: vals.some((v) => v.estimado) ? 'Estimado' : 'Real',
    registros: ps.map((m) => m.id),
  };
}

// ---------- K15 ----------
export function k15ValorEmRisco(itens: DadosCobertura[], dia: string, horizontes = [30, 60, 90]): KpiResultado {
  const extra: Record<string, number> = {};
  for (const h of horizontes) {
    extra[`h${h}`] = itens.reduce((s, i) => s + valorEmRisco(i.posicoes, i.consumoMedioDiario, dia, h), 0);
  }
  const maior = extra[`h${Math.max(...horizontes)}`];
  return { id: 'K15', valor: maior, numerador: maior, denominador: null, n: itens.length, selo: 'Projetado', extra };
}

// ---------- K16 ----------
export function dentroDaTolerancia(saldoSistema: number, contado: number, unidadeContavel: boolean, tolPct = 2): boolean {
  const diff = Math.abs(contado - saldoSistema);
  if (unidadeContavel) return diff === 0;
  if (saldoSistema === 0) return contado === 0;
  return (diff / saldoSistema) * 100 <= tolPct + 1e-9;
}

export interface Contagem {
  id: string;
  dentroTolerancia: boolean;
}

export function k16Acuracidade(contagens: Contagem[]): KpiResultado {
  const ok = contagens.filter((c) => c.dentroTolerancia).length;
  return {
    ...percentual('K16', ok, contagens.length, contagens.length, min('K16')),
    registros: contagens.map((c) => c.id),
  };
}
