import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStack } from '../App';
import { getRole, getToken } from '../lib/session';
import { getRememberedTab, setRememberedTab } from '../lib/tabMemory';
import { api, type PendingRating } from '../api';
import { t } from '../theme';
import { TabIcon, type IconName } from '../components/TabIcon';
import { ActiveOrderBanner } from '../components/ActiveOrderBanner';
import { RatingModal } from '../components/RatingModal';
import { HomeTab } from './Home';
import { ActivityTab } from './Activity';
import { RiderHomeTab } from './RiderHome';
import { ProfileTab } from './Profile';

type Props = NativeStackScreenProps<RootStack, 'Main'>;
export type TabNav = Props['navigation'];

type Tab = { key: string; label: string; icon: IconName };

export function MainScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const [ready, setReady] = useState(false);
  const [role, setRole] = useState<'CUSTOMER' | 'RIDER' | 'ADMIN'>('CUSTOMER');
  // Start from the remembered tab (if any) so returning from a pushed detail lands on the same tab
  // instead of the role default; the first tab is otherwise chosen once the role is known.
  const [active, setActiveState] = useState<string | null>(getRememberedTab());
  const setActive = (key: string): void => { setRememberedTab(key); setActiveState(key); };

  useEffect(() => {
    getToken().then((tok) => {
      const r = getRole(tok);
      setRole(r);
      if (!getRememberedTab()) setActive(r === 'RIDER' ? 'dash' : 'book');
      setReady(true);
    });
  }, []);

  // Prompt the customer to rate any delivery they've completed but not yet rated (shown on open).
  const [pendingRating, setPendingRating] = useState<PendingRating | null>(null);
  useEffect(() => {
    if (!ready || role !== 'CUSTOMER') return;
    api.pendingRatings().then((list) => setPendingRating(list[0] ?? null)).catch(() => {});
  }, [ready, role]);

  const tabs: Tab[] = role === 'RIDER'
    ? [{ key: 'dash', label: 'Dashboard', icon: 'bike' }, { key: 'activity', label: 'Activity', icon: 'orders' }, { key: 'profile', label: 'Profile', icon: 'user' }]
    : [{ key: 'book', label: 'Book', icon: 'home' }, { key: 'activity', label: 'Activity', icon: 'orders' }, { key: 'profile', label: 'Profile', icon: 'user' }];

  if (!ready || !active) return <View style={s.center}><ActivityIndicator color={t.ink} /></View>;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: t.bg2 }} edges={['top', 'left', 'right']}>
      <View style={{ flex: 1 }}>
        {active === 'book' && <HomeTab navigation={navigation} />}
        {active === 'activity' && <ActivityTab navigation={navigation} role={role} />}
        {active === 'dash' && <RiderHomeTab navigation={navigation} />}
        {active === 'profile' && <ProfileTab navigation={navigation} onPrimary={() => setActive(role === 'RIDER' ? 'dash' : 'book')} />}
      </View>

      <ActiveOrderBanner role={role} navigation={navigation} />
      <RatingModal pending={pendingRating} onDone={() => setPendingRating(null)} />

      <View style={[s.bar, { paddingBottom: Math.max(insets.bottom, 8) }]}>
        {tabs.map((tab) => {
          const on = active === tab.key;
          const color = on ? t.ink : t.mid;
          return (
            <Pressable key={tab.key} onPress={() => setActive(tab.key)} style={s.tab}>
              <TabIcon name={tab.icon} color={color} />
              <Text style={[s.tabTxt, { color }]}>{tab.label.toUpperCase()}</Text>
            </Pressable>
          );
        })}
      </View>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: t.bg2 },
  bar: { flexDirection: 'row', borderTopWidth: 1, borderTopColor: t.line, backgroundColor: t.bg, paddingTop: 10 },
  tab: { flex: 1, alignItems: 'center', gap: 4 },
  tabTxt: { fontFamily: t.mono, fontSize: 9.5, fontWeight: '700', letterSpacing: 0.8 },
});
