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
 * Play an audible alert for a key moment (e.g. a new job, a waiting session starting), unless the user
 * has muted sounds. Best-effort.
 *
 * Why the channel matters: this is a LOCAL notification, so it never passes through the server push
 * path that tags urgent messages with the high-importance 'urgent' channel. Posted on the plain
 * 'default' channel, Android would show it silently (a DEFAULT-importance channel doesn't reliably
 * sound in the foreground) — which is exactly why the rider's new-order alert made no sound. We create
 * the sound-carrying 'urgent' channel (idempotent) and route the notification to it so it actually
 * rings, foreground or background.
 */
export function chime(title: string, body: string): void {
  if (!soundEnabled) return;
  void (async () => {
    try {
      if (Platform.OS === 'android') {
        await Notifications.setNotificationChannelAsync('urgent', {
          name: 'Urgent alerts',
          importance: Notifications.AndroidImportance.MAX,
          sound: 'default',
          vibrationPattern: [0, 250, 250, 250],
        });
      }
      await Notifications.scheduleNotificationAsync({
        content: { title, body, sound: true },
        // A channel-aware immediate trigger — fires now, but pinned to the sound-carrying 'urgent'
        // channel on Android. iOS ignores channelId and just uses `sound: true`.
        trigger: Platform.OS === 'android' ? { channelId: 'urgent' } as Notifications.NotificationTriggerInput : null,
      });
    } catch { /* best-effort — a failed chime must never throw into a hot path */ }
  })();
}
