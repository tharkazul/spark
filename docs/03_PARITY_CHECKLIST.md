# Rooka — Feature Parity Checklist

**Target: React Native + Expo, TypeScript.** Tick every row before calling the app "at parity". Grouped by surface. `→` marks where the RN implementation must differ from the web one.

## Auth & session
- [ ] Login (`POST /api/auth/login`)
- [ ] Register (`POST /api/auth/register`)
- [ ] JWT persisted → **SecureStore/Keychain**, not AsyncStorage
- [ ] 401 interceptor → force logout
- [ ] 429 interceptor → token-limit UI with retry button
- [ ] Logout clears token + all cached queries
- [ ] Delete account (`DELETE /api/user/account`) reachable in-app (**Apple requirement**)

## Onboarding (5 steps)
- [ ] Step 1 coach persona select + custom fields (tier-gated)
- [ ] Step 2 athlete context + metrics repeater + target event with CTL estimate
- [ ] Step 3 Rooka/leveling explainer
- [ ] Step 4 schedule boundaries (available / time_capped / blocked + max minutes per weekday)
- [ ] Step 5 Garmin credentials + Strava OAuth
- [ ] Resume state survives the OAuth round trip
- [ ] Completion writes coach settings + metrics + milestones

## Dashboard
- [ ] Coach Highlights card (markdown bold/italic, avatar → `proud`)
- [ ] Today's Plan card (shares the DayCard component with Planning)
- [ ] Daily AI Nutrition Protocol + macro rings + reset
- [ ] Active Quests (5 statuses, progress bar, countdown, refresh button)
- [ ] 4 metric cards: Fitness / Fatigue / Readiness / Weight + trend arrows + subtitles
- [ ] 30-day ___sparkline_temp___s ×4
- [ ] Readiness & fatigue slider markers
- [ ] Goal progress widget (days out, now/target CTL, ramp-rate projection)
- [ ] PMC chart: Form bars, Fitness, Fatigue, Target, Milestone stars, 14-day default window, pan/zoom + reset
- [ ] Context-sensitive Quick Actions (3 branches, exact prompt strings)
- [ ] **CTL/ATL/TSB + readiness math ported as a tested pure module**

## Planning
- [ ] Macro periodization strip (Base/Build/Peak/Taper, progress, fueling, today marker)
- [ ] Week navigation (Monday-start) + range label
- [ ] 7-day grid → responsive stack
- [ ] Weather chip per day (→ device location, not hard-coded Amsterdam)
- [ ] ⚡️ ADAPT button on today+future days
- [ ] Workout card: sport, Done badge, description, actual/target Rooka, Structured|Basic, per-workout Garmin push
- [ ] Add workout (+) per day
- [ ] Auto-Generate Week (`POST /api/generate-plan`)

## Workout builder
- [ ] Create / edit / delete workout
- [ ] Step types: warmup, interval, recovery, rest, cooldown (+ drill→interval)
- [ ] Repeat groups with iterations (one nesting level)
- [ ] Condition types: time (min), time_sec (s), distance, reps, lap.button
- [ ] Targets: HR zone, power zone, pace zone, speed zone, no target, exact `target_value`
- [ ] Strength fields: weight (kg) + exerciseName
- [ ] Live Rooka estimate (1.2/min endurance, 1.3–1.4 high intensity, 1.0 Z1, 0.5/set strength)
- [ ] Reorder → **stable ids**, not array indices
- [ ] Push single workout to Garmin
- [ ] `steps_json` round-trips byte-compatibly with the web app and the AI

## Coach
- [ ] Message list, coach avatar per mood, timestamps, sticky date separators
- [ ] Send text
- [ ] Send images (multi) → **compress before base64**, respect 15 MB cap
- [ ] Failure state + per-message retry
- [ ] Token-limit (429) bubble
- [ ] Staged loading copy at 15 s / 30 s (or replace with streaming)
- [ ] Markdown bold/italic + `![](url)` images (Pollinations)
- [ ] Typewriter reveal (or streaming equivalent)
- [ ] TTS (`speakResponse`) → `expo-speech`
- [ ] STT (mic) → native voice module + permission strings
- [ ] Collapsible macro bar + reset
- [ ] Suggestion chips (Analyze progress / Plan next workout / Check fatigue)
- [ ] Proactive check-in on first open of the day (`POST /api/chat/checkin`)
- [ ] `planUpdated` → invalidate plan + dashboard + settings + nutrition
- [ ] **Action cards** for comment / mention / invite from `payload_json` (not HTML)
- [ ] Unread badge driven by realtime + `lastChatViewTimestamp`

