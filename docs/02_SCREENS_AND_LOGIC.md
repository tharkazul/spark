# Rooka — Screen-by-Screen & Function-by-Function Port Spec

> Source: `public/index.html` (≈2 400 lines of markup, 331 element ids) and `public/script.js` (≈6 650 lines, 190 top-level functions).
> **Target: React Native + Expo, TypeScript.** Library swaps are summarised in the web→native table in `00_README_START_HERE.md` §1 and repeated inline where they matter.
> The web app is a **single-page, single-DOM app**: all six views live in the DOM simultaneously and are toggled with `.hidden`. Nothing is a route. The port must convert this into real screens under `expo-router` (or React Navigation) — a bottom tab navigator with a nested stack per tab.

---

## PART A — Cross-cutting client behaviour to reimplement

### A.1 Navigation model

```js
switchTab(t)  // t ∈ 'dashboard' | 'physique' | 'coach' | 'social' | 'profile' | 'history' | 'admin'
```
- Bottom tab bar has **5 buttons**: Dashboard, Physique(labelled "Progress"), **Coach (centre, elevated FAB, 68×68, accent fill, 5 px border in bg colour)**, Social, Profile.
- `'history'` is a legacy alias: `switchTab('history')` immediately calls `switchTab('social'); toggleSocialTab('mylog')`. `#view-history` is an empty div. Do not port it as a screen — port it as a deep link into Social → My Log.
- `'admin'` appears in the views array but **has no markup in index.html**. Confirmed dead. Admin lives on the separate site.
- Header title map: `dashboard:'Dashboard', coach:'AI Coach', profile:'Athlete Profile', physique:'Progress', social:'Activities & Community'`.
- The web version disables every `input/textarea/select` inside hidden views and sets `inert` — a workaround for the iOS Safari keyboard toolbar appearing for offscreen fields. **This whole hack disappears in native**; do not port it.

Per-tab side effects on entry (must become `useFocusEffect` / screen-mount effects):

| tab | fires |
|---|---|
| dashboard | `switchDashboardTab(last)` → resizes ___sparkline_temp___s |
| coach | `chatHistoryLoaded=false`, `loadChatHistory()`, scroll to bottom, clear unread badge, write `localStorage['lastChatViewTimestamp']` |
| physique | `loadPhysiqueLogs()`, `loadNutritionProtocol()`, `loadActiveNiggles()`, `switchProgressTab(last)`, resize radar + 4 ___sparkline_temp___s |
| social | `loadSocialFeed()` |
| profile | `loadSettings()`, `switchProfileTab(last)` |

Sub-tab systems (4 of them, all with an animated underline indicator positioned via `offsetLeft`/`offsetWidth`):
- Dashboard: `dash | planning`
- Progress: `rooka | nutrition | health | dailylog`
- Social: `feed | mylog | leaderboard` (+ nested leaderboard tabs `rooka | quests`)
- Profile: `profile | goals | connections | account`

→ In RN use a `MaterialTopTabNavigator` or a `<SegmentedControl>` + `Animated` indicator. Preserve the *last selected* sub-tab across tab switches (the web app sniffs the DOM for the active class to do this — use state).

### A.2 Session & bootstrap

```js
checkLogin()
  token? -> hide login, loadSettings(), buildDashboard(), loadChatHistory(), initSSE(), loadPendingRequests()
  else   -> show login overlay
```
`localStorage` keys in use → map each to a native store:

| key | purpose | native home |
|---|---|---|
| `nana_token` | JWT | **SecureStore** |
| `lastChatViewTimestamp` | unread badge baseline | AsyncStorage |
| `lastMsgTimestamp` | last SSE message time | AsyncStorage |
| `coachTone` | TTS voice selection | AsyncStorage |
| `onboardTone`, `onboardContext`, `resumeOnboardingStep` | onboarding resume across the Strava OAuth redirect | AsyncStorage (still needed — the OAuth round-trip still leaves the app) |

`getAuthHeaders()` → replace with a single axios/fetch wrapper that injects the token, handles 401 → logout, and 429 → the token-limit UI.

### A.3 Realtime → `initSSE()`
Listeners: `sync_complete` → `buildDashboard()`; `unread_message` → invalidate chat cache, show badge if not on Coach tab else `loadChatHistory()`; `connection_request` → `loadPendingRequests()`; `connection_accepted` / `kudos_received` / `comment_received` → refresh Social if visible. `onerror` → close + reconnect after 5 s.
**React Native:** there is no `EventSource` in RN (Hermes/JSC ship no such global), so pick a transport per §2 of the API contract. Whatever you pick, keep this exact event→refetch mapping — in React Query terms each event becomes one or two `queryClient.invalidateQueries()` calls:

