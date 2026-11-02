import { FUSO } from './datas';

const num = (casas: number) => new Intl.NumberFormat('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas });
const moeda = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

export const fmtNumero = (v: number, casas = 0) => num(casas).format(v);
export const fmtQtd = (v: number, unidade: string) => `${new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 3 }).format(v)} ${unidade}`;
export const fmtMoeda = (v: number) => moeda.format(v);
export const fmtPct = (v: number, casas = 1) => `${num(casas).format(v)}%`;

/** 'yyyy-mm-dd' → 'dd/mm/aaaa' sem conversão de fuso (é uma data de calendário). */
export function fmtData(dia: string | null): string {
  if (!dia) return '—';
  const [a, m, d] = dia.slice(0, 10).split('-');
  return `${d}/${m}/${a}`;
}

const dataHora = new Intl.DateTimeFormat('pt-BR', { timeZone: FUSO, dateStyle: 'short', timeStyle: 'short' });
export const fmtDataHora = (iso: string) => dataHora.format(new Date(iso));
