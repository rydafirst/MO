import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import * as Notifications from 'expo-notifications';

/**
 * User preferences that must be readable synchronously in hot paths (e.g. deciding whether to chime).
 * The value is persisted (SecureStore on device, localStorage on the web debug build) and mirrored in
 * an in-memory cache loaded once at startup, so callers get an instant answer without an async read.
 */
const SOUND_KEY = 'pref_sound_v1';
const isWeb = Platform.OS === 'web';

let soundEnabled = true; // default ON; overwritten by loadSoundSetting() at startup

export function isSoundEnabled(): boolean {
  return soundEnabled;
}

/** Load the persisted sound preference into the cache. Call once at app start. */
export async function loadSoundSetting(): Promise<void> {
  try {
    const raw = isWeb ? globalThis.localStorage?.getItem(SOUND_KEY) : await SecureStore.getItemAsync(SOUND_KEY);
    if (raw != null) soundEnabled = raw !== '0';
  } catch {
    /* keep the default on any read failure */
  }
}

export async function setSoundEnabled(on: boolean): Promise<void> {
  soundEnabled = on; // update cache first so the next chime respects it immediately
  try {
    if (isWeb) globalThis.localStorage?.setItem(SOUND_KEY, on ? '1' : '0');
    else await SecureStore.setItemAsync(SOUND_KEY, on ? '1' : '0');
  } catch {
    /* best-effort persistence */
  }
}

/**
 * Play an audible alert for a key moment (e.g. a waiting session starting), unless the user has muted
 * sounds. Reuses the notification sound already configured for the app — the foreground handler plays
 * it — so no audio asset needs bundling. Best-effort.
 */
export function chime(title: string, body: string): void {
  if (!soundEnabled) return;
  Notifications.scheduleNotificationAsync({ content: { title, body, sound: true }, trigger: null }).catch(() => {});
}
