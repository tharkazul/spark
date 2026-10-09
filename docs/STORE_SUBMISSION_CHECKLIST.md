# rooka Store Submission Checklist

Steps to build and publish rooka to the **Apple App Store** and **Google Play Store** with Expo and EAS. Store copy, privacy answers and reviewer notes live in [APP_STORE_METADATA.md](APP_STORE_METADATA.md).

---

## Current configuration (for reference)

| Setting | Value | Where |
| :--- | :--- | :--- |
| iOS bundle ID | `io.rooka.app` | `app.json` > `ios.bundleIdentifier` |
| Android package | `io.rooka.app` | `app.json` > `android.package` |
| Marketing version | `1.0.0` | `app.json` > `version` |
| Build number | Managed remotely by EAS, auto-incremented | `eas.json` > `appVersionSource: remote`, `production.autoIncrement` |
| Devices | iPhone only (no iPad build) | `ios.supportsTablet` not set |
| EAS project | `eb8027ec-2138-4891-a3a4-684be50bfbdb` | `app.json` > `extra.eas.projectId` |
| Production API | `https://api.rooka.io` (Google Cloud VM) | `src/constants/api.ts` |
| Native folders | Generated in the cloud by `expo prebuild`; local `ios/` and `android/` are ignored | `.easignore` |

---

## Phase 1: Accounts & legal

- [ ] **Apple Developer Program** membership active.
- [ ] **Google Play Console** account registered.
- [x] **Policy pages online:** `https://rooka.io/privacy`, `https://rooka.io/terms`, `https://rooka.io/support`.
- [x] **Privacy policy** (`server/public/privacy.html`, copied to `website/`) describes the AI consent and the data sent to Google Gemini. It goes live with the next server deploy.
- [ ] **Apple Paid Apps Agreement** signed, with banking and tax details active in App Store Connect.

---

## Phase 2: App readiness

- [x] Sign in with Apple offered next to Google sign-in.
- [x] In-app account deletion with a confirmation step (Profile > Delete Account).
- [x] Restore Purchases available.
- [x] RevenueCat uses the production App Store key (`USE_TEST_STORE = false` in `src/services/subscriptionService.ts`).
- [x] Activity comments removed. Social is limited to accepted connections and sparks, and non-connections only see a basic profile.
- [x] Connections can be removed from the athlete's profile (tap "Friends").
- [x] **AI data consent:** the coach's first message asks for permission before any data goes to Google Gemini (Guideline 5.1.2(i)). Declining turns every AI feature off. The switch is in Profile > Preferences > AI coach.
- [x] In-app Privacy Policy and Terms links point at `rooka.io`.
- [ ] **Location permission text:** remove `NSLocationWhenInUseUsageDescription` from `app.json` (no device location is used), or ship the feature it describes.
- [ ] **Display name:** decide whether the home-screen name in `app.json` should be `rooka` (lowercase) instead of `Rooka`.
- [ ] `npx tsc --noEmit` and `npx expo-doctor` pass.
- [ ] All changes committed, so the build matches a known commit.

---

## Phase 3: Backend

- [x] Production backend runs on a Google Cloud VM behind `https://api.rooka.io`.
- [ ] Latest server code deployed to the VM: comment removal, AI consent, remove-connection, restricted public profiles and the updated privacy policy.
- [x] Reviewer account `reviewer-test@rooka.io` exists with seeded data and rooka+ access.
- [ ] Backend monitored and kept online for the whole review period.

---

## Phase 4: Store assets

### Apple App Store
- [ ] **iPhone screenshots, 6.9-inch** (1320 x 2868 or 1290 x 2796 px), 3 to 10 images. Apple scales these down for smaller iPhones. No iPad screenshots are needed because the app is iPhone-only.
- [x] App icon: `assets/images/icon.png` (1600 x 1600). Prebuild removes transparency for iOS automatically.
- [ ] Subscriptions (rooka+) configured in App Store Connect with display names, descriptions and a review screenshot.
- [ ] RevenueCat paywall shows working Terms of Use (EULA) and Privacy Policy links.

### Google Play Store
- [ ] App icon: 512 x 512 px PNG (max 1 MB).
- [ ] Feature graphic: 1024 x 500 px JPG or PNG.
- [ ] At least 2 phone screenshots (9:16).
- [ ] Restrict the Google Maps API key in `app.json` (`android.config.googleMaps.apiKey`) to the `io.rooka.app` package and its signing certificate.

---

## Phase 5: Build & submit with EAS

EAS CLI is configured (`eas.json`). Log in once with `eas login`.

iOS:

```bash
eas build --platform ios --profile production
```

```bash
eas submit --platform ios --profile production
```

Android:

```bash
eas build --platform android --profile production
```

```bash
eas submit --platform android --profile production
```

> [!TIP]
> `submit.production` in `eas.json` is empty, so `eas submit` asks for the App Store Connect app on the first run. Add `"ios": {"ascAppId": "<App Store Connect app ID>"}` to skip the prompt.

---

## Phase 6: Store console & review

### App Store Connect
- [ ] App record created for bundle ID `io.rooka.app`.
- [ ] Name, subtitle, description, keywords, support and privacy URLs entered from [APP_STORE_METADATA.md](APP_STORE_METADATA.md).
- [ ] Screenshots uploaded.
- [ ] **App Privacy** questionnaire completed (metadata section 4).
- [ ] Age-rating questionnaire completed (metadata section 1).
- [ ] Reviewer credentials and notes entered (metadata section 6).
- [ ] Subscriptions attached to version 1.0.
- [ ] TestFlight build tested on a real device, then selected and submitted for review.

### Google Play Console
- [ ] App created with default language and category.
- [ ] **App content** tasks completed: privacy policy, target audience, Data safety (metadata section 5), health apps declaration.
- [ ] Store listing assets uploaded.
- [ ] Release created on the internal testing track first, then production.
