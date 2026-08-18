# Rooka Native Store Submission Checklist & Roadmap

This document serves as your complete operational checklist to prepare, build, and publish **`rooka-native`** to the **Apple App Store** and **Google Play Store** using Expo and EAS (Expo Application Services).

---

## Phase 1: Accounts & Legal Requirements

- [ ] **Apple Developer Program Account:**
  - Enrolled at [developer.apple.com](https://developer.apple.com) ($99/year).
  - Organization or Individual entity verified.
- [ ] **Google Play Console Account:**
  - Registered at [play.google.com/console](https://play.google.com/console) ($25 one-time fee).
- [ ] **Hosted Policy Pages (Public URLs):**
  - Host [PRIVACY_POLICY.md](file:///Users/rutgervandenberg/Documents/spark-native/docs/PRIVACY_POLICY.md) at `https://rooka.io/privacy`
  - Host [TERMS_OF_SERVICE.md](file:///Users/rutgervandenberg/Documents/spark-native/docs/TERMS_OF_SERVICE.md) at `https://rooka.io/terms`
  - Ensure account deletion instructions are active on your website.

---

## Phase 2: App Configuration (`app.json` updates)

In [app.json](file:///Users/rutgervandenberg/Documents/rooka-native/app.json), update placeholders before submission:

- [ ] Change `bundleIdentifier` (iOS):
  ```json
  "ios": {
    "bundleIdentifier": "com.rookaapp.fitness"
  }
  ```
- [ ] Add `package` (Android):
  ```json
  "android": {
    "package": "com.rookaapp.fitness"
  }
  ```
- [ ] Check Assets & Branding:
  - App Icon (1024x1024 px PNG without transparency for iOS).
  - Android Adaptive Icons (Foreground & Background images).
  - Splash Screen image (`splash-icon.png`).

---

## Phase 3: Expo EAS (Expo Application Services) Setup

Run these commands inside `/Users/rutgervandenberg/Documents/rooka-native`:

```bash
# 1. Install EAS CLI globally if not installed
npm install -g eas-cli

# 2. Login to your Expo account
eas login

# 3. Configure project for EAS Build
eas build:configure
```

This creates an `eas.json` configuration file in your project.

---

## Phase 4: App Store & Play Store Assets Creation

### Apple App Store Screenshots Required:
- 6.7" iPhone Screenshots (1290 x 2796 px)
- 6.5" iPhone Screenshots (1242 x 2688 px)
- 5.5" iPhone Screenshots (1242 x 2208 px)
- *(Optional)* iPad 12.9" Screenshots if supporting iPad.

### Google Play Store Assets Required:
- App Icon: 512 x 512 px PNG (max 1 MB)
- Feature Graphic: 1024 x 500 px JPG or PNG
- Phone Screenshots: Minimum 2 screenshots (aspect ratio 16:9 or 9:16)
- 7-inch & 10-inch Tablet Screenshots (if supporting tablets).

---

## Phase 5: Building & Submission via EAS

### For iOS (Apple App Store):
```bash
# Generate production iOS build (IPA)
eas build --platform ios --profile production

# Submit directly to App Store Connect / TestFlight
eas submit --platform ios
```

### For Android (Google Play Store):
```bash
# Generate production Android build (AAB bundle)
eas build --platform android --profile production

# Submit directly to Google Play Console
eas submit --platform android
```

---

## Phase 6: Store Console Setup & Submission

- [ ] **App Store Connect (Apple):**
  - Create New App -> Select Bundle ID (`com.rookaapp.fitness`).
  - Fill in Store Information, Descriptions, Keywords, Support URL.
  - Upload Screenshots for required display sizes.
  - Complete **App Privacy** questionnaire (refer to [APP_STORE_METADATA.md](file:///Users/rutgervandenberg/Documents/rooka-native/docs/APP_STORE_METADATA.md)).
  - Provide Demo Test Credentials in Review Notes.
  - Select Build from TestFlight and Submit for Review.

- [ ] **Google Play Console (Android):**
  - Create App -> Select Default Language & Category.
  - Complete **App Content** tasks (Privacy Policy, Target Age, News App, Data Safety form, Government Apps).
  - Upload Store Listing assets (Screenshots, Feature Graphic, Icon).
  - Create a Production or Internal Testing Release, attach AAB build.
  - Send for Review.