```ts
// events → query keys to invalidate
unread_message      -> ['chat','history']            (+ unread badge state)
sync_complete       -> ['dashboard'], ['plan'], ['history']
connection_request  -> ['social','pending']
connection_accepted -> ['social','feed'], ['social','leaderboard'], ['social','connections']
kudos_received      -> ['social','feed']
comment_received    -> ['social','feed'], ['activity', id]
```
Add an `AppState` listener: on `background` close the stream, on `active` reopen it **and** refetch `['chat','history']` + `['dashboard']`, because anything emitted while suspended is lost. If you use `react-native-sse`, wrap it in a single provider with explicit backoff — the web version's blind `setTimeout(initSSE, 5000)` will hammer the server from a device on a flaky connection.

### A.4 Client-side domain math (⚠️ this is NOT on the server — it must be ported exactly)

**PMC / training load, in `buildDashboard()`.** Rebuilt from scratch on every dashboard load by replaying the entire activity history day by day:
```js
ctl += (dailyRooka - ctl) / 42;   // Fitness,  42-day EMA
atl += (dailyRooka - atl) / 7;    // Fatigue,   7-day EMA
tsb  = ctl - atl;                 // Form
```
Seeded at 0 from the earliest date across `/api/dashboard-data` and `/api/weight`. Days with no activity contribute `rooka = 0` (this is what makes it decay).

**Readiness score:**
```js
readiness = 50 + clamp(tsb * 0.5, -20, +20)
if latest physique log is from today or yesterday:
    readiness += (sleep_quality - 3) * 10
    readiness -= (fatigue_level  - 3) * 10
readiness = clamp(round(readiness), 0, 100)
```
Bands: `<40` red "Need Recovery", `<70` amber "Adequate", else green "Prime Condition".

**TSB → ATL subtitle bands:** `<-30` "Overreaching" (red), `<-10` "Optimal Training", `<5` "Maintaining", `<25` "Fresh / Tapering" (accent), else "Detraining" (amber).

**Fatigue slider position:** TSB mapped from `[-40,+20]` → `[0,100] %`.

**7-day trend arrows:** compare against index `dates.length - 8`; `|Δ|<1` → `~`, up/down arrows with colour (note the *inverted* semantics for ATL: rising fatigue is amber, falling is green).

**Goal projection widget:**
```js
rampRateWeekly = ((ctl - ctl14DaysAgo) / 14) * 7
projectedCtl   = ctl + rampRateWeekly * (daysOut / 7)
percent        = clamp(ctl / targetCtl * 100, 0, 100)
```
If `rampRateWeekly <= 0.1` → "You are not currently building fitness" (amber). If `daysOut === 0` → "Race day is here!".

**Target line:** linear interpolation between `{today, currentCtl}` and each milestone's `{date, target_ctl}`, extended 7 days past the final milestone.

**Weight trend:** vs the most recent entry ≤ 7 days ago; `|Δ| < 0.2 kg` → `~`; gain is red, loss is green (note: hard-coded assumption that losing weight is good — worth revisiting for a general audience).

**Rooka score for a planned workout** (`calculateWbRooka()` in the workout builder) — mirrors the AI prompt's rule: 1.2 Rooka/min endurance, 1.3–1.4 for Z3/4+, 1.0 for Z1/rest, **0.5 per strength set** ignoring rest.

### A.5 Coach mood → avatar
`getCoachAvatar(mood)` resolves a user-uploaded avatar per mood with a fallback chain. Moods produced by the backend: `default`, `hype`, `disappointed`, `support`, `curious`, `empathetic`, `proud`, `horny`.
Note the mismatch: the **upload UI only supports 4 moods** (neutral/hype/disappointed/horny) but the backend emits 8. Everything unmapped falls back to neutral. Decide the canonical mood set during the port and make backend + client agree.

🔴 **Content decision required before App Store submission.** `chat.js` classifies a reply as `mood:'horny'` when it contains any of `horny, sexy, flirt, desire, attractive, love, passion, lust, dream, hot`, and there is a matching `coach_avatar_horny` slot + "Upload Horny" button. Two problems, independent of taste:
1. **False positives are near-certain.** "I love this" / "you were on fire" / "dream session" / "hot day" all trigger it, so an ordinary coaching reply can surface a sexualised avatar unprompted.
2. **Review + rating risk.** A fitness app that can present sexualised coach personas will not pass a 4+ rating, and the *user-uploadable* avatar slot means the app ships a mechanism for user-generated sexual content with no moderation. That is Guideline 1.1.4 / 1.2 territory.
Recommendation for the native build: drop the `horny` mood, the keyword array, the upload slot, and the `coach_avatar_horny` column; keep `hype/disappointed/support/neutral`. Replace the whole keyword-scan approach with an explicit `mood` field the model returns in its JSON block (see A.6) — keyword matching on `"!"` currently classifies almost every reply as `hype` anyway, so the feature is not working as intended regardless.

