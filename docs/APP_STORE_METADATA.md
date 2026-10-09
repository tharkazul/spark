# App Store & Google Play Store Metadata Specification

Copy, keywords, privacy declarations and reviewer notes for submitting **rooka (`io.rooka.app`)** to the **Apple App Store (App Store Connect)** and **Google Play Console**.

Everything in here must match what the app and backend actually do. If a feature or data flow changes, update this file before the next submission.

---

## 1. General App Store Listing Information

| Attribute | Apple App Store | Google Play Store | Character Limit |
| :--- | :--- | :--- | :--- |
| **App Name / Title** | `rooka - AI Fitness & Recovery` (29 chars) | `rooka: AI Fitness & Recovery` (28 chars) | 30 chars |
| **Subtitle / Short Description** | `AI Coaching & Recovery Scores` (29 chars) | `Personal AI fitness coach, recovery scores, physique & workout tracking.` (72 chars) | iOS: 30 chars<br>Android: 80 chars |
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
> **Display name:** `app.json` still sets the home-screen name (`name`, `CFBundleDisplayName`) to `Rooka` with a capital R. Make it match the store name before building if you want lowercase everywhere.

---

## 2. Keywords (Apple App Store - 100 Character Budget)

```text
strava,garmin,physique,body fat,gym,running,strength,calories,sleep,hrv,training,weight,cardio,lift
```
*(99 / 100 characters, comma-separated, no spaces after commas)*

> [!NOTE]
> Words already in the app name (*rooka*, *AI*, *Fitness*, *Recovery*) and the category are indexed automatically, so they are left out of the keyword field.

---

## 3. Full App Description (Apple App Store & Google Play - 2,866 / 4,000 chars)

```text
rooka is your AI fitness and recovery coach, built to help you train smarter, recover better and stay consistent.

Whether you are training for an endurance event, building strength or just staying active, rooka brings your workouts, recovery data and goals together and turns them into clear, personal coaching.

KEY FEATURES:

• PERSONAL AI COACH
Ask questions, get daily check-ins and receive training advice from your AI coach. The coach uses your workout history, recovery trends and goals to tailor its suggestions, and can build and adjust your training plan.

• DAILY RECOVERY SCORE
See how ready you are before every workout. rooka combines your training load with recovery signals such as heart rate, heart rate variability and sleep into one daily score.

• APPLE HEALTH & APPLE WATCH
Sync workouts, steps, heart rate, heart rate variability, active energy, sleep and body measurements from Apple Health, and send structured workouts to your Apple Watch.

• STRAVA & GARMIN SYNC
Connect Strava and Garmin Connect to import your activities automatically, so all your training lives in one place.

• PHYSIQUE & NUTRITION
Log weight and body fat, and get daily fueling targets matched to your training.

• TRAIN WITH FRIENDS
Connect with training partners you know, see their workouts and send them a spark to cheer them on. Only accepted connections can see your activities.

• STREAKS & LEVELS
Stay motivated with streaks, levels and achievements.

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

Data processed by service providers on rooka's behalf (Google Gemini for AI, Google Cloud for hosting, RevenueCat for subscriptions) counts as data **collected** by rooka and must be declared below.

| Data Type (Apple category) | Collected? | Linked to User? | Used for Tracking? | Purpose |
| :--- | :--- | :--- | :--- | :--- |
| **Contact Info** – Name, Email Address | Yes | Yes | No | App Functionality (account, sign-in) |
| **Health & Fitness** – Health (heart rate, HRV, resting HR, sleep, weight, body fat, VO2 max, cycle tracking) | Yes | Yes | No | App Functionality (recovery score, AI coaching, plans) |
| **Health & Fitness** – Fitness (workouts, steps, active energy) | Yes | Yes | No | App Functionality (recovery score, AI coaching, plans) |
| **Location** – Precise Location | Yes | Yes | No | App Functionality (GPS routes of workouts synced from Strava, Garmin and Apple Health) |
| **User Content** – Photos or Videos (photos sent to the coach, profile picture) | Yes | Yes | No | App Functionality |
| **User Content** – Audio Data (voice notes to the coach) | Yes | Yes | No | App Functionality (speech-to-text) |
| **User Content** – Other User Content (messages to the AI coach, daily log notes) | Yes | Yes | No | App Functionality |
| **Purchases** – Purchase History | Yes | Yes | No | App Functionality (rooka+ access, via RevenueCat) |
| **Identifiers** – User ID, Device ID (push token) | Yes | Yes | No | App Functionality (authentication, notifications) |
| **Diagnostics** | No | – | – | No crash or analytics SDK is included. Change this if one is added. |

> [!IMPORTANT]
> When asked: **"Do you or your third-party partners use data from this app to track users across apps and websites owned by other companies?"** Select **No**.

> [!NOTE]
> **Location check:** the app does not read the device's location itself (no location library is installed), but `app.json` still contains `NSLocationWhenInUseUsageDescription` claiming in-app GPS tracking. Remove that string, or ship the feature, so the permission text matches the app.

---

## 5. Google Play Data Safety Form Declarations

1. **Does your app collect or share any user data?** -> `Yes`
2. **Is all user data collected by your app encrypted in transit?** -> `Yes` (HTTPS/TLS)
3. **Do you provide a way for users to request that their data be deleted?** -> `Yes`
   * In-app deletion: Yes (Profile > Delete Account)
   * Web deletion URL: `https://rooka.io/privacy`
