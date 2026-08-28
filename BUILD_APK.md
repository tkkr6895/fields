# Building the Android APK

This repository **is** https://github.com/tkkr6895/fields (no nested `field-validator-app/` folder).

## Install on a phone (use this, not Actions)

Every push to `main` publishes a **signed** `Fields.apk` on the rolling GitHub release:

**[Download Fields.apk](https://github.com/tkkr6895/fields/releases/tag/sideload)**

1. Uninstall any older Fields app first. Earlier CI builds were **debug-signed**; this one uses a stable sideload key, so Android will refuse an in-place upgrade.
2. Download **Fields.apk** from that release page. Do **not** try to install the Actions artifact zip (`Fields-apk.zip`). Unzipping it is optional; the release file is already an APK.
3. Open the APK on the phone → allow installs from the browser/Files app → Install.
4. If Play Protect warns, choose **Install anyway**. This is a personal sideload build, not Play Store.
5. Open Fields → allow **precise location**. For pocket hiking with the screen off, set location to **Allow all the time** when Android asks. Camera is optional.

## GitHub Actions

Every push to `main` (and every PR) runs [.github/workflows/build-android.yml](./.github/workflows/build-android.yml):

1. `npm ci` → `npm run build` (`tsc` + Vite)
2. `npx cap sync android`
3. `./gradlew assembleRelease` (PKCS12 sideload key in `android/keystore/`)
4. Uploads artifact **`Fields-apk`** (`Fields.apk`)
5. On `main`, also updates the **sideload** GitHub Release

Tags `v*` attach the same APK to that version tag.

## Local

Needs Node.js 22+, JDK 21 and Android SDK.

```bash
npm install
npm run build
npx cap sync android
cd android && ./gradlew assembleRelease
```

Output: `android/app/build/outputs/apk/release/app-release.apk`

## Security

Do not commit `.env`, `creds/`, or Play Store upload keystores. The committed `fields-sideload.p12` is only a sideload identity so phones can update from GitHub. Keys for CoRE Stack belong in Settings, not the APK source. See [SECURITY.md](./SECURITY.md).
