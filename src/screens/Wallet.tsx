import { useEffect, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStack } from '../App';
import { api, naira } from '../api';
import { Card, Mono, Screen } from '../ui';
import { t } from '../theme';

export function WalletScreen({ navigation }: NativeStackScreenProps<RootStack, 'Wallet'>) {
  const [w, setW] = useState<{ releasedMinor: number; jobsCount: number; activeCount: number } | null>(null);
  useEffect(() => { api.wallet().then(setW).catch(() => {}); }, []);

  return (
    <Screen title="Wallet" onBack={() => navigation.goBack()}>
      <ScrollView contentContainerStyle={{ padding: 20 }}>
        <Card style={{ marginBottom: 12 }}>
          <Mono>RELEASED EARNINGS</Mono>
          <Text style={{ fontFamily: t.mono, fontSize: 30, fontWeight: '700', marginTop: 4 }}>{w ? naira(w.releasedMinor) : '—'}</Text>
          <Text style={{ fontSize: 12.5, color: t.ink2, marginTop: 6, lineHeight: 18 }}>
            Earnings are paid directly to your bank after each completed delivery — this is a view of the ledger, not a held balance.
          </Text>
        </Card>
        <View style={{ flexDirection: 'row', gap: 12 }}>
          <Card style={{ flex: 1 }}><Mono>COMPLETED</Mono><Text style={{ fontFamily: t.mono, fontSize: 22, fontWeight: '700', marginTop: 4 }}>{w?.jobsCount ?? '—'}</Text></Card>
          <Card style={{ flex: 1 }}><Mono>ACTIVE</Mono><Text style={{ fontFamily: t.mono, fontSize: 22, fontWeight: '700', marginTop: 4 }}>{w?.activeCount ?? '—'}</Text></Card>
        </View>
      </ScrollView>
    </Screen>
  );
}