## Progress
- [ ] Rooka: level bar, Athlete Archetype radar (4 axes), 30-day trends, titles (generate/equip/delete), quest log
- [ ] Nutrition: protocol card, macro rings, reset
- [ ] Health: cycle widget, niggle body-map (add/severity/resolve), muscle fatigue heatmap, AI insight
- [ ] Daily Log: date, weight, sleep 1–5, fatigue 1–5, notes, **progress photo** (fix BUG-03 first), history + delete
- [ ] Manual weight entry

## Social
- [ ] Feed with kudos toggle (optimistic) + comment count
- [ ] Activity detail: stats, laps, strength sets, **map** (polyline decode), kudos, comments
- [ ] Comments: post, delete, @mention autocomplete
- [ ] My Log: history list, PMC chart + reset zoom, multi-select, **CSV export via expo-file-system + expo-sharing**
- [ ] Leaderboard: Rooka Score tab + Quest Champions (7d) tab
- [ ] Add person (exact username search) + send request
- [ ] Pending requests + accept
- [ ] Public profile modal (avatar, highlight, 4 ___sparkline_temp___s, activities)
- [ ] Event invites: create (connections, location, time), accept, decline

## Profile
- [ ] Profile photo upload
- [ ] Generate title
- [ ] Language switch (en/nl/de/es/fr) — and pass it to `/api/chat`
- [ ] Coach tone / name / context (tier-gated, **disable rather than silently revert**)
- [ ] Coach avatar uploads per mood (decide the mood set first)
- [ ] Gender, last cycle start
- [ ] Athlete background (AI context)
- [ ] Schedule boundaries editor
- [ ] Metrics repeater (send full set — POST is destructive)
- [ ] Milestones repeater (send full set — POST is destructive)
- [ ] Garmin connect/disconnect
- [ ] Strava OAuth connect/disconnect/force-sync
- [ ] Strava automation toggles ×4 per sport type
- [ ] Search privacy toggle
- [ ] Rooka+ interest tracking
- [ ] Request account data (**make it real or remove it**)

## Realtime
- [ ] Chosen transport implemented (push / polyfilled SSE / websocket)
- [ ] `unread_message` → badge or chat refresh
- [ ] `sync_complete` → dashboard refresh
- [ ] `connection_request` / `connection_accepted` / `kudos_received` / `comment_received` → targeted refetch
- [ ] Reconnect on `AppState` → active
- [ ] Push token registered (`POST /api/notifications/register-push-token`)

## React Native-only work
- [ ] Deep links / URL scheme (Strava callback, notification targets)
- [ ] Permission strings: camera, photo library, microphone, speech recognition, notifications, location
- [ ] `KeyboardAvoidingView` on chat + all forms; delete every web viewport hack (`updateAppHeight`, `inert`, `openChatInput`, the auto-`disabled` loop in `switchTab`)
- [ ] Haptics on send + key actions
- [ ] Safe-area handling (the centre FAB tab bar needs explicit inset math)
- [ ] Offline/empty/error states for every screen (the PWA silently `return`s on failure in several places)
- [ ] Charts: Chart.js → `victory-native` + `react-native-svg` (or `react-native-gifted-charts`); PMC needs pan/zoom, so budget time — `react-native-gesture-handler` pinch/pan over a chart is not free
- [ ] Maps: Leaflet → `react-native-maps` / `expo-maps`
- [ ] Design tokens: accent, sport colours, chart colours consolidated (no literals)
- [ ] `app.json`: `scheme: "rooka"`, bundle id, permission strings, `expo-notifications` config plugin
- [ ] EAS build profiles (dev/preview/production), EAS Update channel, app icon + splash, versioning/`runtimeVersion`
- [ ] `expo-dev-client` for anything needing native modules (voice, maps)

## Release blockers
- [ ] BUG-07 admin privilege escalation fixed
- [ ] BUG-10 HTML-in-chat replaced with `payload_json`
- [ ] Mood set decided; `horny` avatar/keyword path removed (§A.5)
- [ ] Garmin credential storage decision documented + consented (BUG-08)
- [ ] `request-account-data` real or removed (BUG-09)
- [ ] IAP path defined if Rooka+ becomes purchasable (StoreKit, not web checkout)
- [ ] Privacy policy + App Privacy labels covering health data, photos, third-party (Strava, Garmin, Gemini, Pollinations, open-meteo)
