# App Store & Google Play Store Metadata Specification

Copy, keywords, privacy declarations and reviewer notes for submitting **rooka (`io.rooka.app`)** to the **Apple App Store (App Store Connect)** and **Google Play Console**.

Everything in here must match what the app and backend actually do. If a feature or data flow changes, update this file before the next submission.

---

## 1. General App Store Listing Information

| Attribute | Apple App Store | Google Play Store | Character Limit |
| :--- | :--- | :--- | :--- |
| **App Name / Title** | `rooka - AI Training Coach` (25 chars) | `rooka: AI Training Coach` (24 chars) | 30 chars |
| **Subtitle / Short Description** | `Training that fits your life` (28 chars) | `Your AI training coach. A plan that fits your week, your watch and your goal.` (77 chars) | iOS: 30 chars<br>Android: 80 chars |
| **Primary Category** | Health & Fitness | Health & Fitness | N/A |
| **Secondary Category** | Sports | Sports | N/A |
| **Support URL** | `https://rooka.io/support` | `https://rooka.io/support` | Mandatory (iOS) |
| **Marketing URL** | `https://rooka.io` | `https://rooka.io` | Optional |
| **Privacy Policy URL** | `https://rooka.io/privacy` | `https://rooka.io/privacy` | Mandatory |
| **Terms of Service (EULA)** | `https://rooka.io/terms` | `https://rooka.io/terms` | Mandatory for IAPs |
| **Copyright** | © 2026 rooka | N/A | N/A |
| **Age / Content Rating** | From the App Store Connect age-rating questionnaire (see note) | Everyone / PEGI 3 (via IARC form) | N/A |

> [!NOTE]
> **Age rating:** Apple replaced the old 12+/17+ ratings with 4+, 9+, 13+, 16+ and 18+, calculated from the questionnaire. Answer it truthfully: health and wellness topics = yes; medical/treatment information = no (rooka gives fitness guidance, not medical advice); user-generated content = no (there are no comments or posts, only sparks between connections); messaging/chat with other users = no; unrestricted web access = no; advertising = no.

> [!NOTE]
> **Display name:** `app.json` sets the home-screen name (`name`, `CFBundleDisplayName`) to `rooka`, lowercase like the store name.

---

## 2. Keywords (Apple App Store - 100 Character Budget)

```text
marathon,triathlon,running,cycling,swim,fitness,recovery,hrv,sleep,strength,gym,5k,10k,nutrition
```
*(96 / 100 characters, comma-separated, no spaces after commas)*

> [!NOTE]
> Words already in the app name and subtitle (*rooka*, *AI*, *Training*, *Coach*, *fits*, *life*) and the category are indexed automatically, so they are left out of the keyword field. Brand names (Strava, Garmin, Apple Watch, Hyrox) are left out on purpose: Guideline 2.3.7 bars trademarked terms and other apps' names in keywords. They can appear in the description instead.

---

## 3. Full App Description (Apple App Store & Google Play - 3,492 / 4,000 chars)

```text
rooka is your AI training coach. It builds a plan around your real week, your watch and your goal, and adjusts it when life gets in the way.

Training for a marathon or a triathlon, or just want to get fitter? Tell rooka how much time you have each day and which sessions are fixed, like a weekly club run or Tuesday hockey, and your plan fits around them. Travelling, ill or nursing a niggle? Tell the coach and next week changes with you.

KEY FEATURES:

• A PLAN THAT FITS YOUR LIFE
Set how many minutes you can train each day and add your regular sessions. rooka plans running, cycling, swimming and strength training around them and adapts when your week changes.

• PERSONAL AI COACH
Ask questions, get daily check-ins and receive training advice from a coach that knows your workouts, recovery and goals. Pick the coaching style that motivates you, and tap any session to see why it is in your plan.

• DAILY RECOVERY SCORE
See how ready you are before every workout. rooka combines your training load with recovery signals such as heart rate, heart rate variability and sleep into one daily score.

• WORKS WITH YOUR WATCH & PLATFORMS
Sync workouts, steps, heart rate, heart rate variability, active energy, sleep and body measurements from Apple Health and Garmin Connect, and send structured workouts directly to your Apple Watch, Garmin watch or Suunto watch. Connect Strava or Suunto to import your activities automatically, and connect TrainerDay to send planned cycling workouts to your TrainerDay calendar.

• NUTRITION & BODY
Get daily fueling targets matched to your training, and log your weight and body fat.

• TRAIN WITH FRIENDS
Connect with training partners you know, see their workouts and send them a spark to cheer them on. Only accepted connections can see your activities.

• STREAKS, LEVELS & ACHIEVEMENTS
Stay motivated with streaks, levels and achievements that reward following your plan. Planned rest days count too.

rooka+ SUBSCRIPTION:
rooka+ is an optional auto-renewing subscription that unlocks more AI coaching and advanced features.
• Payment is charged to your Apple ID / Google Play account when you confirm the purchase.
• The subscription renews automatically unless auto-renew is turned off at least 24 hours before the end of the current period.
• Your account is charged for renewal within 24 hours before the end of the current period.
• You can manage or cancel your subscription in your App Store / Google Play account settings.

YOUR DATA & AI:
The AI coach runs on Google's Gemini AI service. rooka asks for your permission first, and nothing is sent until you allow it. Once you do, the coach sends Gemini the data it needs to answer you, which processes it on our behalf: your messages to the coach, photos and voice notes you share with the coach, and health and fitness data such as workouts, heart rate, heart rate variability, sleep, steps, active energy, weight and VO2 max, including data read from Apple Health. You can turn the AI coach off at any time in Profile. Your data is never sold and never used for advertising or marketing. You can delete your account and all your data in the app at any time.

HEALTH DISCLAIMER:
rooka is for general fitness and wellness only. It is not a medical device and does not diagnose, treat or give medical advice. Consult a physician before starting a new exercise program.

Support: https://rooka.io/support
Terms of Service: https://rooka.io/terms
Privacy Policy: https://rooka.io/privacy
```

