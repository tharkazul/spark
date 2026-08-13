# Spark PWA → React Native (Expo): Migration Notes

**Prepared from:** `server.js`, `routes/{auth,chat,activities,integrations,physique,social,gamification,settings,admin}.js`, `public/index.html`, `public/script.js`.
**Audience:** the developer rebuilding Spark as a **React Native (Expo)** app.
**Goal:** nothing that exists today gets silently dropped.

## Read in this order
1. **`00_README_START_HERE.md`** (this file) — React Native target stack + web→native mapping, as-is architecture, files I still need, proposed project shape, build order, required server fixes.
2. **`01_API_CONTRACT.md`** — every endpoint, request/response shape, side effects, and the bugs in each.
3. **`02_SCREENS_AND_LOGIC.md`** — cross-cutting client behaviour, then screen by screen, then the modals, workout builder, Life Happens, and the full defect list.
4. **`03_PARITY_CHECKLIST.md`** — flat tick-list to run the port against.

---

## 1. Target stack

**React Native + Expo**, TypeScript, continuing the existing mobile codebase (NativeWind v4, Reanimated, `expo-haptics`, `react-native-draggable-flatlist`). Every library named in these notes is a React Native package; where the web app uses a browser API that has no RN equivalent, the swap is called out inline with `→`.

The web→native mapping used throughout doc 02:

| Web (PWA today) | React Native target |
|---|---|
| 6 divs toggled with `.hidden`, `switchTab()` | `expo-router` (or React Navigation) — bottom tabs + nested stacks |
| 4 sub-tab systems with an `offsetLeft` underline | `MaterialTopTabNavigator`, or segmented control + Reanimated indicator |
| Tailwind CDN + CSS custom properties | NativeWind v4 with the same theme token names |
| `localStorage['nana_token']` | `expo-secure-store` |
| other `localStorage` keys | `@react-native-async-storage/async-storage` |
| ad-hoc `fetch` + `getAuthHeaders()` | one axios/fetch client + interceptors, `@tanstack/react-query` for caching/invalidation |
| `EventSource` (`/api/events`) | `expo-notifications` for background + `react-native-sse` or websocket for foreground (see doc 02 §A.3) |
| Chart.js (PMC, sparklines, radar) | `victory-native` + `react-native-svg` (or `react-native-gifted-charts`) |
| Leaflet + `decodePolyline` | `react-native-maps` / `expo-maps` (keep the polyline decoder as-is) |
| `<input type="file">` + FileReader base64 | `expo-image-picker` + `expo-image-manipulator` (compress **before** base64) |
| `speechSynthesis` | `expo-speech` |
| Web Speech API recognition | `@react-native-voice/voice` (+ `expo-av` for recording) |
| `navigator.vibrate(50)` | `expo-haptics` |
| `<a download>` CSV export | `expo-file-system` + `expo-sharing` |
| Strava OAuth redirect + `?code=` query | `expo-auth-session` / `expo-web-browser` with a `spark://` scheme |
| `innerHTML` + `**bold**` regex | `react-native-markdown-display` |
| DOM-walking typewriter | Reanimated reveal, or switch `/api/chat` to streaming |
| `updateAppHeight`, `inert`, `openChatInput` (iOS Safari viewport hacks) | **delete** — `KeyboardAvoidingView` + safe-area insets |
| `showToast()` | native toast/snackbar |
| `wbMoveStep(idx, dir)` index-based reorder | `react-native-draggable-flatlist` with **stable ids** |

Nothing in `01_API_CONTRACT.md` changes for the client rewrite — the backend stays as-is apart from the targeted fixes in §5.

---

## 2. As-is architecture

```
                     ┌──────────────────────────────────────────┐
  Strava webhook ───▶│  Express (server.js, port 3009)          │
  Garmin Connect ◀──▶│    9 route modules, all on "/"           │
                     │    services/{db,ai,auth,sse,crypto,utils, │
                     │              onboarding}                  │
                     │    SQLite (single file)                   │
                     │    node-cron × 5 + setInterval × 2        │
                     └───────┬─────────────────────┬────────────┘
                             │ REST + JWT          │ SSE /api/events
                     ┌───────▼─────────────────────▼────────────┐
                     │ PWA: index.html + script.js              │
                     │ 6 views toggled by .hidden, no router    │
                     │ Chart.js · Leaflet · Tailwind CDN        │
                     └──────────────────────────────────────────┘
```

**Scheduled jobs** (all `Europe/Amsterdam`, all in `server.js`):
| when | job |
|---|---|
| 00:00 daily | `resetDailyTokensForAllUsers()` + `resetDailyNutritionForAllUsers()` |
| 00:05 daily | `runDailyRecoveryJob()` — muscle fatigue decay / degradation |
| 03:00 daily | `generateAllPublicProfiles()` |
| 08:00 daily | `sendMorningMessage()` — proactive coach push to every user |
| Sun 10:00 | `runWeeklyFeatureOnboardingJob()` — feature discovery nudges |
| every 2 h | `syncAllStravaUsersOnStartup()` |
| every 6 h | `calculateGlobalMaxStats()` — leaderboard normalisation |
| on boot | Strava sync, global stats, overdue token/nutrition resets |

