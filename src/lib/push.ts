import { Platform } from 'react-native';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import { api } from '../api';

// Foreground behaviour: still show the banner and play the sound so an urgent update (rider
// assigned, cancelled, failed) is noticed even while the app is open — like Uber.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

// Remember the token we last registered so we don't spam the API on every screen focus,
// and so we can cleanly unregister it on sign-out.
let registered: string | null = null;

/**
 * Ask for notification permission, obtain this device's Expo push token, and register it with the
 * backend for the signed-in user. Fully best-effort: any failure (denied permission, simulator,
 * network) is swallowed so it never blocks sign-in or app start.
 */
export async function registerForPush(): Promise<void> {
  try {
    if (!Device.isDevice) return; // simulators/emulators can't receive a real push token

    // Android delivers through channels; the 'urgent' channel carries sound + max importance.
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'Updates',
        importance: Notifications.AndroidImportance.DEFAULT,
      });
      await Notifications.setNotificationChannelAsync('urgent', {
        name: 'Urgent alerts',
        importance: Notifications.AndroidImportance.MAX,
        sound: 'default',
        vibrationPattern: [0, 250, 250, 250],
      });
    }

    const existing = await Notifications.getPermissionsAsync();
    let status = existing.status;
    if (status !== 'granted') status = (await Notifications.requestPermissionsAsync()).status;
    if (status !== 'granted') return;

    const projectId = Constants.expoConfig?.extra?.eas?.projectId as string | undefined;
    const { data: token } = await Notifications.getExpoPushTokenAsync(projectId ? { projectId } : undefined);
    if (!token || token === registered) return;

    await api.registerPushToken({ token, platform: Platform.OS === 'ios' ? 'ios' : 'android' });
    registered = token;
  } catch {
    /* push is optional — never surface an error to the user */
  }
}

/** Remove this device's push token from the user's account (call on sign-out). */
export async function unregisterForPush(): Promise<void> {
  try {
    if (!registered) return;
    await api.unregisterPushToken(registered);
    registered = null;
  } catch {
    /* best-effort */
  }
}
