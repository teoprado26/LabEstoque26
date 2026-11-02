/** @type {import('tailwindcss').Config} */
const cores = [
  'surface', 'surface-raised', 'surface-sunken', 'ink', 'ink-muted', 'line', 'line-strong',
  'primary', 'on-primary', 'primary-soft', 'focus',
  'status-ok', 'status-ok-soft', 'status-warn', 'status-warn-soft', 'status-crit', 'status-crit-soft',
];

module.exports = {
  content: ['./src/**/*.{js,jsx,ts,tsx}'],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: Object.fromEntries(cores.map((n) => [n, `rgb(var(--${n}) / <alpha-value>)`])),
      borderRadius: { sm: '4px', md: '8px', lg: '16px' },
      fontFamily: {
        sans: ['IBMPlexSans_400Regular'],
        'sans-medium': ['IBMPlexSans_500Medium'],
        'sans-semibold': ['IBMPlexSans_600SemiBold'],
        mono: ['IBMPlexMono_400Regular'],
        'mono-medium': ['IBMPlexMono_500Medium'],
      },
      fontSize: {
        display: ['28px', '34px'],
        title: ['20px', '26px'],
        subtitle: ['16px', '22px'],
        body: ['15px', '22px'],
        label: ['13px', '18px'],
        caption: ['12px', '16px'],
        kpi: ['28px', '32px'],
        code: ['13px', '18px'],
      },
    },
  },
  plugins: [],
};
