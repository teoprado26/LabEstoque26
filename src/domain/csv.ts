// CSV para o Excel em português: separador ";", aspas quando preciso e BOM UTF-8.
export const cel = (v: unknown) => {
  const t = v == null ? '' : String(v);
  return /[";\n\r]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
};
/** Separador ";" e BOM UTF-8: o Excel em português abre com colunas e acentos corretos. */
export function paraCsv(cabecalho: string[], linhas: unknown[][]): string {
  return '﻿' + [cabecalho, ...linhas].map((l) => l.map(cel).join(';')).join('\r\n');
}
