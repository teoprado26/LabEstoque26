// Espelho do design system LabEstoque (tokens.json). Valores em "R G B" para uso com <alpha-value>.

export const CORES = [
  'surface', 'surface-raised', 'surface-sunken', 'ink', 'ink-muted', 'line', 'line-strong',
  'primary', 'on-primary', 'primary-soft', 'focus',
  'status-ok', 'status-ok-soft', 'status-warn', 'status-warn-soft', 'status-crit', 'status-crit-soft',
] as const;

export type Cor = (typeof CORES)[number];

const hex = (h: string) => {
  const n = parseInt(h.slice(1), 16);
  return `${(n >> 16) & 255} ${(n >> 8) & 255} ${n & 255}`;
};

const claro: Record<Cor, string> = {
  surface: '#f6f7f5', 'surface-raised': '#ffffff', 'surface-sunken': '#eceeeb',
  ink: '#17201c', 'ink-muted': '#56615b', line: '#d5dbd7', 'line-strong': '#8a958f',
  primary: '#0f6b5c', 'on-primary': '#ffffff', 'primary-soft': '#d8ebe6', focus: '#0f6b5c',
  'status-ok': '#2b6cb0', 'status-ok-soft': '#e3eef9',
  'status-warn': '#8a5a00', 'status-warn-soft': '#f7ecd6',
  'status-crit': '#b3261e', 'status-crit-soft': '#f8e1df',
};

const escuro: Record<Cor, string> = {
  surface: '#121614', 'surface-raised': '#1b201d', 'surface-sunken': '#0c0f0e',
  ink: '#e8ece9', 'ink-muted': '#a3ada7', line: '#2e3632', 'line-strong': '#6b7670',
  primary: '#4fc4ac', 'on-primary': '#0b1a16', 'primary-soft': '#1d4a41', focus: '#4fc4ac',
  'status-ok': '#7fb4ec', 'status-ok-soft': '#16273a',
  'status-warn': '#e8b44c', 'status-warn-soft': '#2e2512',
  'status-crit': '#ff8f80', 'status-crit-soft': '#351a18',
};

export const HEX = { light: claro, dark: escuro };

export const VARS = {
  light: Object.fromEntries(CORES.map((c) => [`--${c}`, hex(claro[c])])),
  dark: Object.fromEntries(CORES.map((c) => [`--${c}`, hex(escuro[c])])),
} as const;
