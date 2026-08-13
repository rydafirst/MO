import { useEffect, useState } from 'react';
import { Keyboard, Platform } from 'react-native';

/**
 * The on-screen keyboard's height on Android, or 0 on iOS / when closed.
 *
 * Why this exists: the shared <Screen> lifts content on iOS via KeyboardAvoidingView `behavior="padding"`,
 * but on Android that behavior is a no-op and Expo's edge-to-edge window means
 * `softwareKeyboardLayoutMode: "resize"` no longer shrinks the layout — so a bottom-pinned input
 * (the chat composer) ends up hidden behind the keyboard. A screen with such an input can pad it up
 * by exactly this height. iOS returns 0 because it is already handled there; double-handling would
 * push the composer twice as far.
 */
export function useAndroidKeyboardInset(): number {
  const [height, setHeight] = useState(0);
  useEffect(() => {
    if (Platform.OS !== 'android') return;
    const show = Keyboard.addListener('keyboardDidShow', (e) => setHeight(e.endCoordinates?.height ?? 0));
    const hide = Keyboard.addListener('keyboardDidHide', () => setHeight(0));
    return () => { show.remove(); hide.remove(); };
  }, []);
  return height;
}
