import { Vibration } from 'react-native';
import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from 'expo-audio';

/**
 * The rider's continuous new-job alarm: a distinct custom tone (assets/new-job-alert.wav) played on a
 * LOOP at full volume until the rider acts, plus a repeating vibration. Unlike a notification sound this
 * is an in-app media player, so:
 *  - it uses OUR tone, not the OS default;
 *  - on iOS it is set to play in silent mode, so it overrides the mute switch;
 *  - it loops seamlessly and stops the instant we call stop() (accept/dismiss).
 * Bundled asset + JS only, so it ships over-the-air (no native rebuild). Best-effort throughout — a
 * failure to make noise must never crash the dashboard.
 */
let player: AudioPlayer | null = null;

export async function startNewJobAlarm(): Promise<void> {
  stopNewJobAlarm();
  try {
    // playsInSilentMode:true overrides the iOS mute switch AND lets it play when the Android ringer is
    // on silent/vibrate (Android only suppresses it when this is false). doNotMix takes exclusive audio
    // focus so it plays loud. (Full Android Do-Not-Disturb would additionally need the alarm stream —
    // a native change — but ordinary silent/vibrate is covered here.)
    await setAudioModeAsync({ playsInSilentMode: true, interruptionMode: 'doNotMix', shouldPlayInBackground: false });
  } catch { /* audio-mode failures are non-fatal */ }
  try {
    player = createAudioPlayer(require('../../assets/new-job-alert.wav'));
    player.loop = true;
    player.volume = 1.0;
    player.play();
  } catch { /* player failures are non-fatal */ }
  // Continuous vibration (Android repeats the pattern; iOS buzzes each loop of the tone is the sound).
  try { Vibration.vibrate([0, 600, 400], true); } catch { /* no vibrator */ }
}

export function stopNewJobAlarm(): void {
  try { Vibration.cancel(); } catch { /* noop */ }
  if (player) {
    try { player.pause(); player.remove(); } catch { /* already gone */ }
    player = null;
  }
}
