import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStack } from '../App';
import { getRole, getToken } from '../lib/session';
import { t } from '../theme';
import { HomeTab } from './Home';
import { OrdersTab } from './Orders';
import { RiderHomeTab } from './RiderHome';
import { ProfileTab } from './Profile';

type Props = NativeStackScreenProps<RootStack, 'Main'>;
export type TabNav = Props['navigation'];

export function MainScreen({ navigation }: Props) {
  const [ready, setReady] = useState(false);
  const [role, setRole] = useState<'CUSTOMER' | 'RIDER' | 'ADMIN'>('CUSTOMER');

  useEffect(() => { getToken().then((tok) => { setRole(getRole(tok)); setReady(true); }); }, []);

  const tabs = role === 'RIDER'
    ? [{ key: 'dash', label: 'Dashboard' }, { key: 'profile', label: 'Profile' }]
    : [{ key: 'book', label: 'Book' }, { key: 'orders', label: 'Orders' }, { key: 'profile', label: 'Profile' }];
  const [active, setActive] = useState(tabs[0].key);

  if (!ready) return <View style={s.center}><ActivityIndicator color={t.ink} /></View>;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: t.bg2 }} edges={['top', 'left', 'right']}>
      <View style={{ flex: 1 }}>
        {active === 'book' && <HomeTab navigation={navigation} />}
        {active === 'orders' && <OrdersTab navigation={navigation} />}
        {active === 'dash' && <RiderHomeTab navigation={navigation} />}
        {active === 'profile' && <ProfileTab navigation={navigation} />}
      </View>

      <View style={s.bar}>
        {tabs.map((tab) => {
          const on = active === tab.key;
          return (
            <Pressable key={tab.key} onPress={() => setActive(tab.key)} style={s.tab}>
              <View style={[s.accent, { backgroundColor: on ? t.primary : 'transparent' }]} />
              <Text style={[s.tabTxt, { color: on ? t.ink : t.mid }]}>{tab.label.toUpperCase()}</Text>
            </Pressable>
          );
        })}
      </View>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: t.bg2 },
  bar: { flexDirection: 'row', borderTopWidth: 1, borderTopColor: t.line, backgroundColor: t.bg },
  tab: { flex: 1, alignItems: 'center', paddingBottom: 10 },
  accent: { height: 2, width: 28, borderRadius: 2, marginBottom: 10 },
  tabTxt: { fontFamily: t.mono, fontSize: 10, fontWeight: '700', letterSpacing: 0.8 },
});
