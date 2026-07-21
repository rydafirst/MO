import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Circle, G, Line, Path, Rect } from 'react-native-svg';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStack } from '../App';
import { Button, Mono } from '../ui';
import { t } from '../theme';

export function LandingScreen({ navigation }: NativeStackScreenProps<RootStack, 'Landing'>) {
  const toLogin = () => navigation.navigate('Login');
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: t.bg2 }} edges={['top', 'left', 'right', 'bottom']}>
      <View style={{ flex: 1, padding: 24 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <Text style={s.wordmark}>Ryda<Text style={{ color: t.ink2, fontWeight: '400' }}>first</Text></Text>
          <Mono onPress={toLogin} style={{ fontSize: t.size.caption, color: t.ink2, letterSpacing: 0.7 }}>SIGN IN →</Mono>
        </View>

        <View style={{ flex: 1, justifyContent: 'center' }}>
          <CourierIllustration />
          <Mono style={{ fontSize: t.size.caption, color: t.primary, letterSpacing: 1.6, marginTop: 20 }}>WE ARE FOR RIDERS</Mono>
          <Text style={s.h1}>Send anything across town, paid only on delivery.</Text>
          <Text style={s.p}>
            Your money is held safely in escrow and released to the rider the moment your delivery is
            confirmed — so no one can be cheated. Track every trip live, from pickup to your door.
          </Text>
        </View>

        <View style={{ gap: 10, paddingBottom: 8 }}>
          <Button label="Get started" onPress={toLogin} />
          <Mono onPress={toLogin} style={{ textAlign: 'center', fontSize: t.size.caption, color: t.ink, letterSpacing: 0.7, paddingVertical: 4 }}>I WANT TO RIDE & EARN →</Mono>
        </View>
      </View>
    </SafeAreaView>
  );
}

// Minimal monochrome courier illustration — identical to the web landing. The one orange accent
// (the parcel) ties to the primary CTA.
function CourierIllustration() {
  const ink = t.ink;
  return (
    <Svg viewBox="0 0 400 240" width="100%" height={220}>
      <Line x1="20" y1="212" x2="380" y2="212" stroke={t.line} strokeWidth="3" strokeLinecap="round" />
      <G stroke={t.mid} strokeWidth="3" strokeLinecap="round">
        <Line x1="18" y1="150" x2="60" y2="150" />
        <Line x1="8" y1="172" x2="46" y2="172" />
        <Line x1="24" y1="194" x2="58" y2="194" />
      </G>
      <G fill="none" stroke={ink} strokeWidth="9">
        <Circle cx="128" cy="184" r="30" />
        <Circle cx="300" cy="184" r="30" />
      </G>
      <G fill={ink}>
        <Circle cx="128" cy="184" r="6" />
        <Circle cx="300" cy="184" r="6" />
      </G>
      <G fill="none" stroke={ink} strokeWidth="9" strokeLinecap="round" strokeLinejoin="round">
        <Path d="M128 184 L188 150 L262 150" />
        <Path d="M300 184 L262 150" />
        <Path d="M262 150 L288 120" />
        <Path d="M188 150 L172 120" />
      </G>
      <Line x1="288" y1="120" x2="308" y2="112" stroke={ink} strokeWidth="9" strokeLinecap="round" />
      <G rotation={-4} originX={120} originY={120}>
        <Rect x="86" y="96" width="70" height="54" rx="6" fill={t.primary} />
        <Line x1="121" y1="96" x2="121" y2="150" stroke={t.primaryInk} strokeWidth="3" opacity="0.7" />
        <Line x1="86" y1="123" x2="156" y2="123" stroke={t.primaryInk} strokeWidth="3" opacity="0.7" />
      </G>
      <G fill="none" stroke={ink} strokeWidth="9" strokeLinecap="round" strokeLinejoin="round">
        <Path d="M196 128 L214 92" />
        <Path d="M214 96 L300 112" />
        <Path d="M196 128 L188 150" />
      </G>
      <Circle cx="222" cy="74" r="20" fill={ink} />
      <Path d="M204 78 h30" stroke={t.bg} strokeWidth="6" strokeLinecap="round" />
    </Svg>
  );
}

const s = StyleSheet.create({
  wordmark: { fontSize: t.size.heading, fontWeight: '700', color: t.ink, letterSpacing: -0.4 },
  h1: { fontSize: t.size.display, fontWeight: '700', color: t.ink, letterSpacing: -0.7, marginTop: 4, lineHeight: 35 },
  p: { fontSize: t.size.body, color: t.ink2, lineHeight: 22, marginTop: 10 },
});
