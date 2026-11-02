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

- [x] **Apple Developer Program** membership active (production builds are signed by team Q4XC4JKJDW).
- [ ] **Google Play Console** account registered.
- [x] **Policy pages online:** `https://rooka.io/privacy`, `https://rooka.io/terms`, `https://rooka.io/support`.
- [x] **Privacy policy** (`server/public/privacy.html`, copied to `website/`) describes the AI consent and the data sent to Google Gemini. It goes live with the next server deploy.
- [x] **Apple Paid Apps Agreement** active, with banking and tax details (checked 2 Nov; updated agreements accepted).

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
- [x] **Location permission text** removed from `app.json` (no device location is used). The camera permission is off too.
- [x] **Display name** is `rooka` (lowercase) in `app.json`.
- [x] `npx tsc --noEmit` passes. `npx expo-doctor` (2 Nov) only flags patch-level updates; run `npx expo install --check` to apply them.
- [x] All changes committed, so the build matches a known commit. Build from the latest commit: the last build (31, 26 Oct) is 19 commits behind.

---

## Phase 3: Backend

- [x] Production backend runs on a Google Cloud VM behind `https://api.rooka.io`.
- [x] Latest server code deployed to the VM (checked 2 Nov: consent, remove-connection, race plans, exercise cues, Garmin and TrainerDay sign-in are live; comment and progress-photo endpoints are gone).
- [x] Reviewer account `reviewer-test@rooka.io` exists with seeded data and rooka+ access.
- [ ] Backend monitored and kept online for the whole review period.

---

## Phase 4: Store assets

### Apple App Store
- [x] **iPhone screenshots** (1206 x 2622 px, "iPhone with Dynamic Island, medium display"), 5 uploaded on 2 Nov from `docs/store-screenshots/`: coach, why this workout, week, swim session, marathon goal. Apple reuses them for the other iPhone sizes.
- [x] App icon: `assets/images/icon.png` (1600 x 1600). Prebuild removes transparency for iOS automatically.
- [x] Subscriptions (rooka+ Monthly and Yearly) configured in App Store Connect and "Ready for Review".
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
- [x] App record created for bundle ID `io.rooka.app`.
- [x] Name (`rooka.io`), subtitle, description, keywords, support and privacy URLs entered. The iOS description leaves out Google Play mentions (guideline 2.3.10).
- [x] Screenshots uploaded.
- [x] **App Privacy** questionnaire published on 2 Nov (13 data types, see metadata section 4).
- [x] Age-rating questionnaire completed (metadata section 1).
- [ ] Reviewer credentials and notes entered (metadata section 6).
- [ ] Subscriptions attached to version 1.0.
- [ ] TestFlight build tested on a real device, then selected and submitted for review.

### Google Play Console
- [ ] App created with default language and category.
- [ ] **App content** tasks completed: privacy policy, target audience, Data safety (metadata section 5), health apps declaration.
- [ ] Store listing assets uploaded.
- [ ] Release created on the internal testing track first, then production.
