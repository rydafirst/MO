import { useCallback, useEffect, useState } from 'react';
import { RefreshControl, ScrollView, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStack } from '../App';
import { api, type Notification } from '../api';
import { Card, Mono, PressableScale, Screen } from '../ui';
import { t } from '../theme';

// Relative time, e.g. "just now", "5m", "3h", "2d" — small and unobtrusive (matches web).
function ago(ms: number): string {
  const s = Math.max(0, Math.floor((Date.now() - ms) / 1000));
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d`;
}

export function NotificationsScreen({ navigation }: NativeStackScreenProps<RootStack, 'Notifications'>) {
  const [items, setItems] = useState<Notification[] | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try { setItems((await api.notifications()).items); } catch { setItems([]); }
  }, []);

  // Load, then mark everything read so the bell dot clears once the list has been opened.
  useEffect(() => {
    let done = false;
    (async () => {
      await load();
      if (!done) { try { await api.markNotificationsRead(); } catch { /* non-critical */ } }
    })();
    return () => { done = true; };
  }, [load]);

  const onRefresh = async () => { setRefreshing(true); await load(); setRefreshing(false); };

  return (
    <Screen title="Notifications" onBack={() => navigation.goBack()}>
      <ScrollView
        contentContainerStyle={{ padding: 20, paddingBottom: 40 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={t.ink} />}
      >
        {items === null && <Mono style={{ color: t.mid }}>LOADING…</Mono>}
        {items?.length === 0 && (
          <Card style={{ alignItems: 'center' }}>
            <Text style={{ color: t.ink2, fontSize: t.size.body }}>No notifications yet.</Text>
            <Mono style={{ color: t.mid, marginTop: 6, fontSize: t.size.caption }}>UPDATES ABOUT YOUR ORDERS APPEAR HERE</Mono>
          </Card>
        )}

        {items?.map((n) => {
          const card = (
            <Card style={{ marginBottom: 10, borderColor: n.read ? t.line : t.ink }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 1 }}>
                  {!n.read && <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: t.primary }} />}
                  <Text style={{ fontSize: t.size.body, fontWeight: '700', color: t.ink, flexShrink: 1 }}>{n.title}</Text>
                </View>
                <Mono style={{ fontSize: t.size.caption, color: t.mid }}>{ago(n.createdAt)}</Mono>
              </View>
              <Text style={{ fontSize: t.size.small, color: t.ink2, marginTop: 6, lineHeight: 19 }}>{n.body}</Text>
            </Card>
          );
          // Tapping an order-related notification jumps to that order's tracking page.
          return n.jobId ? (
            <PressableScale key={n.id} onPress={() => navigation.navigate('Track', { jobId: n.jobId as string })}>{card}</PressableScale>
          ) : (
            <View key={n.id}>{card}</View>
          );
        })}
      </ScrollView>
    </Screen>
  );
}
