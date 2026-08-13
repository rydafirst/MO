import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, AppState, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { NavigationContainer, createNavigationContainerRef } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import * as Notifications from 'expo-notifications';
import { ToastProvider } from './ui';
import { t } from './theme';
import { getToken, getRole } from './lib/session';
import { registerForPush } from './lib/push';
import { startPersistentAlert, stopPersistentAlert } from './lib/urgentAlert';
import { loadSoundSetting } from './lib/settings';
import { api } from './api';
import { isRiderActive } from './lib/jobStatus';
import { TRIP_PRESENCE_KIND } from './lib/tripPresence';
import { STAGE_NUDGE_KIND } from './lib/stageNudge';
import { LandingScreen } from './screens/Landing';
import { LoginScreen } from './screens/Login';
import { MainScreen } from './screens/Main';
import { TrackScreen } from './screens/Track';
import { RiderJobScreen } from './screens/RiderJob';
import { DisputeScreen } from './screens/Dispute';
import { ChatScreen } from './screens/Chat';
import { NotificationsScreen } from './screens/Notifications';
import { DocumentsScreen } from './screens/Documents';
import { ActivityDetailScreen } from './screens/ActivityDetail';
import { LegalScreen } from './screens/Legal';

export type RootStack = {
  Landing: undefined;
  Login: undefined;
  Main: undefined;
  Track: { jobId: string };
  RiderJob: { jobId: string };
  Dispute: { jobId: string };
  Chat: { jobId: string };
  Notifications: undefined;
  Documents: undefined;
  ActivityDetail: { jobId: string };
  Legal: { doc: 'terms' | 'privacy' };
};
const Stack = createNativeStackNavigator<RootStack>();
const navigationRef = createNavigationContainerRef<RootStack>();

export default function App() {
  const [initial, setInitial] = useState<'Landing' | 'Main' | null>(null);

  useEffect(() => {
    void loadSoundSetting(); // load the alert-sound preference into cache before any chime fires
    getToken().then((tok) => {
      setInitial(tok ? 'Main' : 'Landing');
      if (tok) void registerForPush(); // already signed in — refresh this device's push token
    });
  }, []);

  // Tapping a push routes by role: customers open the order's tracking screen; riders land on their
  // dashboard (a "new job" alert isn't theirs to track, and the dashboard shows available/active jobs).
  useEffect(() => {
    const sub = Notifications.addNotificationResponseReceivedListener(async (res) => {
      if (!navigationRef.isReady()) return;
      const data = res.notification.request.content.data as { jobId?: string; kind?: string };
      const jobId = data?.jobId;
      // Our own on-trip presence notification: open that exact delivery, regardless of role. Checked
      // before the role branch so a rider's presence tap opens the trip (not the job feed like a
      // "new job nearby" broadcast, which carries a jobId but no kind).
      if ((data?.kind === TRIP_PRESENCE_KIND || data?.kind === STAGE_NUDGE_KIND) && typeof jobId === 'string') {
        navigationRef.navigate('RiderJob', { jobId });
        return;
      }
      stopPersistentAlert(); // tapping the alert is an acknowledgement — silence the loop
      const role = getRole(await getToken());
      if (role === 'RIDER') {
        navigationRef.navigate('Main');
      } else if (typeof jobId === 'string') {
        navigationRef.navigate('Track', { jobId });
      }
    });
    return () => sub.remove();
  }, []);

  // A server-authored persistent alert (rider arrived — the customer must act): keep re-alerting so it
  // isn't missed. Only while the app is NOT already in front (if it's active the user is looking, one
  // alert is enough). It is bounded and stoppable inside urgentAlert; opening the app clears it below.
  useEffect(() => {
    const sub = Notifications.addNotificationReceivedListener((n) => {
      const data = n.request.content.data as { alertLevel?: string } | undefined;
      if (data?.alertLevel === 'persistent' && AppState.currentState !== 'active') {
        startPersistentAlert(n.request.content.title ?? 'Rydafirst', n.request.content.body ?? 'Your rider is waiting.');
      }
    });
    return () => sub.remove();
  }, []);

  // Riders: on cold start and whenever the app returns to the foreground, resume the delivery they're
  // actively running. We only redirect FROM the dashboard ('Main') so a rider who intentionally opened
  // another screen isn't yanked out of it; within a session they can still browse (not accept) the feed.
  const resumeActiveTrip = useCallback(async () => {
    if (!navigationRef.isReady()) return;
    if (getRole(await getToken()) !== 'RIDER') return;
    const current = navigationRef.getCurrentRoute()?.name;
    if (current && current !== 'Main') return;
    try {
      const active = (await api.assignedJobs()).find((j) => isRiderActive(j.status));
      if (active) navigationRef.navigate('RiderJob', { jobId: active.id });
    } catch { /* offline or signed out — leave them on the dashboard */ }
  }, []);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') { stopPersistentAlert(); void resumeActiveTrip(); } // opening the app acknowledges the alert
    });
    return () => sub.remove();
  }, [resumeActiveTrip]);

  if (!initial) {
    return <View style={{ flex: 1, backgroundColor: t.bg2, alignItems: 'center', justifyContent: 'center' }}><ActivityIndicator color={t.ink} /></View>;
  }

  return (
    <SafeAreaProvider>
      <ToastProvider>
        <NavigationContainer ref={navigationRef} onReady={() => { void resumeActiveTrip(); }}>
          <Stack.Navigator initialRouteName={initial} screenOptions={{ headerShown: false, animation: 'slide_from_right' }}>
            <Stack.Screen name="Landing" component={LandingScreen} />
            <Stack.Screen name="Login" component={LoginScreen} />
            <Stack.Screen name="Main" component={MainScreen} />
            <Stack.Screen name="Track" component={TrackScreen} />
            <Stack.Screen name="RiderJob" component={RiderJobScreen} />
            <Stack.Screen name="Dispute" component={DisputeScreen} />
            <Stack.Screen name="Chat" component={ChatScreen} />
            <Stack.Screen name="Notifications" component={NotificationsScreen} />
            <Stack.Screen name="Documents" component={DocumentsScreen} />
            <Stack.Screen name="ActivityDetail" component={ActivityDetailScreen} />
            <Stack.Screen name="Legal" component={LegalScreen} />
          </Stack.Navigator>
        </NavigationContainer>
      </ToastProvider>
    </SafeAreaProvider>
  );
}
