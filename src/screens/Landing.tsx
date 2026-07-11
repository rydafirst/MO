import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStack } from '../App';
import { Button, Mono } from '../ui';
import { t } from '../theme';

export function LandingScreen({ navigation }: NativeStackScreenProps<RootStack, 'Landing'>) {
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: t.bg2, padding: 24 }}>
      <View style={{ flex: 1, justifyContent: 'center' }}>
        <Text style={s.wordmark}>Ryda<Text style={{ color: t.ink2, fontWeight: '400' }}>first</Text></Text>
        <Mono style={{ color: t.primary, letterSpacing: 2, marginTop: 6 }}>WE ARE FOR RIDERS</Mono>
        <Text style={s.h1}>Send anything across town, paid only on delivery.</Text>
        <Text style={s.p}>
          Your money is held safely in escrow and released to the rider the moment your delivery is
          confirmed — so no one can be cheated. Track every trip live, from pickup to your door.
        </Text>
      </View>
      <Button label="Get started" onPress={() => navigation.navigate('Login')} />
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  wordmark: { fontSize: 30, fontWeight: '700', color: t.ink, letterSpacing: -0.5 },
  h1: { fontSize: 26, fontWeight: '700', color: t.ink, letterSpacing: -0.5, marginTop: 22, lineHeight: 31 },
  p: { fontSize: 15, color: t.ink2, lineHeight: 22, marginTop: 12 },
});
