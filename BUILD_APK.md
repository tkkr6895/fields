# Building the Android APK

CI publishes a signed APK on every push to `main`.

## Download a build

| Source | What you get |
| --- | --- |
| [Releases · sideload](https://github.com/tkkr6895/fields/releases/tag/sideload) | `Fields.apk` (direct) |
| [Actions · Build Android APK](https://github.com/tkkr6895/fields/actions/workflows/build-android.yml) | Artifact **Fields** — GitHub wraps it in a zip; extract `Fields.apk` |

Sideloading requires unknown sources. Grant precise location (background location if recording with the screen off). Android rejects an install when the new APK is signed with a different key than the app already on the device; uninstall that build first.

## What CI does

[.github/workflows/build-android.yml](./.github/workflows/build-android.yml):

1. `npm ci` → `npm run build`
2. `npx cap sync android`
3. `./gradlew assembleRelease`
4. Artifact **Fields** (`Fields.apk` + `INSTALL.txt`)
5. Updates the **sideload** GitHub Release

## Local release APK

Needs Node.js 22+, JDK 21, and the Android SDK.

```bash
npm install
npm run build
npx cap sync android
cd android && ./gradlew assembleRelease
```

Output: `android/app/build/outputs/apk/release/app-release.apk`
