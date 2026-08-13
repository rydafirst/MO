import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import notifee, { AndroidCategory, AndroidImportance, AndroidVisibility } from '@notifee/react-native';

/**
 * A persistent, self-limiting alert — the "keeps ringing until you open the app" behaviour a customer
 * needs so they don't leave a rider waiting (the Chowdeck pattern).
 *
 *  - Android: Notifee shows a full-screen, incoming-call-style notification whose sound LOOPS until the
 *    notification is cancelled — a real continuous ring, visible even on the lock screen.
 *  - iOS: re-alerts on a short interval with Time-Sensitive notifications (breaks through Focus, needs
 *    no Apple approval). If/when the Critical Alerts entitlement is granted, the sound can also override
 *    the mute switch — a one-line change here.
 *
 * Safety (this is the batch's highest-abuse feature, so it is bounded by construction):
 *  - HARD CAP: a timer always stops it after MAX_MS, so it can NEVER ring forever.
 *  - Always stoppable: opening the app (AppState 'active') or tapping the alert calls stop().
 *  - Only started for a genuine, server-authored `alertLevel: 'persistent'` push — never client-driven.
 */
const INTERVAL_MS = 6_000;
const MAX_MS = 120_000; // 2 minutes, then it stops itself even if unacknowledged
const CHANNEL_ID = 'incoming';
const NOTIF_ID = 'persistent-alert';

let iosTimer: ReturnType<typeof setInterval> | null = null;
let capTimer: ReturnType<typeof setTimeout> | null = null;
let iosStartedAt = 0;

async function androidRing(title: string, body: string): Promise<void> {
  try {
    await notifee.createChannel({
      id: CHANNEL_ID,
      name: 'Rider is waiting',
      importance: AndroidImportance.HIGH,
      sound: 'default',
      vibration: true,
      visibility: AndroidVisibility.PUBLIC,
    });
    await notifee.requestPermission();
    await notifee.displayNotification({
      id: NOTIF_ID,
      title,
      body,
      android: {
        channelId: CHANNEL_ID,
        category: AndroidCategory.CALL, // incoming-call styling
        importance: AndroidImportance.HIGH,
        fullScreenAction: { id: 'default' }, // full-screen, even on the lock screen
        pressAction: { id: 'default' },
        loopSound: true, // rings continuously until cancelled
        ongoing: true,
        autoCancel: false,
      },
    });
  } catch { /* best-effort — a failed ring must never throw */ }
}

async function iosPing(title: string, body: string): Promise<void> {
  try {
    await Notifications.scheduleNotificationAsync({
      content: { title, body, sound: true, interruptionLevel: 'timeSensitive' },
      trigger: null,
    });
  } catch { /* best-effort */ }
}

/** Begin (or restart) the alert. Bounded by MAX_MS no matter what. */
export function startPersistentAlert(title: string, body: string): void {
  stopPersistentAlert();
  capTimer = setTimeout(() => stopPersistentAlert(), MAX_MS); // the hard cap — can't ring forever
  (capTimer as unknown as { unref?: () => void }).unref?.();

  if (Platform.OS === 'android') {
    void androidRing(title, body); // Notifee loops the sound itself until we cancel it
    return;
  }
  // iOS / other: re-alert on an interval until stopped or capped.
  iosStartedAt = Date.now();
  void iosPing(title, body);
  iosTimer = setInterval(() => {
    if (Date.now() - iosStartedAt >= MAX_MS) { stopPersistentAlert(); return; }
    void iosPing(title, body);
  }, INTERVAL_MS);
  (iosTimer as unknown as { unref?: () => void }).unref?.();
}

/** Stop the alert. Safe to call when nothing is running (e.g. on every foreground). */
export function stopPersistentAlert(): void {
  if (capTimer) { clearTimeout(capTimer); capTimer = null; }
  if (iosTimer) { clearInterval(iosTimer); iosTimer = null; }
  if (Platform.OS === 'android') { notifee.cancelNotification(NOTIF_ID).catch(() => { /* already gone */ }); }
}
