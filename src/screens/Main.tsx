import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStack } from '../App';
import { getRole, getToken } from '../lib/session';
import { t } from '../theme';
import { TabIcon, type IconName } from '../components/TabIcon';
import { HomeTab } from './Home';
import { OrdersTab } from './Orders';
import { RiderHomeTab } from './RiderHome';
import { ProfileTab } from './Profile';

type Props = NativeStackScreenProps<RootStack, 'Main'>;
export type TabNav = Props['navigation'];

type Tab = { key: string; label: string; icon: IconName };

export function MainScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const [ready, setReady] = useState(false);
  const [role, setRole] = useState<'CUSTOMER' | 'RIDER' | 'ADMIN'>('CUSTOMER');

  useEffect(() => { getToken().then((tok) => { setRole(getRole(tok)); setReady(true); }); }, []);

  const tabs: Tab[] = role === 'RIDER'
    ? [{ key: 'dash', label: 'Dashboard', icon: 'bike' }, { key: 'profile', label: 'Profile', icon: 'user' }]
    : [{ key: 'book', label: 'Book', icon: 'home' }, { key: 'orders', label: 'Orders', icon: 'orders' }, { key: 'profile', label: 'Profile', icon: 'user' }];
  const [active, setActive] = useState(tabs[0].key);

  if (!ready) return <View style={s.center}><ActivityIndicator color={t.ink} /></View>;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: t.bg2 }} edges={['top', 'left', 'right']}>
      <View style={{ flex: 1 }}>
        {active === 'book' && <HomeTab navigation={navigation} />}
        {active === 'orders' && <OrdersTab navigation={navigation} onBook={() => setActive('book')} />}
        {active === 'dash' && <RiderHomeTab navigation={navigation} />}
        {active === 'profile' && <ProfileTab navigation={navigation} onPrimary={() => setActive(role === 'RIDER' ? 'dash' : 'book')} />}
      </View>

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
