import { Platform } from 'react-native';

/**
 * Canonical Rydafirst design tokens for mobile — mirrors web/src/design-tokens.ts and globals.css
 * so the app and web stay visually identical. Screens must consume these tokens (never hard-code
 * colours, sizes, or spacing) so the look stays consistent and can't drift again.
 */
export const t = {
  // ---- Colour (identical to web --vars) ----
  ink: '#111111', ink2: '#565656', mid: '#A8A8A8',
  line: '#DADADA', line2: '#EDEDED', bg: '#FFFFFF', bg2: '#FAFAFA',
  primary: '#F97316', primaryPressed: '#E4610C', primarySoft: '#FEEEE0', primaryInk: '#FFFFFF',
  success: '#16A34A', info: '#2563EB', warning: '#A16207', danger: '#DC2626',

  // ---- Type scale (px), mirrors web tokens.size ----
  size: { display: 34, title: 21, subtitle: 17, body: 15, caption: 11, data: 15, dataLg: 21 },

  // ---- Spacing scale, mirrors web tokens.space ----
  space: { xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 24, x3: 32, x4: 40 },

  // ---- Radius, mirrors web tokens.radius ----
  radius: { sm: 4, md: 6, lg: 8, pill: 999 },

  // ---- Fonts. Space Grotesk / Space Mono load via expo-font; these are the safe fallbacks. ----
  sans: Platform.select({ ios: 'System', android: 'sans-serif', default: 'System' }) as string,
  mono: Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' }) as string,
};
