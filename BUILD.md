# Rydafirst mobile — build & release

Expo SDK 56 / React Native 0.85. Builds run in the cloud with **EAS Build** (config in `eas.json`).
You do **not** need Xcode or Android Studio to produce installable builds — EAS builds on Apple/Google
runners. You only need a Mac + Xcode if you want to build/run locally on a simulator.

All commands run from this `mobile/` folder.

---

## 0. One-time setup

```bash
npm install -g eas-cli          # the EAS command-line tool
npm install                     # project deps
eas login                       # sign in to your Expo account (owner: rydas-team)
eas whoami                      # confirm you're logged in
```

---

## 1. Run locally while developing

```bash
npm start                       # Metro bundler + QR code (Expo Go / dev client)
npm run android                 # open on a connected Android device/emulator
npm run ios                     # open on the iOS simulator (Mac only)
```

Because the app uses native modules (secure store, notifications, image picker), Expo Go may not
cover everything. For a full native dev build to install on a device/simulator:

```bash
eas build --profile development --platform ios       # simulator build
eas build --profile development --platform android    # installable APK
```

---

## 2. Internal test builds (share with testers)

`preview` profile → an installable APK for Android and an internal-distribution build for iOS.

```bash
eas build --profile preview --platform android        # .apk you can sideload
eas build --profile preview --platform ios            # internal iOS build (needs device UDIDs registered)
eas build --profile preview --platform all            # both at once
```

When the build finishes, EAS prints a URL to download the artifact / install page.

---

## 3. Production / store builds

`production` profile → Android **App Bundle (.aab)** for Play Store, and a store-signed **.ipa** for
App Store. Version codes auto-increment (`autoIncrement: true`, `appVersionSource: remote`).

```bash
eas build --profile production --platform ios
eas build --profile production --platform android
eas build --profile production --platform all
```

---

## 4. Submit to the stores

Submit config already has your Apple ID / Team ID and the Play internal track.

```bash
# uses the latest matching production build automatically
eas submit --profile production --platform ios
eas submit --profile production --platform android
```

Notes:
- **iOS** → uploads to App Store Connect (TestFlight → then submit for review). Apple ID on file:
  `itsolonts@gmail.com`, Team `5S974CVZ88`.
- **Android** → pushes to the Play **internal** track; put `play-service-account.json` in this folder
  first (referenced by `eas.json`). Do **not** commit that key.

---

## 5. Over-the-air (JS-only) updates

For JS/UI changes that don't touch native code, publish an OTA update instead of a full rebuild:

```bash
eas update --channel production --message "copy tweak"
```

Native changes (new permissions, SDK bumps, the `supportsTablet` flag, new native deps) **require a
fresh build** in step 3 — OTA can't ship those.

---

## Reminders for this submission

- `ios.supportsTablet` was set to **true** (iPad support) — this is a native change, so it needs a new
  production build before it takes effect.
- Backend/API URL is baked in per profile via `EXPO_PUBLIC_API_URL` in `eas.json`
  (currently `https://be-production-e8e9.up.railway.app/v1`). Change it there, not in code.
- Bundle IDs: iOS `ng.rydafirst.app`, Android `ng.rydafirst.app`.
