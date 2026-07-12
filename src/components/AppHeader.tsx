import { useCallback, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { api } from '../api';
import type { AppNav } from '../nav';
import { TabIcon } from './TabIcon';
import { t } from '../theme';

/**
 * Shared top bar: the Rydafirst wordmark on the left, a notifications bell on the right.
 * The bell shows a small orange dot when there are unread notifications. Tapping it opens the
 * in-app notifications list. The unread count refreshes whenever the host screen regains focus
 * (and is polled lightly while focused) so the dot stays current after actions elsewhere.
 */
export function AppHeader({ navigation }: { navigation: AppNav }) {
  const [unread, setUnread] = useState(0);

  const refresh = useCallback(() => {
    api.notifications().then((n) => setUnread(n.unread)).catch(() => {});
  }, []);

  useFocusEffect(
    useCallback(() => {
      refresh();
      const id = setInterval(refresh, 20000);
      return () => clearInterval(id);
    }, [refresh]),
  );

  return (
    <View style={s.row}>
      <Text style={s.brand}>Ryda<Text style={{ color: t.ink2, fontWeight: '400' }}>first</Text></Text>
      <Pressable
        onPress={() => navigation.navigate('Notifications')}
        hitSlop={12}
        accessibilityLabel={unread ? `Notifications, ${unread} unread` : 'Notifications'}
        style={s.bell}
      >
        <TabIcon name="bell" color={t.ink} size={22} />
        {unread > 0 && <View style={s.dot} />}
      </Pressable>
    </View>
  );
}

const s = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  brand: { fontSize: 20, fontWeight: '700', color: t.ink, letterSpacing: -0.5 },
  bell: { padding: 4 },
  dot: {
    position: 'absolute', top: 2, right: 2, width: 9, height: 9, borderRadius: 5,
    backgroundColor: t.primary, borderWidth: 1.5, borderColor: t.bg,
  },
});