4. **Is data shared with third parties?** -> `No`. Google Gemini, Google Cloud and RevenueCat process data on rooka's behalf as service providers, which Google Play does not count as sharing. Data is still declared as **collected** below.
5. **Data types collected:**
   * **Location:** Precise location (GPS routes of synced workouts).
   * **Personal info:** Name, Email address, User IDs.
   * **Financial info:** Purchase history (subscriptions).
   * **Health and fitness:** Health info (heart rate, HRV, sleep, weight, body composition, cycle tracking), Fitness info (workouts, steps, activity).
   * **Photos and videos:** Photos (photos sent to the coach, profile picture).
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
- rooka is an AI fitness, training and daily recovery coach.
- The reviewer account is pre-configured with:
  1. An active rooka+ subscription (no paywall).
  2. Synced sample running and strength workouts.
  3. Calculated recovery scores, heart rate variability and sleep data.
  4. Sample physique check-ins.
- AI consent (Guideline 5.1.2(i)): the first message in the "Coach" tab asks for permission to share data with Google Gemini, which generates the coach's replies. Nothing is sent to Gemini before the athlete taps "Allow". If they tap "Don't allow", every AI feature stays off and the rest of the app keeps working. The choice can be changed at any time in Profile > Preferences > "AI coach".
- AI coach: after tapping "Allow", ask any training question in the "Coach" tab.
- Social: athletes connect by username and must accept each other. Only accepted connections see each other's activities and training data, and they can react with a "spark". There are no comments, posts or free-text messages between users. To remove a connection, open their profile and tap "Friends".
- Integrations: Profile tab > "Connections".
- Account deletion (Guideline 5.1.1(v)): Profile tab > "Account & Membership" > "Delete Account". A confirmation alert appears before all data is deleted.
- Contact: Rutger van den Berg (support@rooka.io)
```

> [!WARNING]
> This file is tracked in git, so the reviewer password above is in the repository history. Keep that account free of real data, or keep the password out of this file.

---

## 7. Pre-Submission Verification Checklist

- [x] **AI data consent:** the coach's first message asks for explicit permission before any data is sent to Google Gemini (Guideline 5.1.2(i)). It can be changed in Profile > Preferences > AI coach.
- [x] **Privacy policy matches section 3:** `server/public/privacy.html` describes the consent, names Google Gemini and lists the data sent. It goes live when the server is deployed.
- [ ] **Account deletion visible:** the Delete Account button (`ProfileTab.tsx` -> `userApi.deleteAccount()`) is reachable on the Profile screen.
- [ ] **Paid Apps Agreement signed:** banking and tax details are active in App Store Connect.
- [ ] **Subscriptions attached:** the rooka+ subscriptions are attached to version 1.0 when you submit.
- [ ] **Paywall legal links:** the RevenueCat paywall shows working Terms of Use (EULA) and Privacy Policy links.
- [x] **Review account active:** `reviewer-test@rooka.io` exists on `https://api.rooka.io` with seeded data and rooka+ access.
- [x] **Backend hosting:** the production backend runs on a Google Cloud VM.
- [ ] **Backend deployed:** the latest server (comment removal, AI consent, remove-connection, privacy policy) is deployed to the VM before the new build reaches review. Existing athletes get the consent card the next time they open the coach, and their AI features pause until they answer.
