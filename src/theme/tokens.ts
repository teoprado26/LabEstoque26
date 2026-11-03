// Tokens de cor do Simple Design System (github.com/figma/sds), gerados em sds-tokens.json por
// scripts/gerar-tokens-sds.mjs. Aqui viram variáveis "R G B" (para <alpha-value>) e hex para uso em JS (ícones, tab bar).
import sds from './sds-tokens.json';

export type Cor = keyof typeof sds.light;
export const CORES = Object.keys(sds.light) as Cor[];

// Cores com alfa (#rrggbbaa) perdem o alfa aqui; use a opacidade na classe (ex.: bg-blanket/70).
const triplet = (h: string) => {
  const n = parseInt(h.slice(1, 7), 16);
  return `${(n >> 16) & 255} ${(n >> 8) & 255} ${n & 255}`;
};

export const HEX: Record<'light' | 'dark', Record<Cor, string>> = { light: sds.light, dark: sds.dark };

export const VARS = {
  light: Object.fromEntries(CORES.map((c) => [`--${c}`, triplet(sds.light[c])])),
  dark: Object.fromEntries(CORES.map((c) => [`--${c}`, triplet(sds.dark[c])])),
} as const;
