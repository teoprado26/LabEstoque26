// Curva ABC por valor de consumo e matriz ABC × criticidade (VED), seção 9.1.
import type { Criticidade } from './tipos';

export type ClasseABC = 'A' | 'B' | 'C';

export interface ConsumoItem {
  itemId: string;
  nome: string;
  criticidade: Criticidade;
  valor: number;
}

export interface LinhaABC extends ConsumoItem {
  participacao: number; // %
  acumulado: number; // %
  classe: ClasseABC;
  posicao: number;
}

/**
 * Ordena por valor decrescente e classifica pelo acumulado: A até o 1º corte (80%), B até 1º + 2º (95%), C o resto.
 * Um item entra na classe da faixa onde o acumulado *antes* dele ainda não passou do corte (o item que cruza 80% é A).
 */
export function curvaABC(itens: ConsumoItem[], cortes: [number, number, number] = [80, 15, 5]): LinhaABC[] {
  const positivos = itens.filter((i) => i.valor > 0).sort((a, b) => b.valor - a.valor || a.nome.localeCompare(b.nome));
  const total = positivos.reduce((s, i) => s + i.valor, 0);
  if (total <= 0) return [];
  let acumAntes = 0;
  return positivos.map((i, idx) => {
    const participacao = (i.valor / total) * 100;
    const classe: ClasseABC = acumAntes < cortes[0] ? 'A' : acumAntes < cortes[0] + cortes[1] ? 'B' : 'C';
    acumAntes += participacao;
    return { ...i, participacao, acumulado: Math.min(100, acumAntes), classe, posicao: idx + 1 };
  });
}

export interface ResumoClasse {
  classe: ClasseABC;
  itens: number;
  valor: number;
  participacao: number;
}

export function resumoABC(linhas: LinhaABC[]): ResumoClasse[] {
  const total = linhas.reduce((s, l) => s + l.valor, 0);
  return (['A', 'B', 'C'] as ClasseABC[]).map((classe) => {
    const ls = linhas.filter((l) => l.classe === classe);
    const valor = ls.reduce((s, l) => s + l.valor, 0);
    return { classe, itens: ls.length, valor, participacao: total ? (valor / total) * 100 : 0 };
  });
}

/** Matriz 3×3: contagem de itens por classe ABC × criticidade V/E/D. */
export function matrizABCVED(linhas: LinhaABC[]): Record<ClasseABC, Record<Criticidade, LinhaABC[]>> {
  const m = { A: { V: [], E: [], D: [] }, B: { V: [], E: [], D: [] }, C: { V: [], E: [], D: [] } } as Record<ClasseABC, Record<Criticidade, LinhaABC[]>>;
  for (const l of linhas) m[l.classe][l.criticidade].push(l);
  return m;
}

/** Prioridade de controle: vitais sempre no topo, independentemente da classe. */
export function prioridade(classe: ClasseABC, criticidade: Criticidade): 'alta' | 'media' | 'baixa' {
  if (criticidade === 'V' || (classe === 'A' && criticidade === 'E')) return 'alta';
  if (classe === 'A' || classe === 'B' || criticidade === 'E') return 'media';
  return 'baixa';
}

/** Frequência de contagem cíclica sugerida pela matriz (dias). */
export const FREQUENCIA_CONTAGEM: Record<'alta' | 'media' | 'baixa', number> = { alta: 30, media: 90, baixa: 180 };
