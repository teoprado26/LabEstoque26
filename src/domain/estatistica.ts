// Estatística descritiva usada pelos KPIs de tempo (mediana, P90, desvio-padrão).

export function percentil(valores: number[], p: number): number | null {
  if (valores.length === 0) return null;
  const v = [...valores].sort((a, b) => a - b);
  // Interpolação linear entre posições (mesmo método do Excel PERCENTIL.INC).
  const pos = (v.length - 1) * p;
  const i = Math.floor(pos);
  return i + 1 < v.length ? v[i] + (v[i + 1] - v[i]) * (pos - i) : v[i];
}

export const mediana = (valores: number[]) => percentil(valores, 0.5);

export function media(valores: number[]): number | null {
  return valores.length ? valores.reduce((a, b) => a + b, 0) / valores.length : null;
}

/** Desvio-padrão amostral (n − 1). */
export function desvio(valores: number[]): number | null {
  if (valores.length < 2) return null;
  const m = media(valores)!;
  return Math.sqrt(valores.reduce((a, b) => a + (b - m) ** 2, 0) / (valores.length - 1));
}

const DIA_MS = 86_400_000;
export const diasEntreInstantes = (de: string, ate: string) => (new Date(ate).getTime() - new Date(de).getTime()) / DIA_MS;