### A.6 Chat message rendering pipeline (`sendMessage`, `loadChatHistory`)

Current transform chain, applied to `data.reply`:
1. `**bold**` → `<strong>`
2. `*italic*` → `<em>`
3. `![alt](url)` → `<img …onclick="enlargeAvatar(this.src)">` — used for the Pollinations image-generation trick (`https://image.pollinations.ai/prompt/{encoded}?nologo=true` is emitted directly by the model).
4. Word-level typewriter: every text node is split into `<span>`s with `opacity:0; display:none`, then revealed one per **40 ms**, auto-scrolling only while the user is within 150 px of the bottom.

**React Native rewrite:** do not port the DOM-walking typewriter. Use a `Markdown` renderer (`react-native-markdown-display`) plus either a character-count `Animated` reveal or — much better — switch `/api/chat` to a **streaming** response and render tokens as they arrive. The staged placeholder text at 15 s / 30 s exists only because the request is non-streaming.

🔴 **A.6.1 — Server-injected HTML in chat messages must be removed.** Three places store raw HTML with inline `onclick` in `chat_history.content`:
- comment notification → `<button onclick="openActivityModal(123)">View Comment</button>`
- @mention notification → same blob
- event invite → `<div id="invite-buttons-42"><button onclick="acceptEvent(42)">Accept</button><button onclick="declineEvent(42)">Decline</button></div>`, and accept/decline **regex-rewrite that stored HTML** to show "Accepted"/"Declined".

None of this can work in RN. Required backend change (small, do it before the port):
```sql
ALTER TABLE chat_history ADD COLUMN payload_json TEXT;  -- nullable
```
```json
{ "type": "activity_comment", "activity_id": 123 }
{ "type": "event_invite", "invite_id": 42, "state": "pending|accepted|declined" }
```
Client renders a native action card from `payload_json` and leaves `content` as clean prose. Keep writing the HTML too during the transition so the PWA keeps working, then delete it.

### A.7 Theming
CSS custom properties: `--theme-bg, --theme-card, --theme-border, --theme-text, --theme-muted, --theme-accent, --theme-accent-soft, --theme-accent-border`, consumed through Tailwind classes `bg-theme-card`, `text-theme-muted`, etc. There is a live theme picker (`toggleThemePicker`, `updateLiveColor`, `applyThemePreset`, `copyCurrentColors`, `resetThemeColors`) — a dev tool, not a user feature.
**React Native:** this maps cleanly onto NativeWind v4 theme variables (`--theme-*` in your CSS entry file, consumed as `bg-theme-card` etc. exactly as today). Consolidate the hard-coded literals you already flagged (`#FF5F3B`, `#ff6b6b`→`#ff8e53` Strava gradient, chart colours `#0ea5e9` fitness / `#f43f5e` fatigue / `#10b981` readiness / `#8b5cf6` weight / `#f59e0b` target) into the same token file. Chart colours are currently duplicated in ~6 places.

### A.8 Misc client utilities worth porting
| function | note |
|---|---|
| `getMonday(d)` | week starts **Monday**; drives `viewingWeekStart` and `changeWeek(±1)` |
| `getSportCardColor` / `getSportBadge` | sport→colour recipe; move into design tokens |
| `getWeatherEmoji(code)` | WMO code → emoji |
| `decodePolyline(str)` | Google polyline → coords for the activity map (Leaflet today → `react-native-maps` / `expo-maps`) |
| `escapeHTML` | dead in native |
| `showToast(msg,type)` | → native toast/snackbar |
| `formatChatTimestamp`, `formatDateHeader`, `ensureTodayDateGroup` | sticky date separators in chat |
| `updateAppHeight`, `openChatInput`, `forceScrollToBottom` | 100 % iOS-Safari viewport hacks — **delete**, use `KeyboardAvoidingView` |
| `navigator.vibrate(50)` on send | → `expo-haptics` |

---

## PART B — Screen by screen

