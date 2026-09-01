export const colors = {
  bg: '#000000',          // Pure black for HUD
  panel: '#151922',
  panelAlt: '#1D2230',
  line: '#252B38',
  text: '#EEF1F7',
  muted: '#8C93A6',
  accent: '#4C8DFF',
  ok: '#3ECF8E',
  warn: '#F5A524',
  bad: '#F5525E',
  overlay: 'rgba(0,0,0,0.55)',
} as const;

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;
export const radius = { sm: 6, md: 10, lg: 16, pill: 999 } as const;
export const font = {
  h1: { fontSize: 22, fontWeight: '700' },
  h2: { fontSize: 17, fontWeight: '600' },
  body: { fontSize: 15, fontWeight: '400' },
  label: { fontSize: 13, fontWeight: '600' },
  mono: { fontSize: 12, fontFamily: 'Menlo' },
} as const;
