import { useState } from 'react';
import { ScrollView, Switch, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStack } from '../App';
import { api } from '../api';
import { Button, Screen, Spacer, useToast } from '../ui';
import { t } from '../theme';

const ITEMS = [
  ['ninVerified', 'NIN verified'], ['bvnVerified', 'BVN verified'],
  ['idDocUploaded', 'Government ID uploaded'], ['selfieMatched', 'Selfie / liveness matched'],
  ['addressProvided', 'Home address provided'],
] as const;
type Key = (typeof ITEMS)[number][0];

export function KycScreen({ navigation }: NativeStackScreenProps<RootStack, 'Kyc'>) {
  const toast = useToast();
  const [state, setState] = useState<Record<Key, boolean>>({ ninVerified: false, bvnVerified: false, idDocUploaded: false, selfieMatched: false, addressProvided: false });
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    try { await api.submitKyc(state); toast('KYC submitted — pending review.', 'success'); setTimeout(() => navigation.goBack(), 900); }
    catch (e) { toast((e as Error).message); } finally { setBusy(false); }
  };

  return (
    <Screen title="Rider verification" onBack={() => navigation.goBack()}>
      <ScrollView contentContainerStyle={{ padding: 20 }}>
        <Text style={{ color: t.ink2, fontSize: 13, marginBottom: 4 }}>You can&apos;t accept jobs until NIN + BVN are verified.</Text>
        {ITEMS.map(([k, l]) => (
          <View key={k} style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: t.line2 }}>
            <Text style={{ fontSize: 15 }}>{l}</Text>
            <Switch value={state[k]} onValueChange={(v) => setState((s) => ({ ...s, [k]: v }))} trackColor={{ true: t.ink }} />
          </View>
        ))}
        <Spacer h={16} />
        <Button label="Submit for review" onPress={submit} busy={busy} />
      </ScrollView>
    </Screen>
  );
}
