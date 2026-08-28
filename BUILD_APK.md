# Building the Android APK

This repository **is** https://github.com/tkkr6895/fields.

## Install from GitHub Actions (phone)

GitHub always wraps Actions downloads in a zip. That is normal. You are not installing the zip.

1. Uninstall any older **Fields** app first.
2. Phone browser: [Actions → Build Android APK](https://github.com/tkkr6895/fields/actions/workflows/build-android.yml) → latest green run → **Artifacts** → **Fields**.
3. You get `Fields.zip`. Open it in Files / My Files and **extract**.
4. Tap **Fields.apk** (not INSTALL.txt, not the zip).
5. Allow from this source. Play Protect: **Install anyway**.
6. Allow **precise location**. For a phone in a pocket, **Allow all the time**.

Signed the same way as the [sideload release](https://github.com/tkkr6895/fields/releases/tag/sideload) if you can use that later.

## GitHub Actions (what the job does)

Every push to `main` runs [.github/workflows/build-android.yml](./.github/workflows/build-android.yml):

1. `npm ci` → `npm run build`
2. `npx cap sync android`
3. `./gradlew assembleRelease`
4. Artifact **Fields** = `Fields.apk` + `INSTALL.txt`
5. Also updates the **sideload** GitHub Release

## Local

Needs Node.js 22+, JDK 21 and Android SDK.

```bash
npm install
npm run build
npx cap sync android
cd android && ./gradlew assembleRelease
```

Output: `android/app/build/outputs/apk/release/app-release.apk`
