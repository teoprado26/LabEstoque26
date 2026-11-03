/** @type {import('tailwindcss').Config} */
// Tema do Simple Design System (github.com/figma/sds). Cores: src/theme/sds-tokens.json, gerado de theme.css do SDS.
// Classes por categoria: bg-default, bg-brand, text-default, text-secondary, border-default, border-danger…
const sds = require('./src/theme/sds-tokens.json');

const nomes = Object.keys(sds.light);
const v = (n) => `rgb(var(--${n}) / <alpha-value>)`;
const grupo = (prefixo) =>
  Object.fromEntries(nomes.filter((n) => n.startsWith(`${prefixo}-`)).map((n) => [n.slice(prefixo.length + 1), v(n)]));

module.exports = {
  content: ['./src/**/*.{js,jsx,ts,tsx}'],
  presets: [require('nativewind/preset')],
  // 'class' evita o erro do NativeWind na web ("Cannot manually set color scheme…"); o tema continua seguindo o sistema.
  darkMode: 'class',
  theme: {
    extend: {
      backgroundColor: grupo('bg'),
      textColor: grupo('text'),
      borderColor: { ...grupo('border'), focus: v('focus') },
      // --sds-size-radius-100 / 200 / 400 / full
      borderRadius: { sm: '4px', md: '8px', lg: '16px', full: '9999px' },
      fontFamily: {
        sans: ['Inter_400Regular'],
        'sans-semibold': ['Inter_600SemiBold'],
        'sans-bold': ['Inter_700Bold'],
        mono: ['RobotoMono_400Regular'],
      },
      // Escala tipográfica do SDS (scale-02…06) com a altura de linha de parágrafo do SDS (1,4).
      fontSize: {
        'heading-large': ['32px', '38px'],
        heading: ['24px', '30px'],
        'heading-small': ['20px', '26px'],
        subheading: ['20px', '28px'],
        body: ['16px', '22px'],
        'body-small': ['14px', '20px'],
        code: ['14px', '20px'],
      },
    },
  },
  plugins: [],
};
