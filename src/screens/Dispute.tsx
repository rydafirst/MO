import { useState } from 'react';
import { ScrollView, Switch, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStack } from '../App';
import { api } from '../api';
import { Button, Card, Mono, Screen, Spacer, useToast } from '../ui';
import { t } from '../theme';

export function DisputeScreen({ route, navigation }: NativeStackScreenProps<RootStack, 'Dispute'>) {
  const { jobId } = route.params;
  const toast = useToast();
  const [counter, setCounter] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const open = async () => {
    setBusy(true);
    try { const d = await api.openDispute(jobId, counter); setResult(d.tier === 'auto' ? `Auto-resolved: ${d.resolution}` : 'Escalated for review'); }
    catch (e) { toast((e as Error).message); } finally { setBusy(false); }
  };

  return (
    <Screen title="Open a dispute" onBack={() => navigation.goBack()}>
      <ScrollView contentContainerStyle={{ padding: 20 }}>
        <Text style={{ color: t.ink2, fontSize: 13, marginBottom: 12 }}>Funds freeze immediately. Clear-cut cases resolve automatically; the rest go to a reviewer.</Text>
        <Card>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text style={{ fontSize: 14, flex: 1 }}>I have evidence that contradicts the record</Text>
            <Switch value={counter} onValueChange={setCounter} trackColor={{ true: t.ink }} />
          </View>
        </Card>
        <Spacer h={16} />
        <Button label="Open dispute" onPress={open} busy={busy} />
        {result && <Mono style={{ marginTop: 12, color: t.ink, fontWeight: '700' }}>{result.toUpperCase()}</Mono>}
      </ScrollView>
    </Screen>
  );
}
