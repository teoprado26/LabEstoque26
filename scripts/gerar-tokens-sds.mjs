// Gera src/theme/sds-tokens.json a partir do theme.css do Simple Design System (github.com/figma/sds).
// Uso: node scripts/gerar-tokens-sds.mjs <caminho do theme.css do SDS>
// Resolve var() em cadeia para os temas claro (:root) e escuro (@media prefers-color-scheme: dark).
import { readFileSync, writeFileSync } from 'node:fs';

const css = readFileSync(process.argv[2], 'utf8');
const [antesEscuro, resto] = css.split('@media (prefers-color-scheme: dark)');
const fimEscuro = resto.indexOf('/* size:');
const ler = (txt) => Object.fromEntries([...txt.matchAll(/--([\w-]+):\s*([^;]+);/g)].map((m) => [m[1], m[2].trim()]));
const claro = ler(antesEscuro + resto.slice(fimEscuro));
const escuro = { ...claro, ...ler(resto.slice(0, fimEscuro)) };

const resolver = (mapa, v, n = 0) => {
  const m = /^var\(--([\w-]+)\)$/.exec(v);
  if (!m) return v;
  if (n > 20 || !(m[1] in mapa)) throw new Error(`var não resolvida: ${v}`);
  return resolver(mapa, mapa[m[1]], n + 1);
};

// Nome no app → token semântico do SDS (sem o prefixo --sds-color-).
const CORES = {
  'bg-default': 'background-default-default',
  'bg-default-hover': 'background-default-default-hover',
  'bg-secondary': 'background-default-secondary',
  'bg-secondary-hover': 'background-default-secondary-hover',
  'bg-tertiary': 'background-default-tertiary',
  'bg-brand': 'background-brand-default',
  'bg-brand-hover': 'background-brand-hover',
  'bg-brand-secondary': 'background-brand-secondary',
  'bg-brand-tertiary': 'background-brand-tertiary',
  'bg-neutral-secondary': 'background-neutral-secondary',
  'bg-neutral-tertiary': 'background-neutral-tertiary',
  'bg-positive': 'background-positive-default',
  'bg-positive-secondary': 'background-positive-secondary',
  'bg-positive-tertiary': 'background-positive-tertiary',
  'bg-warning': 'background-warning-default',
  'bg-warning-secondary': 'background-warning-secondary',
  'bg-warning-tertiary': 'background-warning-tertiary',
  'bg-danger': 'background-danger-default',
  'bg-danger-hover': 'background-danger-hover',
  'bg-danger-secondary': 'background-danger-secondary',
  'bg-danger-tertiary': 'background-danger-tertiary',
  'bg-disabled': 'background-disabled-default',
  'bg-blanket': 'background-utilities-blanket',
  'border-default': 'border-default-default',
  'border-default-secondary': 'border-default-secondary',
  'border-brand': 'border-brand-default',
  'border-brand-secondary': 'border-brand-secondary',
  'border-danger': 'border-danger-default',
  'border-danger-secondary': 'border-danger-secondary',
  'border-positive': 'border-positive-default',
  'border-warning': 'border-warning-default',
  'border-disabled': 'border-disabled-default',
  'text-default': 'text-default-default',
  'text-secondary': 'text-default-secondary',
  'text-tertiary': 'text-default-tertiary',
  'text-brand': 'text-brand-default',
  'text-brand-tertiary': 'text-brand-tertiary',
  'text-on-brand': 'text-brand-on-brand',
  'text-on-brand-secondary': 'text-brand-on-brand-secondary',
  'text-on-brand-tertiary': 'text-brand-on-brand-tertiary',
  'text-neutral': 'text-neutral-default',
  'text-on-neutral-secondary': 'text-neutral-on-neutral-secondary',
  'text-danger': 'text-danger-default',
  'text-on-danger': 'text-danger-on-danger',
  'text-on-danger-secondary': 'text-danger-on-danger-secondary',
  'text-on-danger-tertiary': 'text-danger-on-danger-tertiary',
  'text-positive': 'text-positive-default',
  'text-on-positive-secondary': 'text-positive-on-positive-secondary',
  'text-warning': 'text-warning-default',
  'text-on-warning-secondary': 'text-warning-on-warning-secondary',
  'text-disabled': 'text-disabled-default',
  'icon-default': 'icon-default-default',
  'icon-secondary': 'icon-default-secondary',
  'icon-brand': 'icon-brand-default',
  'icon-on-brand': 'icon-brand-on-brand',
  'icon-danger': 'icon-danger-default',
  'icon-on-danger-tertiary': 'icon-danger-on-danger-tertiary',
  'icon-positive': 'icon-positive-default',
  'icon-warning': 'icon-warning-default',
};

// Texto, ícone e borda com alfa (#rrggbbaa, ex.: branco 70% no tema escuro) viram a cor opaca equivalente
// sobre o fundo padrão do tema, porque o app usa as cores como "R G B". Fundos com alfa ficam como estão.
const misturar = (cor, fundo) => {
  if (cor.length !== 9) return cor;
  const a = parseInt(cor.slice(7, 9), 16) / 255;
  const c = (i, s) => parseInt(s.slice(i, i + 2), 16);
  const m = [1, 3, 5].map((i) => Math.round(c(i, cor) * a + c(i, fundo) * (1 - a)));
  return `#${m.map((x) => x.toString(16).padStart(2, '0')).join('')}`;
};

const saida = { fonte: 'github.com/figma/sds src/theme.css', light: {}, dark: {} };
for (const [tema, mapa] of [['light', claro], ['dark', escuro]]) {
  const fundo = resolver(mapa, mapa['sds-color-background-default-default']).toLowerCase();
  for (const [nome, sds] of Object.entries(CORES)) {
    const v = resolver(mapa, mapa[`sds-color-${sds}`]).toLowerCase();
    saida[tema][nome] = nome.startsWith('bg-') ? v : misturar(v, fundo);
  }
}
// Anel de foco global do SDS (index.css): rgb(0, 106, 255) nos dois temas.
saida.light.focus = saida.dark.focus = '#006aff';

writeFileSync(new URL('../src/theme/sds-tokens.json', import.meta.url), JSON.stringify(saida, null, 2) + '\n');
console.log(`${Object.keys(saida.light).length} cores × 2 temas gravadas em src/theme/sds-tokens.json`);
