import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';

/**
 * The "confirm your next step" reminder notification. When the rider has physically reached (or left)
 * a stage but hasn't tapped to confirm it — so the trip would otherwise stall with the customer left
 * in the dark — the app pings them here (in addition to the in-app banner) so they notice even with
 * the app minimised. Single responsibility: own the lifecycle of this one reminder notification.
 *
 * A HIGH-importance channel on Android (unlike the silent trip-presence one) because this is an
 * action the rider needs to take now. Best-effort — a failure never affects the trip.
 */
const CHANNEL_ID = 'nudge';
const NOTIF_ID = 'stage-nudge'; // fixed id ⇒ re-firing updates in place, never stacks
export const STAGE_NUDGE_KIND = 'stage-nudge';

let channelReady = false;

async function ensureChannel(): Promise<void> {
  if (channelReady || Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
    name: 'Action reminders',
    importance: Notifications.AndroidImportance.HIGH,
  });
  channelReady = true;
}

/** Show/refresh the "confirm your step" reminder for a job. Safe to call repeatedly. */
export async function notifyStageNudge(jobId: string, body: string): Promise<void> {
  try {
    await ensureChannel();
    await Notifications.scheduleNotificationAsync({
      identifier: NOTIF_ID,
      content: {
        title: 'Confirm your delivery step',
        body,
        data: { kind: STAGE_NUDGE_KIND, jobId },
      },
      trigger: Platform.OS === 'android' ? { channelId: CHANNEL_ID } : null,
    });
  } catch {
    /* reminder is best-effort — never surface an error */
  }
}

/** Remove the reminder once the rider confirms the step (or leaves the screen). */
export async function clearStageNudge(): Promise<void> {
  try {
    await Notifications.dismissNotificationAsync(NOTIF_ID);
  } catch {
    /* best-effort */
  }
}