### B.1 Auth screen — `#login-overlay`
Two forms toggled by `toggleAuthMode('login'|'register')`.
- Login: Username, Password → **"Unlock Dashboard"** → `POST /api/auth/login`
- Register: Choose Username, Create Password → **"Create Account"** → `POST /api/auth/register`
- `#auth-error` inline error, `togglePassword(id)` reveal.
- `attemptAuth(action)` stores the token, then on register goes to onboarding, on login goes to `checkLogin()`.
React Native additions needed: `KeyboardAvoidingView`, `autoComplete` + `textContentType="password"`/`"newPassword"` so iOS Keychain and Android Autofill work, `secureTextEntry` for the reveal toggle, and Sign in with Apple (**required** by App Store rules if you ever add any other social login).

### B.2 Onboarding — `#onboarding-overlay`, 5 steps
`currentOnboardingStep`, `totalOnboardingSteps = 5`, `nextOnboardingStep/prevOnboardingStep/updateOnboardingStep`.

1. **Choose Coach Persona** — `selectTone(el, tone)`; `toggleCustomCoachFields()` reveals custom name/context (admin-gated server-side, see contract §8).
2. **Tell us about yourself** — free-text athlete context + optional **Key Physiological Metrics** repeater (`renderOnboardMetricsEditor`, `addOnboardMetricRow`, `removeOnboardMetricRow`) + **Main Target Event** (`handleOnboardRaceNameInput` → debounced CTL estimate via `ctlEstimateTimeout`).
3. **Rooka & Leveling** — static explainer ("What is Rooka?", "Leveling Up").
4. **Schedule Boundaries** — `renderScheduleBoundaries()`, `cycleAvailability(day)` cycles `available → time_capped → blocked`, `updateAvailabilityMinutes(day, mins)`. Shape: `{ monday:{status, max_minutes}, … }`.
5. **Connect Devices** — Garmin fields (`onboard-garmin-fields`), Strava OAuth button (`saveAndConnectStrava` persists `onboardTone`/`onboardContext`/`resumeOnboardingStep` first, because the browser navigates away).

`completeOnboarding(redirectUrl?)` → `POST /api/user/settings/coach` + `POST /api/user/metrics` + `POST /api/milestones`, clears the resume keys.
**React Native:** the OAuth detour still leaves the app (`expo-web-browser`), so keep the resume-state persistence. Consider making Step 5 skippable-by-default; requiring device connection in onboarding hurts activation and reviewers will test the skip path.

### B.3 Dashboard — `#view-dashboard`

**Sub-tab "Dashboard" (`dashboard-subtab-dash`)**
- **Coach Highlights** card — `#daily-reflection` + `#desk-coach-avatar` (avatar switches to `proud` when a highlight exists), from `GET /api/my-profile → .highlight`, `**bold**`/`*italic*` converted inline.
- **Today's Plan** (`#dash-today-plan-container`) — the *same HTML string* generated for today inside `loadMicroPlan()`, re-injected here. In RN: one `<DayCard />` component rendered in two places, not a string copy.
- **Daily AI Nutrition Protocol** — `#dash-nutrition-content` + `#dash-macro-rings-container` (`renderMacroRings`), "Reset Today's Diet" → `POST /api/physique/nutrition/reset`.
- **Active Quests** — `#active-quests-container`/`#quests-list` via `fetchGamificationData()`; `renderQuestCard(q)` with `getQuestProgressHtml`, `getQuestCountdownHtml`, `getQuestRefreshButtonHtml`. Statuses render as: Active (red pulsing dot), Completed 🏆 (emerald), Replaced 🔄, Closed 🛑, Expired ⏳. Countdown parses `expires_at` as UTC (`replace(" ","T") + "Z"`).
- **4 metric cards**: Fitness / Fatigue / Readiness / Weight — big number + trend arrow + subtitle + 30-day Chart.js ___sparkline_temp___ (`___sparkline_temp____fitness|fatigue|readiness|weight`).
- Readiness + fatigue **slider markers** positioned by percentage.
- **"Fitness toward race day"** goal widget (`#goal-progress-widget`) — days out, now/target CTL, progress bar, projection sentence.
- **PMC chart** (`#pmcChart`) — Chart.js combo: Form as bars (yellow >0 / red <0), Fitness line `#0ea5e9`, Fatigue dashed `#f43f5e`, Target dashed `#f59e0b`, Milestone star points; default x-window = last 14 days → today; pan/zoom enabled (ctrl-drag, wheel, pinch) with a "Reset Zoom" control.
- **Quick Actions** row (`renderQuickActions(planMap, rookaMap)`) — context-dependent chips that jump to Coach with a canned message:
  - if today's actual Rooka > 0 → "🔥 Debrief Workout", "📉 Felt Terrible"
  - else if a non-Rest workout is planned → "⏱️ Time Crunch", "🛑 Skip Today", "🏃‍♂️ Warmup Routine"
  - else (rest day) → "🧘‍♂️ Stretching Routine", "🥗 Nutrition Focus"
  (exact prompt strings are in `script.js:3998-4035` — copy them verbatim, they are tuned)