> [!IMPORTANT]
> **Keep the "YOUR DATA & AI" paragraph.** With the athlete's consent, the backend sends health metrics (including Apple Health data), coach messages, chat photos and voice notes to Google Gemini (`server/routes/chat.js`, `server/services/ai.js`). Consent is stored in `users.ai_consent` and enforced in `server/services/aiConsent.js`. The description, privacy policy and in-app consent card must all say the same thing. Never state that health data is "not shared with third parties".

---

## 4. App Privacy Declarations (Apple Nutrition Labels)

Data processed by service providers on rooka's behalf (Google Gemini for AI, Google Cloud for hosting, RevenueCat for subscriptions, Apple WeatherKit and OpenStreetMap for the home-town forecast) counts as data **collected** by rooka and must be declared below.

| Data Type (Apple category) | Collected? | Linked to User? | Used for Tracking? | Purpose |
| :--- | :--- | :--- | :--- | :--- |
| **Contact Info** – Name, Email Address | Yes | Yes | No | App Functionality (account, sign-in) |
| **Health & Fitness** – Health (heart rate, HRV, resting HR, sleep, weight, body fat, VO2 max, cycle tracking) | Yes | Yes | No | App Functionality (recovery score, AI coaching, plans) |
| **Health & Fitness** – Fitness (workouts, steps, active energy) | Yes | Yes | No | App Functionality (recovery score, AI coaching, plans) |
| **Location** – Precise Location | Yes | Yes | No | App Functionality (GPS routes of workouts synced from Apple Health and connected services such as Garmin Connect, Strava and Suunto) |
| **Location** – Coarse Location | Yes | Yes | No | App Functionality (home town the athlete types in Profile, for the weather forecast and the coach) |
| **User Content** – Photos or Videos (photos sent to the coach, profile picture, custom coach avatar) | Yes | Yes | No | App Functionality |
| **User Content** – Audio Data (voice notes to the coach) | Yes | Yes | No | App Functionality (speech-to-text) |
| **User Content** – Other User Content (messages to the AI coach, daily log notes) | Yes | Yes | No | App Functionality |
| **Purchases** – Purchase History | Yes | Yes | No | App Functionality (rooka+ access, via RevenueCat) |
| **Identifiers** – User ID, Device ID (push token) | Yes | Yes | No | App Functionality (authentication, notifications) |
| **Diagnostics** | No | – | – | No crash or analytics SDK is included. Change this if one is added. |

> [!IMPORTANT]
> When asked: **"Do you or your third-party partners use data from this app to track users across apps and websites owned by other companies?"** Select **No**.

> [!NOTE]
> **Location:** the app never asks for the device's location (no location library, no location permission). Workout routes arrive with workouts from Garmin Connect, Strava, Suunto and Apple Health, so Location is still declared as collected data above, but no `NSLocationWhenInUseUsageDescription` or Android location permission is needed.

---

## 5. Google Play Data Safety Form Declarations

1. **Does your app collect or share any user data?** -> `Yes`
2. **Is all user data collected by your app encrypted in transit?** -> `Yes` (HTTPS/TLS)
3. **Do you provide a way for users to request that their data be deleted?** -> `Yes`
   * In-app deletion: Yes (Profile > scroll to bottom > Delete Account & Purge Data)
   * Web deletion URL: `https://rooka.io/privacy`
