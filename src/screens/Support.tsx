import { useCallback, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStack } from '../App';
import { api, type SupportCategory, type SupportStatus, type SupportThread } from '../api';
import { SUPPORT_CATEGORIES, SUPPORT_CATEGORY_HINT, SUPPORT_CATEGORY_LABEL } from '../lib/supportBot';
import { Button, Card, Mono, Pill, PressableScale, Screen, Spacer, useToast } from '../ui';
import { t } from '../theme';

function statusChip(status: SupportStatus): { text: string; color: string } {
  switch (status) {
    case 'BOT': return { text: 'In progress', color: t.info };
    case 'AWAITING_AGENT': return { text: 'Waiting for agent', color: t.warning };
    case 'AGENT_JOINED': return { text: 'Agent connected', color: t.success };
    case 'RESOLVED': return { text: 'Resolved', color: t.ink2 };
  }
}

// Compact "time ago" for the thread list, so the inbox reads at a glance.
function ago(ms: number): string {
  const s = Math.max(0, Math.round((Date.now() - ms) / 1000));
  if (s < 60) return 'just now';
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  return `${d}d ago`;
}

export function SupportScreen({ navigation }: NativeStackScreenProps<RootStack, 'Support'>) {
  const toast = useToast();
  const [threads, setThreads] = useState<SupportThread[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [picking, setPicking] = useState(false);

  // Reload the inbox each time the screen comes into focus, so a thread opened/updated elsewhere
  // (or a fresh escalation) shows the current status when you come back.
  useFocusEffect(
    useCallback(() => {
      let live = true;
      api.mySupportThreads()
        .then((ts) => { if (live) { setThreads(ts); setLoaded(true); } })
        .catch((e) => { if (live) { setLoaded(true); toast((e as Error).message); } });
      return () => { live = false; };
    }, [toast]),
  );

  const start = (category: SupportCategory) => {
    setPicking(false);
    navigation.navigate('SupportChat', { category });
  };

  return (
    <Screen title="Help & support" onBack={() => navigation.goBack()}>
      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 40 }}>
        {picking ? (
          <>
            <Mono style={{ marginBottom: 6 }}>WHAT DO YOU NEED HELP WITH?</Mono>
            <Text style={{ fontSize: t.size.small, color: t.ink2, lineHeight: 19, marginBottom: 14 }}>
              Pick the closest topic. We’ll ask a couple of quick questions, then connect you to an agent.
            </Text>
            {SUPPORT_CATEGORIES.map((c) => (
              <PressableScale key={c} onPress={() => start(c)} style={{ marginBottom: 10 }}>
                <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: t.size.body, fontWeight: '700', color: t.ink }}>{SUPPORT_CATEGORY_LABEL[c]}</Text>
                    <Text style={{ fontSize: t.size.small, color: t.ink2, marginTop: 3, lineHeight: 18 }}>{SUPPORT_CATEGORY_HINT[c]}</Text>
                  </View>
                  <Mono style={{ color: t.mid }}>→</Mono>
                </Card>
              </PressableScale>
            ))}
            <Spacer h={6} />
            <Button label="Cancel" variant="ghost" onPress={() => setPicking(false)} />
          </>
        ) : (
          <>
            <Button label="New conversation" onPress={() => setPicking(true)} />
            <Spacer h={16} />

            {loaded && threads.length === 0 && (
              <Card style={{ alignItems: 'center', paddingVertical: 28 }}>
                <Text style={{ fontSize: t.size.subtitle, fontWeight: '700', color: t.ink }}>No conversations yet</Text>
                <Text style={{ fontSize: t.size.small, color: t.ink2, textAlign: 'center', lineHeight: 20, marginTop: 6, paddingHorizontal: 16 }}>
                  Start a conversation and our assistant will help — or hand you to a support agent.
                </Text>
              </Card>
            )}

            {threads.map((th) => {
              const chip = statusChip(th.status);
              return (
                <PressableScale key={th.id} onPress={() => navigation.navigate('SupportChat', { threadId: th.id })} style={{ marginBottom: 10 }}>
                  <Card>
                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                      <Text style={{ fontSize: t.size.body, fontWeight: '700', color: t.ink, flexShrink: 1 }}>{SUPPORT_CATEGORY_LABEL[th.category]}</Text>
                      <Pill text={chip.text} color={chip.color} />
                    </View>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6 }}>
                      {th.jobId ? <Mono style={{ color: t.mid, fontSize: t.size.caption }}>TRIP · {th.jobId.slice(0, 8).toUpperCase()}</Mono> : null}
                      <Mono style={{ color: t.mid, fontSize: t.size.caption }}>{ago(th.updatedAt)}</Mono>
                    </View>
                  </Card>
                </PressableScale>
              );
            })}
          </>
        )}
      </ScrollView>
    </Screen>
  );
}