**The backend does not change for the native port.** That is the single most important scoping fact: this is a client rewrite plus a short list of targeted server fixes (§5 below). Don't let it turn into a rewrite of both.

### Where the intelligence actually lives
The AI is not a chat feature bolted on the side — it is the app's **primary write path**. `POST /api/chat` parses ```json blocks out of the model's reply and executes them:

| block | effect |
|---|---|
| bare JSON **array** | replaces `micro_plan` rows for every date in the array (`sport:"Rest"` = clear the day) |
| `{"type":"metrics"}` | upserts `athlete_metrics` (FTP, 5K pace, max HR…) |
| `{"type":"log_activity"}` | inserts an `activities` row with a **negative id** (`-Date.now()`) to avoid Strava id collisions, recalculates Spark, invalidates today's nutrition cache, evaluates quests, and may append a second AI-generated celebration to the reply |
| `{"type":"log_cycle"}` | sets `users.last_cycle_start` |
| `{"type":"log_weight"}` | upserts `weight_log` |
| `{"type":"log_diet"}` / `log_nutrition` | adds macros to `nutrition_intake` + `daily_diet_logs`, with a substring dedupe guard on `items_summary` |

Consequence for the client: **`planUpdated: true` in the chat response means "half your app's state is stale"**. The web client responds by refetching micro-plan, dashboard, settings and nutrition. Model that as a cache-invalidation event (React Query: invalidate the `plan`, `dashboard`, `settings`, `nutrition` keys) rather than four ad-hoc calls.

---

## 3. Files I still need

I have all nine route files and both client files. To finish the spec to the same depth, please send:

**Blocking — I cannot fully specify data shapes without these:**
- `services/db.js` — **the schema**. I've inferred ~30 tables from queries (`users, activities, micro_plan, chat_history, athlete_metrics, athlete_niggles, athlete_muscle_status, milestones, biometrics, weight_log, physique_logs, nutrition_protocols, nutrition_intake, daily_diet_logs, connections, kudos, activity_comments, event_invitations, user_quests, completed_quests, bonus_points, user_titles, user_xp, public_profile_cache, strava_tokens, push_tokens, push_subscriptions, garmin_health_data, user_daily_metrics, completed_micro_steps, user_feature_onboarding`) but not their columns, types, indexes or constraints.
- `services/utils.js` — the largest unknown. Contains `calculateSparkScore`, `getSparkLevelInfo`, `generatePublicProfile` (the exact shape the profile/radar/trends UI consumes), `generateQuestForUser`, `calculateQuestProgress`, `evaluateAndProgressQuests`, `evaluateQuestsAgainstActivity`, `getUserGamificationContext`, `getUserMacroPhase`, `getWeatherContext`, `tagStravaActivity`, `matchGarminExercise`, `updateUserSparkAndCheckLevel`, `triggerLevelUpCoachPrompt`, `sendMorningMessage`, `runDailyRecoveryJob`, `getEffectiveTokenLimit`, `getAMSDateString`. Level thresholds, quest generation rules and the Spark formula all live here.

**Important:**
- `services/ai.js` — `generateWithFallback` signature/fallback chain and how token usage is metered.
- `services/auth.js` — how `authenticateToken` reads the query-param token for SSE.
- `services/sse.js`, `services/crypto.js`, `services/onboarding.js` (+ `FEATURES_REGISTRY`).
- `public/style.css` / the Tailwind config — the theme token definitions.
- `manifest.json` + service worker — installed-PWA behaviour worth matching.

