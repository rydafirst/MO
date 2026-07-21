import { useEffect, useRef, useState } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import { api, type Job } from '../api';
import type { AppNav } from '../nav';
import { PressableScale } from '../ui';
import { t } from '../theme';

type Role = 'CUSTOMER' | 'RIDER' | 'ADMIN';

// Non-terminal states worth surfacing as "you have something live right now".
const CUSTOMER_ACTIVE = ['CREATED', 'FUNDED', 'SEARCHING', 'ACCEPTED', 'EN_ROUTE_PICKUP', 'AT_PICKUP', 'IN_PROGRESS', 'EN_ROUTE_DROP', 'ARRIVED', 'AWAITING_CODE'];
const RIDER_ACTIVE = ['ACCEPTED', 'EN_ROUTE_PICKUP', 'AT_PICKUP', 'IN_PROGRESS', 'EN_ROUTE_DROP', 'ARRIVED', 'AWAITING_CODE'];

function label(status: string, isRider: boolean): string {
  if (isRider) return 'Active delivery — tap to continue';
  switch (status) {
    case 'CREATED': return 'Order awaiting payment';
    case 'FUNDED': case 'SEARCHING': return 'Finding you a rider…';
    case 'ACCEPTED': return 'Rider assigned';
    case 'EN_ROUTE_PICKUP': return 'Rider heading to pickup';
    case 'AT_PICKUP': return 'Rider at pickup';
    case 'IN_PROGRESS': return 'Your parcel is on the way';
    case 'EN_ROUTE_DROP': return 'Almost at the drop-off';
    case 'ARRIVED': case 'AWAITING_CODE': return 'Rider has arrived';
    default: return 'Order in progress';
  }
}

/**
 * Always-visible strip that appears while the user has a live order/trip, so they never lose track
 * of it while browsing other tabs (like the Uber "trip in progress" pill). Taps through to tracking.
 */
export function ActiveOrderBanner({ role, navigation }: { role: Role; navigation: AppNav }) {
  const isRider = role === 'RIDER';
  const [job, setJob] = useState<Job | null>(null);
  const pulse = useRef(new Animated.Value(0.4)).current;

  useEffect(() => {
    const anim = Animated.loop(Animated.sequence([
      Animated.timing(pulse, { toValue: 1, duration: 800, useNativeDriver: true }),
      Animated.timing(pulse, { toValue: 0.3, duration: 800, useNativeDriver: true }),
    ]));
    anim.start();
    return () => anim.stop();
  }, [pulse]);

  useEffect(() => {
    let stop = false;
    const active = isRider ? RIDER_ACTIVE : CUSTOMER_ACTIVE;
    const tick = async () => {
      try {
        const jobs = isRider ? await api.assignedJobs() : await api.myJobs();
        const found = jobs.find((j) => active.includes(j.status)) ?? null;
        if (!stop) setJob(found);
      } catch { /* keep last */ }
    };
    tick();
    const id = setInterval(tick, 6000);
    return () => { stop = true; clearInterval(id); };
  }, [isRider]);

  if (!job) return null;

  const open = () => navigation.navigate(isRider ? 'RiderJob' : 'Track', { jobId: job.id });

  return (
    <PressableScale onPress={open} style={s.wrap}>
      <Animated.View style={[s.dot, { opacity: pulse }]} />
      <Text style={s.text} numberOfLines={1}>{label(job.status, isRider)}</Text>
      <Text style={s.cta}>VIEW ›</Text>
    </PressableScale>
  );
}

const s = StyleSheet.create({
  wrap: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: t.ink, paddingVertical: 11, paddingHorizontal: 16 },
  dot: { width: 9, height: 9, borderRadius: 5, backgroundColor: t.primary },
  text: { flex: 1, color: t.onDark, fontSize: t.size.small, fontWeight: '600' },
  cta: { color: t.onDark, fontFamily: t.mono, fontSize: t.size.caption, letterSpacing: 0.6 },
});
