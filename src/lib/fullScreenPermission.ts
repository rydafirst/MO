import { Alert, Platform } from 'react-native';
import * as Device from 'expo-device';
import * as SecureStore from 'expo-secure-store';
import * as IntentLauncher from 'expo-intent-launcher';
import notifee from '@notifee/react-native';

/**
 * Runtime opt-in for the full-screen incoming-delivery alert (the "ring-until-opened" takeover).
 *
 * Android 14+ (API 34) no longer PRE-GRANTS USE_FULL_SCREEN_INTENT to apps whose core function isn't
 * calling/alarm — and we correctly declared "Other" on Google Play, so we are not pre-granted. Without
 * the permission our incoming-job notification still fires, but as a heads-up banner rather than the
 * full-screen, lock-screen takeover. This nudges the rider ONCE to enable it and jumps them straight to
 * the per-app toggle.
 *
 * Fail-safe by construction: Android-only, API-gated, asked at most once, and every step is wrapped so a
 * failure can NEVER block the rider from going online — it just leaves the alert as a normal heads-up.
 */
const PROMPTED_KEY = 'rf_fsi_prompted';
const PACKAGE = 'ng.rydafirst.app';

export async function maybePromptFullScreenIntent(): Promise<void> {
  try {
    if (Platform.OS !== 'android') return;                      // Android-only setting
    if ((Device.platformApiLevel ?? 0) < 34) return;            // pre-grant still applies below Android 14
    if (await SecureStore.getItemAsync(PROMPTED_KEY)) return;    // ask at most once
    await SecureStore.setItemAsync(PROMPTED_KEY, '1');           // mark asked BEFORE showing, so a dismiss still counts

    Alert.alert(
      'Never miss a delivery',
      'Allow full-screen alerts so a new delivery rings and shows on your lock screen, even when your phone is asleep.',
      [
        { text: 'Not now', style: 'cancel' },
        { text: 'Enable', onPress: () => { void openFullScreenSettings(); } },
      ],
    );
  } catch {
    /* never block going online */
  }
}

async function openFullScreenSettings(): Promise<void> {
  try {
    // Deep-links straight to the per-app "Full screen notifications" toggle (Android 14+).
    await IntentLauncher.startActivityAsync(
      'android.settings.MANAGE_APP_USE_FULL_SCREEN_INTENT',
      { data: `package:${PACKAGE}` },
    );
  } catch {
    // Fallback: open the app's notification settings; the rider enables the toggle from there.
    try { await notifee.openNotificationSettings(); } catch { /* give up quietly */ }
  }
}
