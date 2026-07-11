import Svg, { Circle, Path } from 'react-native-svg';

export type IconName = 'home' | 'bike' | 'orders' | 'user';

/** Line icons for the bottom navigation — identical set to the web BottomNav. */
export function TabIcon({ name, color, size = 22 }: { name: IconName; color: string; size?: number }) {
  const c = { fill: 'none', stroke: color, strokeWidth: 1.8, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  return (
    <Svg viewBox="0 0 24 24" width={size} height={size}>
      {name === 'home' && <Path d="M3 10.5 12 4l9 6.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z" {...c} />}
      {name === 'bike' && (
        <>
          <Circle cx={6} cy={17} r={3.2} {...c} />
          <Circle cx={18} cy={17} r={3.2} {...c} />
          <Path d="M6 17 10 9h5l2 4M9 9h4" {...c} />
        </>
      )}
      {name === 'orders' && (
        <>
          <Path d="M6 3h9l4 4v13a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z" {...c} />
          <Path d="M9 12h7M9 16h7M9 8h4" {...c} />
        </>
      )}
      {name === 'user' && (
        <>
          <Circle cx={12} cy={8} r={3.6} {...c} />
          <Path d="M5 20c0-3.6 3.1-6 7-6s7 2.4 7 6" {...c} />
        </>
      )}
    </Svg>
  );
}
