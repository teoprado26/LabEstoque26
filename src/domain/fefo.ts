import { diasEntre } from './datas';
import { saldoDisponivel, validadeEfetiva } from './disponibilidade';
import type { PosicaoLote } from './tipos';

/** Lotes com disponível > 0 em ordem FEFO: primeiro a vencer sai primeiro; sem validade vai por último. */
export function ordenarFEFO(posicoes: PosicaoLote[], dia: string): PosicaoLote[] {
  return posicoes
    .filter((p) => saldoDisponivel(p, dia) > 0)
    .sort((a, b) => {
      const va = validadeEfetiva(a) ?? '9999-12-31';
      const vb = validadeEfetiva(b) ?? '9999-12-31';
      return va === vb ? a.numero.localeCompare(b.numero) : va < vb ? -1 : 1;
    });
}

export function sugerirLoteFEFO(posicoes: PosicaoLote[], dia: string): PosicaoLote | null {
  return ordenarFEFO(posicoes, dia)[0] ?? null;
}

export interface ResultadoSimulacao {
  loteId: string;
  validade: string | null;
  disponivel: number;
  /** Parte que será consumida antes de vencer. */
  utilizavel: number;
  /** Parte que sobrará no dia do vencimento. */
  sobra: number;
  diasAteVencer: number | null;
}

/**
 * Simulação FEFO: os lotes são consumidos em ordem de vencimento ao ritmo `consumoDiario`.
 * Para cada lote, o utilizável é o que o consumo alcança antes da validade efetiva,
 * considerando o tempo já gasto com os lotes anteriores.
 */
export function simularFEFO(posicoes: PosicaoLote[], consumoDiario: number, dia: string): ResultadoSimulacao[] {
  let cursor = 0; // dias consumidos até aqui
  return ordenarFEFO(posicoes, dia).map((p) => {
    const disponivel = saldoDisponivel(p, dia);
    const v = validadeEfetiva(p);
    // O lote é utilizável inclusive no dia da validade: janela = dias até vencer + 1.
    const diasAteVencer = v == null ? null : diasEntre(dia, v);
    let utilizavel: number;
    if (diasAteVencer == null) utilizavel = disponivel;
    else if (consumoDiario <= 0) utilizavel = 0;
    else utilizavel = Math.min(disponivel, Math.max(0, (diasAteVencer + 1 - cursor) * consumoDiario));
    if (consumoDiario > 0) cursor += utilizavel / consumoDiario;
    return { loteId: p.loteId, validade: v, disponivel, utilizavel, sobra: disponivel - utilizavel, diasAteVencer };
  });
}

export function quantidadeUtilizavel(posicoes: PosicaoLote[], consumoDiario: number, dia: string): number {
  return simularFEFO(posicoes, consumoDiario, dia).reduce((s, r) => s + r.utilizavel, 0);
}

/** K15 por item: valor que sobrará em lotes que vencem dentro do horizonte. */
export function valorEmRisco(posicoes: PosicaoLote[], consumoDiario: number, dia: string, horizonteDias: number): number {
  const custo = new Map(posicoes.map((p) => [p.loteId, p.custoUnitario ?? 0]));
  return simularFEFO(posicoes, consumoDiario, dia)
    .filter((r) => r.diasAteVencer != null && r.diasAteVencer <= horizonteDias && r.sobra > 0)
    .reduce((s, r) => s + r.sobra * (custo.get(r.loteId) ?? 0), 0);
}
