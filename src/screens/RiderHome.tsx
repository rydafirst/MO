import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import * as Location from 'expo-location';
import { api, naira, riderJobPayout, type AvailableJob, type Job } from '../api';
import type { AppNav } from '../nav';
import { AppHeader } from '../components/AppHeader';
import { JobsMap, type JobPin } from '../components/JobsMap';
import { IncomingJobOverlay } from '../components/IncomingJobOverlay';
import { Button, Card, Mono, Spacer, useToast } from '../ui';
import { t } from '../theme';
import { isRiderActive } from '../lib/jobStatus';

const MAX_ACTIVE = 2; // mirror of the server's MAX_ACTIVE_JOBS_PER_RIDER (UX-only; server enforces)
import { maybePromptFullScreenIntent } from '../lib/fullScreenPermission';
import { chime } from '../lib/settings';
/** Metres -> "X.X km" for the rider's job cards. */
const km = (m: number) => `${(Math.round(m / 100) / 10).toFixed(1)} KM`;

export function RiderHomeTab({ navigation, onOpenPayout }: { navigation: AppNav; onOpenPayout?: () => void }) {
  const toast = useToast();
  const [online, setOnline] = useState(false);
  const [jobs, setJobs] = useState<AvailableJob[]>([]);
  // A rider may stack up to MAX_ACTIVE active deliveries (mirrors the server cap; the server is the real
  // enforcer — this is just for a responsive UI). Keep in sync with MAX_ACTIVE_JOBS_PER_RIDER (default 2).
  const [activeJobs, setActiveJobs] = useState<Job[]>([]);
  const [hasBank, setHasBank] = useState<boolean | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [incoming, setIncoming] = useState<AvailableJob | null>(null); // full-screen takeover for a new job
  const seenIds = useRef<Set<string>>(new Set());                       // jobs already surfaced (shown/dismissed) — takeover once

  const loadOnce = useCallback(async () => {
    await Promise.all([
      api.getAvailability().then((a) => setOnline(a.online)).catch(() => {}),
      api.assignedJobs().then((js) => setActiveJobs(js.filter((j) => isRiderActive(j.status)))).catch(() => {}),
      api.getAccount().then((a) => setHasBank(a != null)).catch(() => setHasBank(null)),
    ]);
  }, []);

  useEffect(() => { loadOnce(); }, [loadOnce]);

  // Re-check the active delivery every time the dashboard regains focus — e.g. after the rider presses
  // BACK from the trip screen. Without this the dashboard kept the stale value from first mount, so the
  // "Resume delivery" banner never appeared and the rider couldn't get back to the trip they were on.
  useEffect(() => {
    const unsub = navigation.addListener('focus', () => { void loadOnce(); });
    return unsub;
  }, [navigation, loadOnce]);

  // Last known rider position, refreshed while online so the feed can rank jobs by nearness.
  const posRef = useRef<{ lat: number; lng: number } | undefined>(undefined);
  const loadFeed = useCallback(async () => {
    try { setJobs(await api.availableJobs(posRef.current)); } catch { /* keep last */ }
  }, []);

  useEffect(() => {
    if (!online) { setJobs([]); posRef.current = undefined; return; }
    let active = true;
    (async () => {
      // Best-effort location: if granted, the board is ordered nearest-first with per-job ETA.
      const perm = await Location.getForegroundPermissionsAsync();
      const ok = perm.granted || (await Location.requestForegroundPermissionsAsync()).granted;
      if (ok && active) {
        try { const p = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }); posRef.current = { lat: p.coords.latitude, lng: p.coords.longitude }; } catch { /* no fix */ }
      }
      if (active) loadFeed();
    })();
    const id = setInterval(loadFeed, 4000);
    return () => { active = false; clearInterval(id); };
  }, [online, loadFeed]);

  const noBank = hasBank === false;

  // Surface the newest job the rider hasn't seen as a full-screen takeover — but only one at a time,
  // and only when they can actually take it (online, no active delivery, bank on file). Each job is
  // marked seen so it can never take over twice; if it's declined it stays in the list below.
  useEffect(() => {
    if (!online || activeJobs.length >= MAX_ACTIVE || noBank || incoming) return;
    const fresh = jobs.find((j) => !seenIds.current.has(j.id));
    if (fresh) {
      seenIds.current.add(fresh.id);
      setIncoming(fresh);
      // Audible alert so a rider doesn't miss a new job while looking away. Reuses the shared chime,
      // so it honours the "Alert sounds" toggle in Profile and needs no bundled audio asset.
      chime('New delivery nearby', 'A new delivery is available — tap to accept.');
    }
  }, [jobs, online, activeJobs.length, noBank, incoming]);

  // Tear the takeover down the moment the rider is no longer eligible (went offline, or is already at
  // the active-delivery cap) so a stale card can't linger.
  useEffect(() => { if (!online || activeJobs.length >= MAX_ACTIVE) setIncoming(null); }, [online, activeJobs.length]);

  const toggle = async () => {
    if (noBank) { onOpenPayout?.(); return; }
    const next = !online;
    setOnline(next);
    try {
      await api.setAvailability(next);
      // Going online is exactly when full-screen job alerts start mattering — nudge the rider (once)
      // to enable Android 14+'s full-screen-notification toggle. Best-effort; never blocks.
      if (next) void maybePromptFullScreenIntent();
    } catch (e) { setOnline(!next); toast((e as Error).message); }
  };

  const onRefresh = async () => { setRefreshing(true); await Promise.all([loadOnce(), online ? loadFeed() : Promise.resolve()]); setRefreshing(false); };

  const accept = async (id: string) => {
    if (noBank) { onOpenPayout?.(); return; }
    // Stacking cap: if the rider is already at the max active deliveries, don't accept another — take
    // them to their first active trip. Mirrors the server guard, so the button is a fast local no-op
    // instead of a round-trip that 409s.
    if (activeJobs.length >= MAX_ACTIVE) { toast(`You already have ${activeJobs.length} active deliveries — finish or release one first`); navigation.navigate('RiderJob', { jobId: activeJobs[0].id }); return; }
    try { const j = await api.accept(id); navigation.navigate('RiderJob', { jobId: j.id }); }
    catch (e) { toast((e as Error).message); loadFeed(); }
  };

  return (
    <>
    <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 40 }} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={t.ink} />}>
      <AppHeader navigation={navigation} />
      <Spacer h={16} />
      {activeJobs.length > 0 && (
        <Card style={{ borderColor: t.ink, marginBottom: 16 }}>
          <Mono>{activeJobs.length > 1 ? `YOU HAVE ${activeJobs.length} ACTIVE DELIVERIES` : 'YOU HAVE AN ACTIVE DELIVERY'}</Mono>
          {activeJobs.map((j, i) => (
            <View key={j.id} style={{ marginTop: i === 0 ? 8 : 12, borderTopWidth: i === 0 ? 0 : 1, borderTopColor: t.line2, paddingTop: i === 0 ? 0 : 12 }}>
              <Text style={{ fontSize: t.size.body, fontWeight: '700' }}>{naira(riderJobPayout(j))} · {j.status.replace(/_/g, ' ').toLowerCase()}</Text>
              <Text style={{ fontSize: t.size.caption, color: t.ink2, marginTop: 2 }} numberOfLines={1}>
                {(j.pickupArea || 'Pickup')} → {(j.dropoffArea || 'Drop-off')}
              </Text>
              <Spacer h={8} />
              <Button label={activeJobs.length > 1 ? `Open delivery ${i + 1}` : 'Resume delivery'} onPress={() => navigation.navigate('RiderJob', { jobId: j.id })} />
            </View>
          ))}
        </Card>
      )}

      {noBank && (
        <Card style={{ borderColor: t.primary, marginTop: 12 }}>
          <Text style={{ fontSize: t.size.body, color: t.ink }}>Add a payout bank account to start earning — it&apos;s where your delivery money is paid.</Text>
          <Spacer h={8} />
          <Pressable onPress={onOpenPayout}><Mono style={{ color: t.primary }}>ADD YOUR BANK ACCOUNT →</Mono></Pressable>
        </Card>
      )}

      {online ? (
        <View style={{ marginVertical: 12 }}>
          <JobsMap pins={jobs.map((j): JobPin => ({ id: j.id, lat: j.pickupApprox.lat, lng: j.pickupApprox.lng, label: naira(j.riderPayoutMinor ?? j.amountMinor) }))} />
          <Mono style={{ textAlign: 'center', color: t.ink2, marginTop: 8 }}>
            {jobs.length ? `${jobs.length} JOB${jobs.length > 1 ? 'S' : ''} NEARBY` : 'ONLINE — WAITING FOR JOBS'}
          </Mono>
        </View>
      ) : (
        <View style={s.statusBox}><Text style={s.statusTxt}>OFFLINE</Text></View>
      )}
      <Button label={online ? 'Go offline' : 'Go online'} variant={online ? 'ghost' : 'primary'} onPress={toggle} disabled={noBank} />

      {online && (
        <View style={{ marginTop: 16 }}>
          <Mono style={{ marginBottom: 8 }}>AVAILABLE JOBS</Mono>
          {activeJobs.length >= MAX_ACTIVE && (
            <Mono style={{ color: t.ink2, marginBottom: 8 }}>YOU&apos;RE AT THE MAX OF {MAX_ACTIVE} ACTIVE DELIVERIES — FINISH ONE TO ACCEPT A NEW ONE</Mono>
          )}
          {jobs.length === 0 ? (
            <Card style={{ alignItems: 'center' }}><Mono style={{ color: t.mid }}>NO JOBS YET — YOU&apos;LL SEE THEM HERE</Mono></Card>
          ) : jobs.map((j) => (
            <Card key={j.id} style={{ marginBottom: 10 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Mono>{j.type}</Mono>
                  {/* #4 MULTI-STOP: flag extra drop-offs BEFORE the rider accepts, so the added work is visible. */}
                  {j.stopCount && j.stopCount > 1 ? (
                    <View style={{ backgroundColor: t.ink, borderRadius: t.radius.sm, paddingHorizontal: 7, paddingVertical: 2 }}>
                      <Mono style={{ color: t.onDark, fontSize: t.size.caption }}>{j.stopCount} DROPS</Mono>
                    </View>
                  ) : null}
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Mono style={{ fontSize: t.size.caption, color: t.mid }}>YOU EARN</Mono>
                  <Text style={{ fontFamily: t.mono, fontSize: t.size.subtitle, fontWeight: '700' }}>{naira(j.riderPayoutMinor ?? j.amountMinor)}</Text>
                </View>
              </View>
              <Text style={{ fontSize: t.size.small, marginVertical: 8 }}>{j.pickupArea || 'Nearby'} <Text style={{ color: t.mid }}>→</Text> {j.dropoffArea || 'Nearby'}{j.stopCount && j.stopCount > 1 ? ` +${j.stopCount - 1} more` : ''}</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
                {j.toPickupMeters !== undefined && (
                  <Mono style={{ color: t.ink }}>{km(j.toPickupMeters)} · ~{j.toPickupEtaMin} MIN AWAY</Mono>
                )}
                <Mono style={{ color: t.mid }}>TRIP {km(j.tripDistanceMeters)} · ~{j.tripEtaMin} MIN</Mono>
              </View>
              <Button label="Accept job" onPress={() => accept(j.id)} disabled={noBank || activeJobs.length >= MAX_ACTIVE} />
            </Card>
          ))}
        </View>
      )}

      <Spacer h={16} />
      <Button label="Documents & verification" variant="ghost" onPress={() => navigation.navigate('Documents')} />
    </ScrollView>
    <IncomingJobOverlay
      job={incoming}
      onAccept={(id) => { setIncoming(null); accept(id); }}
      onDismiss={() => setIncoming(null)}
    />
    </>
  );
}

const s = StyleSheet.create({
  statusBox: { height: 150, borderRadius: t.radius.md, backgroundColor: t.ink, alignItems: 'center', justifyContent: 'center', marginVertical: 12 },
  statusTxt: { color: t.onDark, fontFamily: t.mono, fontSize: t.size.small, letterSpacing: 1 },
});
