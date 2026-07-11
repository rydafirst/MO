/** Canonical Rydafirst design tokens (see docs/design-system.md). Web + mobile import these. */
export const tokens = {
  color: {
    ink: '#111111', ink2: '#565656', mid: '#A8A8A8',
    line: '#DADADA', line2: '#EDEDED', bg: '#FFFFFF', bg2: '#FAFAFA',
    primary: '#F97316', primaryPressed: '#E4610C', primarySoft: '#FEEEE0', primaryInk: '#FFFFFF',
    success: '#16A34A', info: '#2563EB', warning: '#A16207', danger: '#DC2626',
  },
  font: {
    sans: "'Space Grotesk', system-ui, sans-serif",
    mono: "'Space Mono', ui-monospace, Menlo, monospace",
  },
  size: { display: 34, title: 21, subtitle: 17, body: 15, caption: 11, data: 15, dataLg: 21 },
  space: { 1: 4, 2: 8, 3: 12, 4: 16, 5: 20, 6: 24, 8: 32, 10: 40, 12: 48, 16: 64 },
  radius: { sm: 4, md: 6, lg: 8, pill: 999 },
  shadow: { float: '0 8px 24px rgba(0,0,0,0.10)' },
} as const;
