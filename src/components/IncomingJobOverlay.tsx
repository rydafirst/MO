import { useEffect, useRef } from 'react';
import { Animated, Modal, StyleSheet, Text, View } from 'react-native';
import { naira, type AvailableJob } from '../api';
import { Button } from '../ui';
import { t } from '../theme';

const km = (m: number) => `${(Math.round(m / 100) / 10).toFixed(1)} KM`;

/**
 * Full-screen "incoming job" takeover, inDrive/Uber style. Shown to an online rider when a new
 * delivery lands near them, so it isn't missed at the bottom of a list. It auto-dismisses after
 * `durationMs` and drops back into the normal available-jobs list.
 *
 * Privacy by construction: it is fed only an `AvailableJob` — the pre-accept feed shape, which
 * carries coarse areas + an approximate pin + fare, and NO recipient, phone, or exact address. The
 * rider sees the real details only after they accept, exactly like the list card. It also can never
 * block the UI permanently (the timer always tears it down) and only ever shows one job at a time.
 */
export function IncomingJobOverlay({
  job, onAccept, onDismiss, durationMs = 10_000,
}: {
  job: AvailableJob | null;
  onAccept: (id: string) => void;
  onDismiss: () => void;
  durationMs?: number;
}) {
  const progress = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (!job) return;
    progress.setValue(1);
    const anim = Animated.timing(progress, { toValue: 0, duration: durationMs, useNativeDriver: false });
    anim.start();
    const timer = setTimeout(onDismiss, durationMs);
    return () => { anim.stop(); clearTimeout(timer); };
    // Restart whenever a different job takes over.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [job?.id]);

  if (!job) return null;
  const barWidth = progress.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] });

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onDismiss}>
      <View style={s.scrim}>
        <View style={s.sheet}>
          <Text style={s.kicker}>NEW DELIVERY NEARBY</Text>

          <Text style={s.fare}>{naira(job.amountMinor)}</Text>
          <Text style={s.route}>
            {job.pickupArea || 'Nearby'} <Text style={{ color: t.mid }}>→</Text> {job.dropoffArea || 'Nearby'}
          </Text>

          <View style={s.stats}>
            {job.toPickupMeters !== undefined ? (
              <Text style={s.stat}>{km(job.toPickupMeters)} · ~{job.toPickupEtaMin} MIN AWAY</Text>
            ) : null}
            <Text style={[s.stat, { color: t.mid }]}>TRIP {km(job.tripDistanceMeters)} · ~{job.tripEtaMin} MIN</Text>
          </View>

          <View style={s.track}><Animated.View style={[s.fill, { width: barWidth }]} /></View>

          <Button label="Accept delivery" onPress={() => onAccept(job.id)} />
          <View style={{ height: 10 }} />
          <Button label="Dismiss" variant="ghost" onPress={onDismiss} />
        </View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  scrim: { flex: 1, backgroundColor: 'rgba(17,17,17,0.55)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: t.bg, borderTopLeftRadius: t.radius.lg + 12, borderTopRightRadius: t.radius.lg + 12, padding: 24, paddingBottom: 36, gap: 6 },
  kicker: { fontFamily: t.mono, fontSize: t.size.caption, letterSpacing: 1, color: t.primary, fontWeight: '700' },
  fare: { fontFamily: t.mono, fontSize: t.size.display, fontWeight: '700', color: t.ink, marginTop: 4 },
  route: { fontSize: t.size.body, color: t.ink },
  stats: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 10, marginBottom: 16 },
  stat: { fontFamily: t.mono, fontSize: t.size.caption, color: t.ink },
  track: { height: 4, borderRadius: t.radius.pill, backgroundColor: t.line2, overflow: 'hidden', marginBottom: 18 },
  fill: { height: 4, borderRadius: t.radius.pill, backgroundColor: t.primary },
});
