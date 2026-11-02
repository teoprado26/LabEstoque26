// Datas de calendário no fuso America/Sao_Paulo, representadas como 'yyyy-mm-dd'.

export const FUSO = 'America/Sao_Paulo';

const fmtDia = new Intl.DateTimeFormat('en-CA', { timeZone: FUSO, year: 'numeric', month: '2-digit', day: '2-digit' });

/** Dia de calendário em São Paulo de um instante. */
export function diaLocal(instante: Date | string): string {
  return fmtDia.format(typeof instante === 'string' ? new Date(instante) : instante);
}

export function hoje(): string {
  return diaLocal(new Date());
}

const DIA_MS = 86_400_000;
const utc = (dia: string) => Date.UTC(+dia.slice(0, 4), +dia.slice(5, 7) - 1, +dia.slice(8, 10));

/** Dias de calendário de `de` até `ate` (positivo se `ate` é depois). */
export function diasEntre(de: string, ate: string): number {
  return Math.round((utc(ate) - utc(de)) / DIA_MS);
}

export function somarDias(dia: string, n: number): string {
  return new Date(utc(dia) + n * DIA_MS).toISOString().slice(0, 10);
}

export function menorDia(a: string | null, b: string | null): string | null {
  if (!a) return b;
  if (!b) return a;
  return a < b ? a : b;
}