**Sub-tab "Planning" (`dashboard-subtab-planning`)**
- **Macro Periodization** — `renderMacroPlan()`, phase chips `#phase-base|build|peak|taper`, `#macro-block`, `#macro-progress`, `#macro-fueling`, `#today-marker`.
- **Micro Plan** — `loadMicroPlan()`, week nav `changeWeek(±1)` + `#week-range-label`, 7-column grid (`md:grid-cols-7`, stacks to 1 column on mobile).
  Per day card: weekday + date, weather chip (emoji + max temp), **⚡️ ADAPT** button (only for `date >= today`) → Life Happens sheet; then one card per workout showing sport, "Done" badge when `actualRooka>0 && targetRooka>0`, description (2-line clamp), `actual/target Rooka`, `Structured|Basic`, and a per-workout **push-to-Garmin** icon; finally a dashed **+ Add** button.
  Tapping a workout → Edit Workout modal; tapping + → same modal in create mode.
- **Auto-Generate Week** → `generateTemplate()` → `POST /api/generate-plan`.
- ⚠️ Weather is fetched client-side from **open-meteo hard-coded to Amsterdam** (52.3676, 4.9041). In RN, use `expo-location` (needs `NSLocationWhenInUseUsageDescription`) with a manual-city fallback in settings, and cache the response — this is currently an unauthenticated third-party call on every plan load.

### B.4 Coach — `#view-coach`
- `#chat-window` — bubbles, sticky date separators, coach avatar per mood, timestamps, image attachments, per-message retry button on failure (`resendFailedMessage`, `window.failedMessages`).
- `#coach-input-area` — text input, image picker (`handleImageSelection` → `#image-preview-container`/`#image-preview-list`, `clearImageSelection`), mic (`toggleRecording`/`stopRecording`, Web Speech API), speaker (`toggleSpeaker`/`speakResponse`, `speechSynthesis` with voice chosen from `coachTone`), send.
- `#coach-macro-bar` / `#coach-macro-rings-container` — collapsible macro rings (`toggleCoachMacroBar`) + "Reset Today's Log".
- `#coach-suggestions` — "Analyze my progress" / "Plan my next workout" / "Check fatigue".
- `#mention-autocomplete` — `@` autocomplete over `/api/social/connections` (`initMentionAutocomplete`, `renderAutocomplete`, `updateAutocompleteSelection`, `selectMention`, `hideAutocomplete`). **Note:** this is wired to the *activity comment* box, not the chat box — check which you want in native.
- `triggerProactiveCheckin()` → `POST /api/chat/checkin` on first open of the day.
- On reply with `planUpdated:true` → `loadMicroPlan()`, `buildDashboard()`, `loadSettings()`, `fetchDailyNutritionSummary()`.

**React Native swaps:** Web Speech API → `expo-speech` (TTS) + `expo-av`/`@react-native-voice/voice` (STT, needs `NSMicrophoneUsageDescription` + `NSSpeechRecognitionUsageDescription`). Image picker → `expo-image-picker` + `expo-image-manipulator` to compress **before** base64 (15 MB body cap, and base64 inflates by ~33 %).

### B.5 Progress — `#view-physique` (title "Progress")
Sub-tabs: **Rooka | Nutrition | Health | Daily Log**.
- **Rooka** — `#rooka-level-bar` (level + progress from `settings.rookaLevel`), **Athlete Archetype** radar (`progress_radar`, 4 axes: Endurance / Strength / Versatility / Explosiveness, 0–100), **30-Day Trends** (4 ___sparkline_temp___s from `profile.trends`), **Personal Titles** (`#personal-titles-list`, `generateTitle`, `equipTitle`, `deleteTitle`), quests log (`#quests-log-container`).
- **Nutrition** — protocol card (title, rationale, macro targets), macro rings (`#physique-macro-rings-container`), "Reset Today's Diet".
- **Health** — **Cycle & Readiness** widget (`updateCycleWidget(gender, lastCycleStart, avgCycleLength)`, `#cycle-widget-container`, `#cycle-phase-title`, `#set-cycle-container`, `logCycleStart`), body-map **niggle tracker** (`loadActiveNiggles`, `openNiggleModal(bodyPartId)`, `#niggle-severity-display` 1–5, `saveNiggle`, `resolveNiggle`), muscle fatigue heatmap from `/api/fatigue`, AI insight from `/api/fatigue/insight`.
- **Daily Log** — form: Date, Weight (kg), Sleep Quality 1–5, Fatigue 1–5, Notes/Soreness, Progress Photo → `submitPhysiqueLog` (multipart) → **"Save Log"**; history list `#physique-history` with delete (`deletePhysiqueLog`). Also `submitManualWeight()` → `POST /api/weight`.

