import { useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { NavigationContainer, createNavigationContainerRef } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import * as Notifications from 'expo-notifications';
import { ToastProvider } from './ui';
import { t } from './theme';
import { getToken, getRole } from './lib/session';
import { registerForPush } from './lib/push';
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
      const jobId = res.notification.request.content.data?.jobId;
      const role = getRole(await getToken());
      if (role === 'RIDER') {
        navigationRef.navigate('Main');
      } else if (typeof jobId === 'string') {
        navigationRef.navigate('Track', { jobId });
      }
    });
    return () => sub.remove();
  }, []);

  if (!initial) {
    return <View style={{ flex: 1, backgroundColor: t.bg2, alignItems: 'center', justifyContent: 'center' }}><ActivityIndicator color={t.ink} /></View>;
  }

  return (
    <SafeAreaProvider>
      <ToastProvider>
        <NavigationContainer ref={navigationRef}>
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
