import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';

/**
 * The "you're on a delivery" ongoing notification (inDrive-style): while a rider has an active trip,
 * a sticky notification sits in the shade so that — even with the app minimized — they can see they're
 * on a job and tap straight back into it.
 *
 * ANDROID ONLY on purpose. iOS has no persistent-tray notification pattern; its analogue is Live
 * Activities, a separate native feature out of scope here — so every function is a safe no-op on iOS.
 *
 * Single responsibility: this module owns the lifecycle of exactly one notification (fixed id +
 * channel). Callers just say "show for this job / clear"; they never touch expo-notifications
 * directly. Every call is best-effort — presence is cosmetic and must never break the trip flow.
 */

const CHANNEL_ID = 'trip';
const NOTIF_ID = 'trip-presence'; // fixed identifier ⇒ re-showing UPDATES in place, never stacks
/** Marker on the notification payload so the tap handler routes it to the trip, not the job feed. */
export const TRIP_PRESENCE_KIND = 'trip-presence';

let channelReady = false;

async function ensureChannel(): Promise<void> {
  if (channelReady || Platform.OS !== 'android') return;
  // LOW importance: always visible, but silent — no sound or heads-up on each status update, so a
  // 30-minute delivery doesn't buzz the rider every time the stage changes.
  await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
    name: 'Active delivery',
    importance: Notifications.AndroidImportance.LOW,
    showBadge: false,
  });
  channelReady = true;
}

/**
 * Show or update the ongoing trip notification. Safe to call on every status change — the fixed
 * identifier means it replaces the existing one in place rather than stacking.
 *
 * @param jobId       the active delivery; embedded so a tap can deep-link to it.
 * @param statusLabel short human status shown in the body (e.g. "Heading to drop-off").
 */
export async function showTripPresence(jobId: string, statusLabel: string): Promise<void> {
  if (Platform.OS !== 'android') return;
  try {
    await ensureChannel();
    await Notifications.scheduleNotificationAsync({
      identifier: NOTIF_ID,
      content: {
        title: 'Delivery in progress',
        body: `${statusLabel} — tap to open`,
        data: { kind: TRIP_PRESENCE_KIND, jobId },
        sticky: true,        // ongoing: can't be swiped away while the trip is live
        autoDismiss: false,  // a tap opens the trip but leaves the notification until the trip ends
      },
      trigger: { channelId: CHANNEL_ID }, // immediate delivery on our silent LOW-importance channel
    });
  } catch {
    /* presence is cosmetic — never surface an error to the rider */
  }
}

/** Remove the trip notification. Call when the delivery finishes or the rider leaves the trip. */
export async function clearTripPresence(): Promise<void> {
  if (Platform.OS !== 'android') return;
  try {
    await Notifications.dismissNotificationAsync(NOTIF_ID);
  } catch {
    /* best-effort */
  }
}