⚠️ The cycle widget is gated on `gender === 'Female'`. Check the gender options offered (`Prefer not to say` is the default) and decide the native behaviour for non-binary/unset users rather than inheriting the binary branch.

### B.6 Social — `#view-social` ("Activities & Community")
Sub-tabs **Feed | My Log | Leaderboard**, `toggleSocialTab` / `updateSocialTabUI`.
- **Feed** — `loadSocialFeed()` → `#social-feed-container`; per card: avatar, username, rooka level, activity name/sport/distance/time/Rooka, kudos toggle (`toggleKudos`, optimistic), comment count, tap → Activity modal.
- **My Log** — `loadHistory()` → `#history-list-container`, **Training Load History (PMC)** chart + "Reset Zoom", multi-select checkboxes (`toggleAllLog`) + **CSV export** (`downloadSelectedCSV`). CSV export in native needs `expo-file-system` + `expo-sharing`, not an `<a download>`.
- **Leaderboard** — `loadLeaderboard()`, nested tabs **⚡ Rooka Score** / **⚔️ Quest Champions (7d)** (`switchLeaderboardTab`), `#social-leaderboard-list`.
- **Add person** modal — `openAddPersonModal`, `searchPerson` (exact username), `sendConnectionRequest`; **pending requests** section `#pending-requests-section`/`#pending-requests-list` with `acceptConnection`.
- `openPublicProfile(userId)` → `#public-profile-modal` with avatar, highlight, 4 ___sparkline_temp___s (`renderPublicSparkline`), recent activities.

### B.7 Profile — `#view-profile`
Sub-tabs **Profile | Goals | Connections | Account**.
- **Profile**: profile photo upload (`uploadProfilePicture`), **+ Generate Title**, language select (`changeAppLanguage`, en/nl/de/es/fr), Coach Tone & Style, Coach Name, Coach Context, **Coach Avatars (4 moods)** with per-mood upload (`uploadCoachAvatar(mood)`, previews `#preview-avatar-neutral|hype|disappointed|horny`), Gender, Last Cycle Start, My Background (AI context), Schedule Boundaries editor, **Save Persona** (`saveSettings('coach')`).
- **Goals**: metrics repeater (**+ Add Metric** / **Save Metrics** → `saveMetrics`), milestones repeater (**+ Add Race** / **Save Calendar** → `saveMilestones`, fields: name, date, target CTL, is_main).
- **Connections**: Garmin (email + password + Connect/Disconnect), Strava (**Authorize Rooka** → `connectStravaOAuth`, Disconnect, **Pull Latest Activities** → `forceStravaSync`), per-sport **Strava automation toggles** (`loadStravaAutomations`/`saveStravaAutomations`): *Workout Title Renaming*, *Rooka Score & Goal*, *Workout Structure*, *Rooka Backlink* — 4 booleans per sport type, defaults all true, saved to the two magic `athlete_metrics` keys. Also search privacy toggle (`toggleSearchPrivacy`).
- **Account**: **View Premium Benefits** → `trackRookaPlusClick()` (fake paywall — counts intent only), **Request Account Data** → `requestAccountData()` (counter only ⚠️), **Delete Account** → `confirmDeleteAccount()`, **Log out**.

⚠️ App Store: an in-app "Premium" affordance that leads nowhere is fine, but the moment it becomes a real purchase it must be **StoreKit IAP**, not Stripe/web checkout, for digital content. Plan the entitlement flow server-side (receipt validation → `subscription_tier`) rather than trusting the client.

---

## PART C — Modals (all currently DOM overlays; each becomes a native screen or bottom sheet)