4. **Is data shared with third parties?** -> `No`. Google Gemini, Google Cloud and RevenueCat process data on rooka's behalf as service providers, which Google Play does not count as sharing. Data is still declared as **collected** below.
5. **Data types collected:**
   * **Location:** Precise location (GPS routes of synced workouts) and approximate location (home town typed in Profile, for the weather forecast).
   * **Personal info:** Name, Email address, User IDs.
   * **Financial info:** Purchase history (subscriptions).
   * **Health and fitness:** Health info (heart rate, HRV, sleep, weight, body composition, cycle tracking), Fitness info (workouts, steps, activity).
   * **Photos and videos:** Photos (photos sent to the coach, profile picture, custom coach avatar).
   * **Audio:** Voice or sound recordings (voice notes to the coach).
   * **Messages:** Other in-app messages (conversations with the AI coach).
   * **Device or other IDs:** Push notification token.
6. **Health apps declaration:**
   * Category: **Fitness and wellness**
   * Confirm the app does not claim to provide medical diagnosis, treatment or clinical intervention.

---

## 6. App Reviewer Notes & Credentials (For Apple & Google Testers)

Enter these in **App Store Connect > App Review Information** and **Google Play Console > App Access**.

```text
DEMO CREDENTIALS:
Username / Email: reviewer-test@rooka.io
Password: Testreview123

REVIEW NOTES:
- rooka is an AI training coach: it plans training around the athlete's available time, fixed sessions, travel and niggles, and adds recovery and nutrition guidance.
- The reviewer account is pre-configured with:
  1. An active rooka+ subscription (no paywall).
  2. Synced sample running and strength workouts.
  3. Calculated recovery scores, heart rate variability and sleep data.
  4. Sample weight and body composition entries and muscle workload data.
- AI consent (Guideline 5.1.2(i)): the first message in the "Coach" tab asks for permission to share data with Google Gemini, which generates the coach's replies. Nothing is sent to Gemini before the athlete taps "Allow". If they tap "Don't allow", every AI feature stays off and the rest of the app keeps working. The choice can be changed at any time in Profile > Preferences > "AI coach".
- AI coach: after tapping "Allow", ask any training question in the "Coach" tab.
- Social: athletes connect by username and must accept each other. Only accepted connections see each other's activities and training data, and they can react with a "spark". There are no comments, posts or free-text messages between users. To remove a connection, open their profile and tap "Friends".
- Integrations: Profile tab > "Connections" (Apple Health, Garmin Connect, Suunto, Strava and TrainerDay, each through its own official OAuth sign-in screen or system permission sheet; rooka never asks for third-party passwords).
- Account deletion (Guideline 5.1.1(v)): Profile tab > scroll to the bottom > "Delete Account & Purge Data". A confirmation alert appears before all data is permanently deleted.
- Contact: Rutger van den Berg (support@rooka.io)
```

> [!WARNING]
> This file is tracked in git, so the reviewer password above is in the repository history. Keep that account free of real data, or keep the password out of this file.

---

## 7. Pre-Submission Verification Checklist

- [x] **AI data consent:** the coach's first message asks for explicit permission before any data is sent to Google Gemini (Guideline 5.1.2(i)). It can be changed in Profile > Preferences > AI coach.
- [x] **Privacy policy matches section 3:** `server/public/privacy.html` describes the consent, names Google Gemini and lists the data sent. It goes live when the server is deployed.
- [x] **Account deletion visible:** the Delete Account button (`ProfileTab.tsx` -> `userApi.deleteAccount()`) is reachable at the bottom of the Profile screen ("Delete Account & Purge Data").
- [ ] **Paid Apps Agreement signed:** banking and tax details are active in App Store Connect.
- [ ] **Subscriptions attached:** the rooka+ subscriptions are attached to the app version in App Store Connect when you submit.
- [ ] **Paywall copy matches the app:** the RevenueCat paywall (configured in the RevenueCat dashboard, not in this repo) does not list weekly quests (`QUESTS_ENABLED = false` in `src/constants/features.ts`).
- [ ] **Website deployed:** the rooka.io pages (`website/` and `server/public/`) match the current app integrations (Garmin Connect, Suunto, Apple Health, Strava, TrainerDay), do not promise weekly quests, and describe the exact account deletion path.
- [ ] **Paywall legal links:** the RevenueCat paywall shows working Terms of Use (EULA) and Privacy Policy links.
- [x] **Review account active:** `reviewer-test@rooka.io` exists on `https://api.rooka.io` with seeded data and rooka+ access.
- [x] **Backend hosting:** the production backend runs on a Google Cloud VM.
- [ ] **Backend deployed:** the latest server (Garmin Connect OAuth/webhooks/Training API, TrainerDay OAuth, updated public HTML pages) is deployed to the VM before the new build reaches review.
