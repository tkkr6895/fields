# Building & Distributing the APK

## Option 1: GitHub Actions (Recommended - No Local Setup Needed)

### Step 1: Push to GitHub

```powershell
cd field-validator-app

# Initialize git repo
git init
git add .
git commit -m "Initial commit: WG Field Validator App"

# Create new repo on GitHub (or use existing)
# Then push:
git remote add origin https://github.com/YOUR_USERNAME/wg-field-validator.git
git branch -M main
git push -u origin main
```

### Step 2: Get the APK

1. Go to your GitHub repo → **Actions** tab
2. The "Build Android APK" workflow will run automatically
3. Once complete, click on the workflow run
4. Download the **wg-field-validator-debug** artifact
5. Extract and install the APK on your phone

### Step 3: Create a Release (Optional)

```powershell
git tag v1.0.0
git push origin v1.0.0
```

This creates a GitHub Release with the APK attached for easy sharing.

---

## Option 2: Build Locally (Requires Android SDK)

### Prerequisites

1. Install Java 17+:
   - Download from https://adoptium.net/
   
2. Install Android Studio (includes SDK):
   - Download from https://developer.android.com/studio
   - During setup, ensure Android SDK is installed

3. Set environment variables:
   ```powershell
   $env:JAVA_HOME = "C:\Program Files\Eclipse Adoptium\jdk-17.x.x"
   $env:ANDROID_HOME = "$env:LOCALAPPDATA\Android\Sdk"
   ```

### Build APK

```powershell
cd field-validator-app

# Build web app and sync
npm run android:build

# Navigate to android folder
cd android

# Build debug APK
.\gradlew.bat assembleDebug
```

APK location: `android\app\build\outputs\apk\debug\app-debug.apk`

---

## Option 3: Use Android Studio

1. Run:
   ```powershell
   npm run android:open
   ```

2. Android Studio opens with the project

3. Click **Build → Build Bundle(s) / APK(s) → Build APK(s)**

4. APK will be in `android/app/build/outputs/apk/debug/`

---

## 🔒 Security Checklist

Before sharing the APK or pushing to GitHub:

- [x] No API keys in source code ✓
- [x] `.gitignore` excludes credentials ✓
- [x] API keys entered at runtime only ✓
- [x] No private data in bundled datasets ✓
- [ ] Review `public/data/` for any private info
- [ ] Check `SECURITY.md` for credential handling

---

## Installing on Phone

1. Transfer `app-debug.apk` to your phone (USB, email, cloud storage)
2. Enable "Install from unknown sources" in Android Settings
3. Open the APK file and tap Install
4. Grant location and camera permissions when prompted

---

## Sharing Options

| Method | Pros | Cons |
|--------|------|------|
| GitHub Releases | Easy, versioned, automated | Requires GitHub account |
| Google Drive | Simple sharing | Manual upload each time |
| Direct transfer | No internet needed | Must be connected |

---

## App Size

- Debug APK: ~15-20 MB
- Release APK: ~10-15 MB (after ProGuard optimization)

The app includes offline datasets which add to the size but enable full offline functionality.