| id | opened by | contents / actions |
|---|---|---|
| `#activity-modal` | `openActivityModal(id)` | `#modal-loader`, `#modal-stats`, **Laps Overview** `#modal-laps-container`, **Strength Sets & PBs** `#modal-sets-container`, map `#actual-map` (Leaflet + `decodePolyline`), kudos `#modal-kudos`, comments `#modal-comments-list` + composer with @mention autocomplete (`fetchModalComments`, `postModalComment`) |
| `#edit-workout-modal` | `openEditWorkoutModal(json, dateStr)` | **the workout builder** — see Part D |
| `#life-happens-modal` | `openLifeHappensMenu(dateStr)` | bottom sheet, 4 actions — see Part E |
| `#niggle-modal` | `openNiggleModal(bodyPartId)` | severity 1–5, notes, save/resolve |
| `#invite-event-modal` | `openInviteModal(microPlanId)` | connections list `#invite-connections-list`, location, time → `submitEventInvite` |
| `#add-person-modal` | `openAddPersonModal()` | username search → `#add-person-results` |
| `#public-profile-modal` | `openPublicProfile(userId)` | avatar, highlight, ___sparkline_temp___s, activities |
| `#image-modal` | `enlargeAvatar(src)` | full-screen image |
| `#theme-picker-overlay` | `toggleThemePicker()` | dev tool — drop |

`overlaysToTrack = ['login-overlay','onboarding-overlay','add-person-modal','post-modal','edit-workout-modal','image-modal','public-profile-modal']` (note `post-modal` is referenced but no longer exists → dead entry).

---

## PART D — The Workout Builder (highest-complexity component)

State: `wbCurrentWorkoutId`, `wbCurrentDateStr`, `wbSteps[]`.
Functions: `openEditWorkoutModal`, `closeEditWorkoutModal`, `calculateWbRooka`, `wbAddStep(type)`, `wbAddRepeat()`, `wbRemoveStep(idx, subIdx?)`, `wbMoveStep(idx, dir, subIdx?)`, `wbUpdateStep(idx, subIdx, field, val)`, `renderWbSteps()`, `renderWbBlock(s, idx, parentIdx, isStrength)`, `syncSingleToGarmin(id, date, sport)`.

**`steps_json` schema — the single most important data structure in the app.** Stored as a *stringified* JSON array inside `micro_plan.steps_json`. Two node kinds:

```jsonc
// leaf
{
  "type": "warmup" | "interval" | "recovery" | "rest" | "cooldown" | "drill",
  "condition_type": "time" | "time_sec" | "distance" | "reps" | "lap.button",
  "condition_value": 15,                 // time => MINUTES; time_sec => SECONDS; distance => metres; reps => count
  "target_type": "heart.rate.zone" | "power.zone" | "pace.zone" | "speed.zone" | "no.target",
  "zone": 4,                             // when using a zone target
  "target_value": "4:15 min/km" | "250W",// optional exact target, overrides zone
  "weight": 80,                          // kg, strength only
  "exerciseName": "Barbell Back Squat"   // strength only
}

// group
{ "type": "repeat", "iterations": 8, "steps": [ /* leaves, one level deep only */ ] }
```
Rules the whole system depends on:
- Nesting is **one level** (`repeat` → leaves). Do not build arbitrary trees.
- `condition_type:"time"` values are **minutes** on the wire and are `*60`'d only at the Garmin boundary. `time_sec` is seconds and is not multiplied. This inconsistency is deliberate (the AI is instructed to use `time_sec` for inter-set rest) — preserve it or migrate both sides at once.
- Strength workouts must carry exercises **in `steps_json`, never in `details`** (the AI prompt repeats this three times because the model gets it wrong).
- `sport` ∈ `Run | Bike | Swim | Strength | Rest` exactly. `Rest` means "clear this day".

