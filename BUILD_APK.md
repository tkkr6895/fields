# Building the Android APK

This repository **is** https://github.com/tkkr6895/fields (no nested `field-validator-app/` folder).

## GitHub Actions (recommended)

Every push to `main` (and every PR) runs [.github/workflows/build-android.yml](./.github/workflows/build-android.yml):

1. `npm ci` → `npm run build` (`tsc` + Vite)
2. `npx cap sync android`
3. `./gradlew assembleDebug`
4. Uploads artifact **`fields-debug`** (`app-debug.apk`), kept 30 days

Download: repo → **Actions** → latest green **Build Android APK** → Artifacts.

Tags `v*` also attach the APK to a GitHub Release.

On the phone: allow installs from unknown sources, install, grant location and camera. Paste a CoRE Stack API key in **Settings** for IndiaSAT colouring.

## Local

Needs Node.js 22+, JDK 21 and Android SDK.

```bash
npm install
npm run build
npx cap sync android
cd android && ./gradlew assembleDebug
```

Output: `android/app/build/outputs/apk/debug/app-debug.apk`

Or `npx cap open android` and build in Android Studio.

## Security

Do not commit `.env`, `creds/`, or keystores. Keys belong in Settings or CI secrets, not the APK source. See [SECURITY.md](./SECURITY.md).
