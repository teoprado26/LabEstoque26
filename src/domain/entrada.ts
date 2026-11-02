// Leitura de valores digitados em pt-BR.

/** 'dd/mm/aaaa' → 'aaaa-mm-dd' ou null se inválida. */
export function lerData(texto: string): string | null {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(texto.trim());
  if (!m) return null;
  const iso = `${m[3]}-${m[2]}-${m[1]}`;
  const d = new Date(`${iso}T12:00:00Z`);
  return Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== iso ? null : iso;
}

/** Número em pt-BR ('1.234,5', '-20', '0,25') → número, ou null. */
export function lerNumero(texto: string): number | null {
  const t = texto.trim().replace(/\s/g, '').replace(/−/g, '-');
  if (!t) return null;
  // Com vírgula, ponto é milhar. Sem vírgula, "1.000" é milhar e "1.5" é decimal.
  const normal = t.includes(',') || /^-?\d{1,3}(\.\d{3})+$/.test(t) ? t.replace(/\./g, '').replace(',', '.') : t;
  if (!/^-?\d+(\.\d+)?$/.test(normal)) return null;
  return Number(normal);
}