**Port notes:** you already have the `react-native-draggable-flatlist` refactor guide for `WorkoutStepBuilder.tsx`. The web version uses `wbMoveStep` up/down buttons with **index-based** identity — when porting, give every step a stable `id` (uuid) at parse time, reorder by id, and serialise back to the index-ordered array on save. Nested `repeat` children need their own inner list; either a nested `DraggableFlatList` (fights the parent's gesture handler) or flatten-with-depth-markers into one list. Flattening is the safer pattern.

---

## PART E — "Life Happens" adaptive replanning
`openLifeHappensMenu(dateStr)` stores `window.currentLifeHappensDate`, slides up `#life-happens-modal-content` (`translate-y-full` → 0, 300 ms; `md:scale-95` on desktop).

`triggerLifeHappensAction(actionType)`:
| action | behaviour |
|---|---|
| `push` | direct `POST /api/micro-plan/push-forward {date}` → toast "Schedule shifted +1 day successfully!" → `loadMicroPlan()` + `loadChatHistory()`. **The only one that does not go through the AI.** |
| `time_crunch` | sends to coach: *"I only have 30 minutes to train on {date}. Strip down the scheduled workout on {date} to the essentials, keeping the intensity high to maintain my Rooka target."* |
| `skip` | *"I cannot train on {date}. Cancel the session scheduled for {date} and safely redistribute the necessary training load across the rest of the week."* |
| `indoors` | *"I need to train indoors on {date}. Swap the scheduled outdoor workout on {date} for an equivalent indoor session (e.g., trainer ride, treadmill, or bodyweight strength)."* |
| anything else | the string is sent verbatim as a chat message |

All non-`push` actions call `sendQuickAction(msg)` → `switchTab('coach')` → prefill input → `sendMessage()`. So the RN version must be able to **navigate to the Coach screen and dispatch a message from another screen**. Implement it as `router.push('/coach', { params: { prefill } })` plus a chat store action (Zustand/Context) that the Coach screen consumes on mount — not as an imperative poke at another screen's state.

---

## PART F — Defects found while reading (fix list, ordered by severity)

| # | severity | file | issue |
|---|---|---|---|
| BUG-07 | 🔴 critical | admin.js | Admin auth = `username.includes("rutger"/"felixson")`. Open registration ⇒ anyone can self-grant admin, including user deletion. Also `simulate-24h`, `trigger-morning`, `trigger-weekly-onboarding` have **no** admin check. Needs a real role column. |
| BUG-08 | 🔴 critical | integrations.js | Garmin **password** stored (reversibly encrypted) because the library does credential login. Reviewer- and GDPR-hostile. At minimum: document it, isolate the key, and put it behind explicit consent copy. Better: drop the Garmin push feature for v1 or move to Garmin's official Training API with OAuth. |
| BUG-09 | 🟠 high | settings.js | `POST /api/request-account-data` increments a counter and returns "Account data request recorded." No export is produced. Shipping this UI in the EU is a compliance risk. |
| BUG-06 | 🟠 high | gamification.js | `generateQuestForUser` never imported ⇒ **quest generation and refresh are both dead** (always 500). |
| BUG-04 | 🟠 high | social.js | `evaluateAndProgressQuests` never imported ⇒ leaderboard quest refresh silently no-ops. |
| BUG-03 | 🟠 high | physique.js | Progress photos written to `<root>/secure_uploads/physique`, read from `<root>/routes/secure_uploads/physique` ⇒ every photo 404s. |
| BUG-02 | 🟠 high | physique.js:73 | `/api/user/cycle/log` references undefined `todayStr`/`intakeRow` in a `console.log` ⇒ throws after the DB write; client never gets a response. |
| BUG-10 | 🟠 high | chat.js / activities.js / social.js | HTML with inline `onclick` stored in `chat_history.content`. Blocks native rendering of comments, mentions and invites. Needs `payload_json`. |
| BUG-05 | 🟡 med | chat.js | Token gate uses `new Date().toISOString()` (**UTC**) while the rest of the app uses `getAMSDateString()` ⇒ off-by-one reset around midnight CET. Also `usage > limit` (not `>=`) lets one request overshoot. |
| BUG-01 | 🟡 med | gamification.js | `res.status(44)` — invalid HTTP status on "title not found". Should be 404. |
| BUG-11 | 🟡 med | admin.js vs settings.js | Two different table lists for account deletion (17 vs 24) ⇒ orphaned rows. Unify. |
| BUG-12 | 🟡 med | chat.js | Mood keyword scan includes `"!"` in `hypeKeywords`, so nearly every reply is `hype`; the `horny` branch fires on `love/hot/dream/passion`. See A.5. |
| BUG-13 | 🟡 med | chat.js | `GET /api/chat/history` returns the entire history unbounded. Add pagination before native launch. |
| BUG-14 | 🟢 low | activities.js | `module.exports = router;` written twice. |
| BUG-15 | 🟢 low | physique.js | `/nutrition/summary` merges tables with `||`, so a genuine `0` falls through to the other source. |
| BUG-16 | 🟢 low | settings.js | Coach-persona entitlement check silently reverts the user's input and returns success. Should 403 or be disabled client-side. |
| BUG-17 | 🟢 low | settings.js | `coach_avatar_horny` is read by GET settings and has an upload button, but the upload handler has no branch for it ⇒ writes to `neutral`. |
| BUG-18 | 🟢 low | gamification.js / activities.js | Delete-then-reinsert patterns (`/api/milestones`, `/api/user/metrics`, `/api/micro-plan/day`) run outside transactions — a mid-flight failure loses data. |