**From the new app:**
- The current Expo project tree (`app/` or `src/`), `package.json`, `app.json`/`app.config.ts`, `tailwind.config.js`, and whatever screens already exist (you've mentioned chat, dashboard, planning, `WorkoutStepBuilder.tsx`) — so I can write the notes as a **diff against what's built** instead of a greenfield spec.
- Any existing API client / auth layer in the native app.

**Useful:**
- `.env.example` (Strava client id, redirect URI, Garmin config, `JWT_SECRET`, Gemini key names).
- Deployment setup (Cloudflare in front? nginx? — matters for SSE buffering and for the push-notification decision).

---

## 4. Proposed RN project shape

Not prescriptive, but this is the structure the rest of these notes assume. Adjust to whatever the existing Expo tree already does.

```
app/                          # expo-router
  (auth)/login.tsx
  (auth)/onboarding/[step].tsx
  (tabs)/_layout.tsx          # 5 tabs, centre Coach FAB
  (tabs)/dashboard/index.tsx  # Dash | Planning top tabs
  (tabs)/progress/index.tsx   # Spark | Nutrition | Health | Daily Log
  (tabs)/coach/index.tsx
  (tabs)/social/index.tsx     # Feed | My Log | Leaderboard
  (tabs)/profile/index.tsx    # Profile | Goals | Connections | Account
  activity/[id].tsx           # was #activity-modal
  workout/[date].tsx          # was #edit-workout-modal (builder)
  profile/[userId].tsx        # was #public-profile-modal
src/
  api/                        # one client + one file per route module + typed models
    client.ts  auth.ts  chat.ts  plan.ts  activities.ts  physique.ts
    social.ts  gamification.ts  settings.ts  integrations.ts
    normalizers/activityDetail.ts
  domain/                     # PURE, UNIT-TESTED — no React, no fetch
    pmc.ts                    # ctl/atl/tsb replay, readiness, trends, projection  (§A.4)
    spark.ts                  # workout Spark estimate                            (§A.4)
    steps.ts                  # steps_json parse / serialise / stable ids          (Part D)
    quests.ts                 # progress %, countdown, status labels
  realtime/                   # SSE or push provider + event→invalidation map      (§A.3)
  stores/                     # session, chat composer prefill, theme
  components/                 # DayCard, WorkoutCard, MacroRings, QuestCard,
                              # ChatBubble, ActionCard, MetricCard, Sparkline, BodyMap
  theme/tokens.ts             # accent, sport colours, chart colours (§A.7)
```

Two rules worth enforcing from commit one:
- **`src/domain/` imports nothing from React or the network.** The PMC math is currently buried in a 450-line `buildDashboard()` and is the single most fragile thing in the app; it needs to be testable in isolation.
- **`src/api/` is the only place that knows the server's quirks** — the two shapes of `GET /api/activity/:id`, the stringified `steps_json`, the stringified `image_path` array, `has_kudosed` being 0/1, `subscriptionTier` vs `subscription_tier`, minutes-vs-seconds in step conditions. Components see clean typed models only.

### Dependencies implied by these notes

```
expo-router  @tanstack/react-query  zustand
expo-secure-store  @react-native-async-storage/async-storage
nativewind@4  react-native-reanimated  react-native-gesture-handler
react-native-safe-area-context  react-native-svg
victory-native                     # charts
react-native-maps                  # activity map
react-native-draggable-flatlist    # workout builder
react-native-markdown-display      # chat rendering
expo-image-picker  expo-image-manipulator  expo-image
expo-speech  @react-native-voice/voice  expo-av
expo-auth-session  expo-web-browser  # Strava OAuth
expo-notifications  react-native-sse # realtime (§A.3)
expo-haptics  expo-location  expo-file-system  expo-sharing
date-fns                           # AMS timezone handling — see below
```

⚠️ **Timezone.** The backend is `Europe/Amsterdam` everywhere (`getAMSDateString`, all five cron jobs) except the chat token gate, which uses UTC (BUG-05). A device in another timezone will disagree with the server about which day "today" is — affecting the plan grid, the nutrition rings, quest expiry and the streak. Decide explicitly: either send the device timezone and make the server honour it, or pin the client to `Europe/Amsterdam` and label it. Do not let each screen compute `new Date().toISOString().split('T')[0]` the way `script.js` does in eleven places.

---

## 5. Suggested build order

1. **Data layer first.** Typed models + API client + auth interceptor + React Query keys, validated against `01_API_CONTRACT.md`. Write the `ActivityDetail` adapter that normalises the two shapes of `GET /api/activity/:id` here, not in the UI.
2. **Auth + onboarding**, including the Strava OAuth deep-link round trip and the resume-state persistence.
3. **Coach screen.** It is the product. Do it before the dashboard, and do the `payload_json` server change (BUG-10) at the same time so comment/mention/invite cards render natively from day one.
4. **Dashboard + Planning.** Port the PMC math (`02_SCREENS_AND_LOGIC.md` §A.4) into a single pure module with unit tests — it is the most easily-broken logic in the app and it currently exists only inside a 450-line render function.
5. **Workout builder.** Highest-complexity component; stable ids before drag-and-drop.
6. **Progress, Social, Profile.**
7. **Realtime/push**, then background sync.
8. **Store-readiness pass:** permissions strings, IAP, privacy nutrition labels, account deletion (Apple requires in-app account deletion — you have the endpoint, make sure the flow is reachable), and the content decision in §A.5.

---

## 6. Server changes needed before/alongside the port

These are small and worth doing while the PWA is still the shipping client:

1. **Real admin roles** (BUG-07) — a `users.role` column; delete the username-substring checks; put the admin endpoints behind the separate admin site.
2. **`chat_history.payload_json`** (BUG-10) — structured action cards instead of embedded HTML.
3. **Chat history pagination** (BUG-13) — `?before=&limit=`.
4. **Fix the dead imports** (BUG-04, BUG-06) — quest generation is currently broken in production.
5. **Fix the physique photo path** (BUG-03) and the cycle-log crash (BUG-02).
6. **Unify the account-deletion table list** (BUG-11) and make `request-account-data` actually produce an export (BUG-09).
7. **Consider streaming `/api/chat`** — removes the need for the 15 s/30 s placeholder theatre and makes the native chat feel dramatically faster.
8. **Decide the mood set** and remove the `horny` path (§A.5 of doc 02) before submission.

None of these block starting the client work; items 1, 2 and 8 do block submission.
