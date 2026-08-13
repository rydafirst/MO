import { registerRootComponent } from 'expo';
import notifee, { EventType } from '@notifee/react-native';
import App from './src/App';

// Notifee requires a background event handler to be registered at the JS entry point (before the app
// mounts), or it warns and can't deliver background taps. When the user taps or dismisses the
// full-screen "rider is waiting" alert while the app is backgrounded, cancel the looping notification
// so it stops ringing. Kept tiny and dependency-free — no navigation here (the app handles routing
// once it foregrounds).
notifee.onBackgroundEvent(async ({ type, detail }) => {
  if (type === EventType.PRESS || type === EventType.DISMISSED) {
    const id = detail.notification?.id;
    if (id) await notifee.cancelNotification(id);
  }
});

registerRootComponent(App);
