// Hierarquia de locais: ordenação em árvore, caminho completo e regras de quem pode ser "pai".
import { NIVEIS_LOCAL } from './config';

export interface NoLocal {
  id: string;
  pai_id: string | null;
  nivel: string;
  nome: string;
  ativo?: boolean;
}

const ORDEM_NIVEL = Object.fromEntries(NIVEIS_LOCAL.map((n, i) => [n.valor, i]));
export const indiceNivel = (nivel: string) => ORDEM_NIVEL[nivel] ?? 99;

/** Lista em pré-ordem (pai antes dos filhos), com a profundidade de cada nó. Órfãos vão para a raiz. */
export function ordenarArvore<T extends NoLocal>(locais: T[]): { local: T; profundidade: number }[] {
  const ids = new Set(locais.map((l) => l.id));
  const filhos = new Map<string | null, T[]>();
  for (const l of locais) {
    const pai = l.pai_id && ids.has(l.pai_id) ? l.pai_id : null;
    filhos.set(pai, [...(filhos.get(pai) ?? []), l]);
  }
  const ordenar = (xs: T[]) => [...xs].sort((a, b) => indiceNivel(a.nivel) - indiceNivel(b.nivel) || a.nome.localeCompare(b.nome));
  const saida: { local: T; profundidade: number }[] = [];
  const visitados = new Set<string>();
  const visitar = (pai: string | null, profundidade: number) => {
    for (const l of ordenar(filhos.get(pai) ?? [])) {
      if (visitados.has(l.id)) continue;
      visitados.add(l.id);
      saida.push({ local: l, profundidade });
      visitar(l.id, profundidade + 1);
    }
  };
  visitar(null, 0);
  return saida;
}

export function descendentes(locais: NoLocal[], id: string): Set<string> {
  const res = new Set<string>();
  const fila = [id];
  while (fila.length) {
    const atual = fila.shift()!;
    for (const l of locais) {
      if (l.pai_id === atual && !res.has(l.id)) {
        res.add(l.id);
        fila.push(l.id);
      }
    }
  }
  return res;
}

/** Pais possíveis: nível acima do escolhido, ativos, e nunca o próprio local ou um descendente dele (evita ciclo). */
export function paisPossiveis<T extends NoLocal>(locais: T[], nivel: string, id: string | null): T[] {
  const proibidos = id ? new Set([id, ...descendentes(locais, id)]) : new Set<string>();
  return locais.filter((l) => l.ativo !== false && !proibidos.has(l.id) && indiceNivel(l.nivel) < indiceNivel(nivel));
}

export function caminho(locais: NoLocal[], id: string): string {
  const porId = new Map(locais.map((l) => [l.id, l]));
  const partes: string[] = [];
  let atual = porId.get(id);
  const vistos = new Set<string>();
  while (atual && !vistos.has(atual.id)) {
    vistos.add(atual.id);
    partes.unshift(atual.nome);
    atual = atual.pai_id ? porId.get(atual.pai_id) : undefined;
  }
  return partes.join(' › ');
}
