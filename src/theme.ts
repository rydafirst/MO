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

  /**
   * Type scale (px), mirrors web tokens.size.
   *
   * Sized for a rider glancing at a phone mid-delivery, often outdoors and in a hurry — testers
   * reported the rider interface was hard to read. Every step grew; `caption` (the mono micro-labels
   * that carry status and addresses) grew most, since that was the worst offender. Screens must
   * consume these rather than hard-coding numbers, or the next size fix has to touch every file
   * again.
   */
  size: { display: 34, title: 26, subtitle: 19, body: 16, small: 14, caption: 12.5, data: 16, dataLg: 26 },

  // ---- Spacing scale, mirrors web tokens.space ----
  space: { xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 24, x3: 32, x4: 40 },

  // ---- Radius, mirrors web tokens.radius ----
  radius: { sm: 4, md: 6, lg: 8, pill: 999 },

  // ---- Fonts. Space Grotesk / Space Mono load via expo-font; these are the safe fallbacks. ----
  sans: Platform.select({ ios: 'System', android: 'sans-serif', default: 'System' }) as string,
  mono: Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' }) as string,
};
