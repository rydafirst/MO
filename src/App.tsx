import { useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { ToastProvider } from './ui';
import { t } from './theme';
import { getToken } from './lib/session';
import { LandingScreen } from './screens/Landing';
import { LoginScreen } from './screens/Login';
import { MainScreen } from './screens/Main';
import { TrackScreen } from './screens/Track';
import { RiderJobScreen } from './screens/RiderJob';
import { KycScreen } from './screens/Kyc';
import { DisputeScreen } from './screens/Dispute';
import { WalletScreen } from './screens/Wallet';

export type RootStack = {
  Landing: undefined;
  Login: undefined;
  Main: undefined;
  Track: { jobId: string };
  RiderJob: { jobId: string };
  Kyc: undefined;
  Dispute: { jobId: string };
  Wallet: undefined;
};
const Stack = createNativeStackNavigator<RootStack>();

export default function App() {
  const [initial, setInitial] = useState<'Landing' | 'Main' | null>(null);

  useEffect(() => { getToken().then((tok) => setInitial(tok ? 'Main' : 'Landing')); }, []);

  if (!initial) {
    return <View style={{ flex: 1, backgroundColor: t.bg2, alignItems: 'center', justifyContent: 'center' }}><ActivityIndicator color={t.ink} /></View>;
  }

  return (
    <SafeAreaProvider>
      <ToastProvider>
        <NavigationContainer>
          <Stack.Navigator initialRouteName={initial} screenOptions={{ headerShown: false, animation: 'slide_from_right' }}>
            <Stack.Screen name="Landing" component={LandingScreen} />
            <Stack.Screen name="Login" component={LoginScreen} />
            <Stack.Screen name="Main" component={MainScreen} />
            <Stack.Screen name="Track" component={TrackScreen} />
            <Stack.Screen name="RiderJob" component={RiderJobScreen} />
            <Stack.Screen name="Kyc" component={KycScreen} />
            <Stack.Screen name="Dispute" component={DisputeScreen} />
            <Stack.Screen name="Wallet" component={WalletScreen} />
          </Stack.Navigator>
        </NavigationContainer>
      </ToastProvider>
    </SafeAreaProvider>
  );
}
