# Spark — Backend API Contract (as-is, extracted from source)

> Source of truth: `server.js`, `routes/{auth,chat,activities,integrations,physique,social,gamification,settings,admin}.js`
> Everything here is what the server **actually does today**, not what it should do. Where behaviour is buggy it is marked `⚠️ BUG`.
> **Target: React Native + Expo, TypeScript.** This contract must be reproduced 1:1 by the RN data layer (typed models + one API client + React Query keys) before any UI work starts.

---

## 0. Global conventions

### 0.1 Mounting
```js
app.use("/api/auth", authRoutes);   // auth.js routes are relative: /register -> /api/auth/register
app.use("/", chatRoutes);           // every other router declares its own full /api/... path
app.use("/", socialRoutes);
app.use("/", gamificationRoutes);
app.use("/", integrationsRoutes);
app.use("/", physiqueRoutes);
app.use("/", activitiesRoutes);
app.use("/", settingsRoutes);
app.use("/", adminRoutes);
```
- Body parser limit is **15 MB** (`bodyParser.json({limit:"15mb"})`). This is the hard ceiling for base64 chat images. The native client must compress before upload or it will get a silent 413.
- `express.static(public/)` serves `/uploads/profiles/*` and `/uploads/coaches/*` **unauthenticated**. Physique photos and chat images are NOT static — they go through authenticated routes.
- CORS is wide open (`app.use(cors())`).

### 0.2 Auth
- JWT, `Authorization: Bearer <token>`, payload `{ id, username }`, `expiresIn: "30d"`, signed with `process.env.JWT_SECRET`.
- Web client stores it in `localStorage['nana_token']`. **RN must use `expo-secure-store`** (Keychain/Keystore), not AsyncStorage — AsyncStorage is plaintext on a jailbroken/rooted device and this token is valid for 30 days.
- `/api/events` (SSE) receives the token as a **query parameter** `?token=...` because `EventSource` cannot set headers. `authenticateToken` therefore must accept both header and query. ⚠️ Tokens land in server access logs — see security notes.

### 0.3 Standard request headers used by the current client
```js
{ 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' }
```
Plus an optional `x-app-language` header read by `POST /api/chat`.

### 0.4 Error envelope
Non-uniform. Three shapes exist in the wild:
```json
{ "error": "message" }
{ "error": "message", "details": "sqlite message" }
{ "success": false }
```
Status codes used: 200, 201, 400, 401, 403, 404, 429, 500 — plus one invalid one (`44`, see BUG-01).
**RN client rule:** normalise this in the fetch/axios interceptor into one `ApiError { status, message }`. Treat any non-2xx as failure, read `.error` if present, never assume `.details` exists.

---

## 1. Auth — `routes/auth.js`

### `POST /api/auth/register`
```
req  { username, password, context? }
res  201 { message, userId, token }
     400 { error: "Username might already exist." }
     500 { error: "Registration failed." }
```
Side effects: bcrypt hash (10 rounds), `athlete_context` defaults to `"New athlete."`, `spark_start_date = new Date().toISOString()`.
`spark_start_date` matters: **activities dated before it earn 0 Spark** (see `POST /api/sync-strava`).

### `POST /api/auth/login`
```
req  { username, password }
res  200 { token, message: "Welcome to Spark HQ" }
     400 { error: "Athlete not found." }
     401 { error: "Incorrect password." }
```
Side effect: `login_count += 1`.

> **No refresh token, no logout endpoint, no password reset.** Logout on the client is just deleting the token. A 30-day expiry means the native app needs an interceptor that catches 401 and routes to login.

---

## 2. Chat & realtime — `routes/chat.js`

### `GET /api/events` — Server-Sent Events
Headers set: `text/event-stream`, `no-cache`, `keep-alive`, `X-Accel-Buffering: no`.
- First frame: `data: {"connected":true}`
- Heartbeat comment `: ping` every **30 s** (guards against Cloudflare QUIC idle timeout).
- Clients tracked in a `Map<userId, Set<res>>`; removed on `req.on("close")`.

Named events emitted anywhere in the codebase:

| event | payload | emitted from |
|---|---|---|
| `unread_message` | `{ message, mood }` | chat, kudos, comments, mentions, invites, connection accept, physique log, admin simulate-24h |
| `sync_complete` | (see utils) | Strava sync |
| `connection_request` | `{ fromUserId, username }` | `POST /api/social/connect` |
| `connection_accepted` | `{ fromUserId, username }` | `POST /api/social/accept` |
| `kudos_received` | `{ activityName, fromUsername }` | `POST /api/social/kudos` |
| `comment_received` | `{ activityName, fromUsername, comment }` | `POST /api/activities/:id/comments` |

**⚠️ React Native blocker:** RN ships no `EventSource` global (neither Hermes nor JSC provides one, and `react-native`'s `fetch` has no streaming body), so this endpoint cannot be consumed as-is. Options, in order of preference:

1. **`expo-notifications` for background + `react-native-sse` for foreground.** This is the recommended shape: push handles delivery when the app is suspended (which SSE fundamentally cannot), the SSE stream handles the live-refresh behaviour while the user is in the app. `POST /api/notifications/register-push-token` already exists (settings.js, writes to a `push_tokens` table) — but the **sending** half is not in the uploaded code, so send `services/` before this is designed. Server work needed: emit an Expo push alongside every `sendSSEEvent(userId, "unread_message", …)`.
2. **`react-native-sse` alone.** Smallest change, keeps the server untouched. It works, but the stream dies on app suspend and iOS will not keep it alive in the background, so you must reconnect on `AppState → active` and refetch to catch up on anything missed. No background notifications at all, which loses the 08:00 morning message — a core product behaviour.
3. **Socket.io / raw WebSocket.** More robust reconnection semantics than SSE and bidirectional if you later stream chat tokens, but it means rewriting `services/sse.js` and the `sseClients` map.

Whichever you pick, note the token is passed as `?token=` (see §0.2) — with `react-native-sse` you can finally use a real `Authorization` header instead, since it supports custom headers. Worth doing: it keeps JWTs out of access logs.

### `GET /api/chat/history`
```
res 200 [ { role, content, mood, timestamp, image_path } ]   // ordered by id ASC, NO pagination, NO limit
```
- `role` ∈ `'user' | 'coach' | 'assistant'` — note **`assistant` is a third value** written only by `POST /api/micro-plan/push-forward`. The client must treat `assistant` as a coach bubble or that message disappears.
- `image_path` is a **JSON-stringified array** of URLs (`["/api/images/chat/img_1_uuid.png"]`) or `null`.
- ⚠️ Returns the entire history every time. On a heavy user this is unbounded. Add `?before=&limit=` server-side before native launch, or the chat screen will take seconds to open.

### `POST /api/chat`
```
req  { message: string, imagesBase64?: string[], language?: 'en'|'nl'|'de'|'es'|'fr' }
     header x-app-language (fallback for language)
res  200 { reply: string, mood: string, planUpdated: boolean }
     429 { error: "Daily token limit reached. Please try again tomorrow!" }
     500 { error: "Failed to load athlete context." | "Context building failed." | "Failed to generate response." }
```
`imagesBase64` entries must be full data URLs matching `/^data:image\/([A-Za-z-+\/]+);base64,(.+)$/`. Non-matching entries are silently dropped.

**Everything this endpoint does, in order** (all of it must be understood, none of it is client-side):
1. `chat_count += 1`.
2. Saves each image to `routes/secure_uploads/chat_images/img_<userId>_<uuid>.<ext>`, records `/api/images/chat/<file>` paths.
3. Token gate: reads `daily_token_usage`, `getEffectiveTokenLimit(user)`. If `last_token_reset_date !== todayUTC`, resets usage to 0 and limit to `spark_plus ? 50000 : 10000`. Rejects with 429 only if `usage > limit` (strictly greater — see BUG-05).
4. Builds a very large system prompt from: coach name/tone/context, macro phase, language directive, AMS date + next-7-day weekday map, weather context, athlete context, gender (+ menstrual-cycle directive if Female), `long_term_memory`, athlete metrics, next 3 milestones, next 14 micro_plan rows, last 3 activities (with per-lap pace/HR breakdown), last 5 `sets_json` rows, muscle fatigue/development rows, active + resolved niggles, gamification (streak, bonus points, latest title).
5. History: last 6 `chat_history` rows, `coach`→`model`, adjacent same-role rows merged, leading non-user and trailing user rows trimmed (Gemini requires strict alternation starting with `user`).
6. Calls `generateWithFallback(message, systemPrompt, cleanHistory, base64DataArray, userId)`.
7. **Parses every ```json block in the reply** and executes side effects (this is the app's whole write-path — see §4.2).
8. Strips the json blocks from the reply text.
9. Derives `mood` by keyword scan (see §4.3).
10. Inserts the user row and coach row into `chat_history`.
11. Every 6th message total, fires `triggerBackgroundSummary(userId)` (long-term memory compaction).

**Latency:** the current client shows staged placeholders at 15 s ("Generating complex plan…") and 30 s ("Almost there…"). Assume p95 well over 10 s. The native client needs the same staged UX and a timeout > 60 s.

### `GET /api/chat/briefing`
```
res 200 { briefing: { content, mood, timestamp } | null }
```
First coach message of the current local day.

### `POST /api/chat/checkin`
```
req  {}
res  200 { reply, mood: "default" }
     500 { error: "AI failed to respond." }
```
Generates a proactive 1–2 sentence greeting (own smaller prompt: metrics, phase, last 3 activities, next 2 planned, weather, gamification). Inserts it into `chat_history` as `coach`. Explicitly instructed **not** to emit JSON, and any ```json is stripped anyway.

### `GET /api/images/chat/:filename` *(defined in physique.js)*
Authorised by filename prefix: rejects unless `filename.startsWith("img_<req.user.id>_")` → 403. Streams the file.

---

## 3. Activities, plan & metrics — `routes/activities.js`

### `GET /api/micro-plan`
```
res 200 [ { id, user_id, date, sport, description, target_spark, details, steps_json, accepted_invites } ]
```
Ordered by `date ASC`. `accepted_invites` is a correlated count from `event_invitations`.

### `POST /api/micro-plan`
```
req  { date, sport, description, target_spark, details, steps_json? }   // steps_json defaults "[]"
res  200 { success: true } | 500 { error, details }
```

### `PUT /api/micro-plan/:id`
```
req  { date, sport, description, target_spark, details, steps_json }
res  200 { success: true }
```
Scoped by `AND user_id = ?`.

### `DELETE /api/micro-plan/:id`
```
res 200 { success: true }
```

### `POST /api/micro-plan/day` — replace a whole day
```
req  { date, workouts: [ { sport, description, target_spark, details, steps_json } ] }
res  200 { success: true } | 400 { error: "Invalid data format" }
```
Deletes all rows for that date first. `workouts: []` clears the day.

### `POST /api/micro-plan/push-forward` — "Life Happens → push everything a day"
```
req  { date }
res  200 { success: true, message }
```
`UPDATE micro_plan SET date = DATE(date,'+1 day') WHERE date >= :date AND date <= DATE(:date,'+6 days')`.
Also inserts a `chat_history` row with **`role='assistant'`** and `mood='empathetic'`.

### `GET /api/dashboard-data`
```
res 200 [ { date: 'YYYY-MM-DD', sport_type, daily_spark } ]
```
Grouped by day+sport, then re-aggregated in JS through `mapStravaSportToSpark()` (Strava's `Ride`/`VirtualRide`/etc. → Spark's `Bike`/`Run`/`Swim`/`Strength`). Drives the PMC chart and the "actual vs planned" badges.

### `GET /api/history`
```
res 200 [ { id, name, sport_type, start_date, spark_score, distance_km, moving_time_min, average_heartrate } ]  // LIMIT 50
```

### `GET /api/activity/:id` — **dual-shape response, read carefully**
Attempts a live Strava fetch (refresh token → `GET /activities/:id`). On success returns the **raw Strava activity object**, optionally with `sets_json` attached (from `best_efforts`, or for `WeightTraining` from `sets`/`exercises`/`laps`).
On any failure falls back to local DB and returns a **normalised object**:
```json
{ "id","name","type","sport_type","distance","moving_time","elapsed_time",
  "total_elevation_gain","average_heartrate","has_heartrate","suffer_score",
  "spark_score","start_date","start_date_local","sets_json","kudos_count" }
```
Note the unit change: `distance` is **metres**, `moving_time` **seconds**, while the DB stores km and minutes. Visibility scope includes accepted friends' activities.
**RN action:** write one adapter (`normalizeActivityDetail(raw): ActivityDetail`) at the API-client boundary. Do not let two shapes leak into components — and note the unit switch, since the Strava shape is metres/seconds while every other endpoint gives km/minutes.

### `POST /api/generate-plan` — "Auto-Generate Week"
```
req  { targetDate: 'YYYY-MM-DD' }
res  200 { reply, mood, planUpdated }
```
Builds a 7-day plan prompt (schedule boundaries, active niggles, metrics, recent sets, CTL/ATL/TSB, phase). Parses the trailing ```json array, **deletes every micro_plan row on the affected dates**, reinserts. Then writes a *fabricated* user message (`"Can you build my plan for next week, Spark?"`) plus a canned coach acknowledgement into `chat_history`. The `reply` returned to the client is the prose part with the json stripped.

### Metrics
```
GET  /api/user/metrics      -> [ { id, metric, value } ]         (ordered by metric ASC)
POST /api/user/metrics      req { metrics: [ {metric, value} ] } -> { message }
```
⚠️ POST is destructive: deletes all rows except the two system keys `strava_opt_out_activities` and `strava_share_settings`, then reinserts. Client must always send the full set.

### `GET /api/user/activities/types`
```
res 200 ["Run","Ride","WeightTraining", ...]   // flat string array of DISTINCT sport_type
```

### Strava sharing prefs (stored as rows inside `athlete_metrics`)
```
POST /api/user/strava-opt-out        req { optOutActivities: string[] }
POST /api/user/strava-share-settings req { shareSettings: { [sportType]: { shareName, shareScore, shareStructure, shareLink } } }
res  { success: true }
```
Read back via `GET /api/user/metrics` and JSON-parsing the two magic keys.

### Activity comments
```
GET    /api/activities/:id/comments                 -> { comments: [ { id, activity_id, user_id, comment, created_at, username, profile_picture_url } ] }
POST   /api/activities/:id/comments  req { comment } -> { success, comment: <row> } | 400 empty
DELETE /api/activities/:id/comments/:commentId       -> { success, deletedId }
```
⚠️ **Porting landmine.** On POST the server writes a chat message to the activity owner *containing raw HTML with an inline handler*:
```html
<br><div class="mt-2"><button onclick="openActivityModal(123)" class="...">View Comment</button></div>
```
It also parses `@mentions` (`/@([a-zA-Z0-9_.-]+)/g`) and sends the same HTML blob to each mentioned user. See §4.4 for how to fix this for native.

---

## 4. Integrations — `routes/integrations.js`

### Strava webhooks (server-to-server, no client work)
```
GET  /webhook/strava   -> hub.challenge echo, verify token = process.env.STRAVA_VERIFY_TOKEN || "STRAVA"
POST /webhook/strava   -> aspect_type=create + object_type=activity  => getStravaActivity(owner_id, object_id)
                          object_type=athlete + updates.authorized=false => wipe strava tokens
```

### `POST /api/user/settings/strava-exchange` — OAuth code exchange
```
req  { code }
res  200 { message: "Strava connected successfully!" } | 400 | 500
```
Stores `users.strava_refresh_token` and upserts `strava_tokens {user_id, access_token, refresh_token, expires_at, strava_id}`.
**React Native:** the web flow is a full-page redirect to `https://www.strava.com/oauth/authorize` and a `?code=` query read on return (`checkStravaCallback()`). In RN use `expo-auth-session` + `expo-web-browser` with a custom scheme redirect (`spark://strava-callback`), registered both in `app.json` (`scheme: "spark"`) and in the Strava API application's Authorization Callback Domain. Strava only accepts a bare domain there, so if a custom scheme is rejected you need a small https redirect page on your own domain that bounces to `spark://`.

### `POST /api/user/settings/strava`
```
req { stravaRefreshToken } -> { message }
```
Manual token paste path. Probably drop in native.

### `POST /api/sync-strava`
```
res 200 { message: "Successfully synced N activities!" } | 400 missing token | 500
```
Pulls `athlete/activities?per_page=200`, upserts into `activities` (ON CONFLICT id → updates tss, spark_score, moving_time_min, average_heartrate), calls `tagStravaActivity()` per activity (this is what writes the Spark description back to Strava, gated by the share settings above), then `updateUserSparkAndCheckLevel()`.
`tss = act.suffer_score || round(moving_time/3600*50)`.
**Spark is zeroed for activities dated before `users.spark_start_date`.**

### `POST /api/user/disconnect/strava`
Calls Strava `/oauth/deauthorize` with the stored access token, nulls `strava_refresh_token`, deletes `strava_tokens`. → `{ message }`

### `POST /api/user/settings/garmin`
```
req { garminUsername, garminPassword } -> { message } | 400
```
⚠️ Stores the **user's Garmin password**, symmetrically encrypted via `services/crypto.encrypt`, because `@flow-js/garmin-connect` needs to log in as the user. There is no Garmin OAuth here. This is a hard blocker for App Store review and GDPR — see the security section of the main spec.

### `POST /api/user/disconnect/garmin` → nulls both columns.

### `POST /api/sync-garmin` — push structured workouts to a Garmin watch
```
req  { workouts: [ { date, sport } ] }        // acts as a filter over the user's micro_plan
res  200 { success: true, message: "Successfully pushed N structured workouts!" }
     400 { error: "No workouts selected for sync." | "No valid workouts found to sync." }
     500 { error: "Server sync failed", details }
```
Logic worth preserving verbatim:
- `SPORT_MAP`: Run→1/running, Bike→2/cycling, Swim→4/swimming, Strength→5/strength_training. `Rest` and anything unmapped is skipped.
- `STEP_TYPE_MAP`: warmup 1, cooldown 2, interval 3, recovery 4, rest 5. `drill` is normalised to `interval`.
- `TARGET_TYPE_MAP`: no.target 1, power.zone 2, heart.rate.zone 4, speed.zone 5, pace.zone 6.
- `CONDITION_TYPE_MAP`: time 2, time_sec 2, distance 3, lap.button 1, reps 10.
- If `steps_json` is empty, it fabricates one interval of `max(5, round(target_spark/55*60))` minutes.
- `condition_type === 'time'` ⇒ `endConditionValue = value * 60` (the plan stores **minutes**, Garmin wants **seconds**). `time_sec` maps to the same Garmin id but is *not* multiplied — the AI is told to use `time_sec` for rest between strength sets.
- `target_value` containing `min/km` → converts to `pace.zone` with ±5 % window (`speed = 1000/(m*60+s)`); containing `w` → `power.zone` with ±10 %.
- `distance` conditions get `preferredEndConditionUnit {unitId:1, unitKey:"meter", factor:100}`.
- `weight` → `weightValue` + `{unitId:9, unitKey:"kilogram"}`.
- `exerciseName` → `matchGarminExercise()` lookup giving `category`/`exerciseName`, else falls back to `description`.
- Swim adds `poolLength: 25` + meter unit.
- POST to `connectapi.garmin.com/workout-service/workout`, then `/schedule/{workoutId}` with `{date}`; **1 s sleep between workouts**.

---

## 5. Physique, health & nutrition — `routes/physique.js`

### `POST /api/user/cycle/log`
```
req { cycleStartDate } -> { message: "Cycle logged successfully!" }
```
⚠️ **BUG-02 — this route throws.** Its success callback contains
`console.log('NUTRITION API for user', req.user.id, 'date', todayStr, 'intakeRow:', intakeRow);`
and neither `todayStr` nor `intakeRow` exists in scope → `ReferenceError` after the UPDATE succeeds, so the DB write lands but the client never gets a response. Delete that line.

### Weight / biometrics
```
POST /api/weight  req { date, weight_kg, body_fat_percent?, bmi?, lean_mass_kg? } -> { success } | 400
GET  /api/weight  -> [ { date, weight_kg, body_fat_percent, bmi, lean_mass_kg } ]  // ASC
```
Upsert keyed on `(user_id, date)`.

### Niggles (injury tracker)
```
GET  /api/niggles/active        -> [ full rows where status='active' ]
GET  /api/niggles/history       -> [ { id, body_part, severity, notes, status, reported_date, resolved_date } ] DESC
POST /api/niggles               req { body_part, severity(1-5), notes? } -> { success } | 400
PUT  /api/niggles/:id/resolve   -> { success }
```
POST upserts by `(user_id, body_part, status='active')`. Every write calls `triggerBackgroundSummary(userId)` so the coach's long-term memory learns about it.

### Muscle status
```
GET /api/fatigue          -> [ { body_part, fatigue_score, development_score, last_updated, status } ]
GET /api/fatigue/insight  -> { insight: "1-2 sentence AI summary" }
```
`status` is derived server-side: `fatigue_score > 30` → `'fatigued'`, else `development_score > 20` → `'prime_development'`, else `'fresh'`. Powers the body-map heatmap.

### Physique logs
```
GET    /api/physique      -> [ physique_logs rows ] DESC LIMIT 50
POST   /api/physique      multipart: photo? + { date, weight_kg?, sleep_quality?, fatigue_level?, notes? } -> { success }
DELETE /api/physique/:id  -> { success }
```
POST also mirrors weight into `biometrics`, **responds immediately**, then asynchronously generates a proactive coach message (vision-enabled if a photo was attached) and pushes it over SSE as `unread_message` with `mood: 'support'`.
DELETE also deletes the `biometrics` row for that date.

### `GET /api/images/physique/:filename`
Prefix-guarded (`physique_<userId>_`).
⚠️ **BUG-03 — broken path.** Written to `routes/../secure_uploads/physique` (i.e. `<project>/secure_uploads/physique`) but read from `path.join(__dirname,"secure_uploads/physique")` (i.e. `<project>/routes/secure_uploads/physique`). Every progress photo 404s. Chat images happen to work because both write and read use the `routes/`-relative form.

### `GET /api/physique/nutrition` — AI macro protocol (heavy)
```
res 200 { suggested: { title, rationale, carbs, protein, fat }, intake: { carbs, protein, fat } | null }
```
Cached per day in `nutrition_protocols`. On miss: latest weight (default 75 kg), macro phase, athlete context + long-term memory, today's completed activities, today's planned workouts → nutritionist prompt → strict JSON → cached. On AI failure falls back to `carbs = w*4, protein = w*1.8, fat = w*1`.
Cache is invalidated when a manual activity is logged through chat.

### `GET /api/physique/nutrition/summary` — the ring widget
```
res 200 { has_data, target:{carbs,protein,fat}, logged:{...}, percentages:{...}, items_summary: string }
```
Default target if no protocol cached: `w*3.5 / w*1.8 / w*0.9`.
⚠️ Uses `a || b || 0` to merge `daily_diet_logs` and `nutrition_intake`, so a legitimately logged `0` falls through to the other table. Minor, but worth fixing while porting.

### `POST /api/physique/nutrition/reset`
Deletes today's `daily_diet_logs` and `nutrition_intake` rows. → `{ success, message }`

---

## 6. Social — `routes/social.js`

### Profiles
```
GET /api/my-profile            -> cached public profile JSON, generating on demand
GET /api/social/profile/:id    -> same for another user
```
Shape (from `generatePublicProfile`, in `services/utils.js` — **not uploaded, please send**) is consumed by the client as:
```
{ highlight: string,                       // markdown-ish, ** and * used
  trends: { dates[], ctl[], atl[], tsb[], weight[] },
  radar:  { endurance, strength, versatility, explosiveness },   // 0-100
  ...avatar/title/activity fields used by openPublicProfile() }
```
Regenerated nightly at 03:00 by cron; cache invalidated on title equip/delete/generate.

### Connections
```
POST /api/social/search       req { username } -> { found:false } | { found:true, user:{ id, username, status } }
POST /api/social/connect      req { friendId } -> { success }
POST /api/social/accept       req { friendId } -> { success }
GET  /api/social/connections  -> { connections: [ { friend_id, status, username } ] }
```
Search matches **exact username, case-insensitive**, excludes self and anyone with `search_privacy = 1`. There is no partial/fuzzy search.
Connections are stored as **two mirrored rows**: requester gets `pending`, target gets `pending_received`; accept flips both to `accepted`.
Accept additionally generates an AI welcome message to the *friend* and pushes `unread_message`.

### Feed
```
GET /api/social/feed -> { activities: [ activity + { username, profile_picture_url, total_spark, kudos_count, has_kudosed, comment_count, spark_level } ] }  // LIMIT 20
```
Self + accepted friends, `start_date DESC`. `has_kudosed` is a count (0/1), not a boolean.

### `POST /api/social/kudos`
```
req { activityId } -> { success: true, added: true|false }   // toggle
```
On add (and not self): SSE `kudos_received` to the owner + an AI hype message inserted into their chat with `mood:'hype'` + SSE `unread_message`.

### Leaderboard
```
GET /api/social/leaderboard -> { leaderboard: [...], questLeaderboard: [...], topActivities: [...] }
```
- `leaderboard`: 7-day window. `total_spark_score = SUM(activities.spark_score last 7d) + SUM(bonus_points last 7d)`, plus `total_minutes`, `total_activities`, `quests_completed_7d`, `quest_spark_7d`, `spark_level`.
- `questLeaderboard`: re-sorted by completed count, then quest spark, then username.
- `topActivities`: top 3 by `spark_score` in the last 7 days across self+friends.
- ⚠️ **BUG-04:** the route calls `evaluateAndProgressQuests(id)` but that symbol is **not in social.js's import list**. It throws a `ReferenceError` swallowed by the surrounding `try/catch`, so quest progress is silently never refreshed here. Add it to the destructured require from `../services/utils`.

### Event invitations ("train together")
```
POST /api/social/invite            req { micro_plan_id, invitee_ids[], location, time } -> { success } | 400 | 404
GET  /api/social/invite/:plan_id   -> { invites: [ { invitee_id, status } ] }
POST /api/social/invite/:id/accept -> { success } | 404 | 400 already processed
POST /api/social/invite/:id/decline-> { success }
```
⚠️ Same HTML-in-chat problem as comments: the invite message embeds
`<div id="invite-buttons-<id>"><button onclick="acceptEvent(<id>)">Accept</button>…</div>`
and accept/decline **string-replace that HTML inside the stored chat row** to show "Accepted"/"Declined". See §4.4.
Accepting also copies the inviter's `micro_plan` row into the invitee's plan, notifies the inviter, and fires a background AI schedule-conflict check.

---

## 7. Gamification — `routes/gamification.js`

### Milestones (races/goals)
```
GET  /api/milestones  -> [ { id, user_id, name, date, target_ctl, is_main } ] ASC
POST /api/milestones  req { milestones: [ {name, date, target_ctl, is_main} ] } -> { success, message }
```
⚠️ POST is delete-all-then-reinsert, not in a transaction. Always send the complete list.

### `GET /api/gamification`
```
res 200 { quests: [...], titles: [...], bonus_points: [...] }
```
Before responding it: runs `evaluateAndProgressQuests`, marks quests `expired` if `completed_at > expires_at`, force-closes all but the newest `active` quest (**hard invariant: max 1 active quest per user**), then per quest computes `current_value` (`calculateQuestProgress`), `progress_percent`, `time_remaining_str`, and `unit` (`distance_km`→km, `moving_time_min`→min, `spark_score`→pts).

Quest object as the client sees it:
```
{ id, user_id, description, target_metric, target_value, reward_points,
  status: 'active'|'completed'|'expired'|'void'|'closed',
  expires_at, created_at, completed_at,
  current_value, progress_percent, time_remaining_str, unit }
```

### `POST /api/gamification/generate_quest`
```
res 200 { success, quest } | 400 { error: "You already have an active quest." } | 500
```
⚠️ **BUG-06:** calls `generateQuestForUser(userId,"common")` which is **not imported** in gamification.js (it *is* imported in activities.js). Every call throws → caught → 500 "Failed to generate quest". This feature is dead in production right now. Add to the require.

### `POST /api/gamification/refresh_quest`
```
req { quest_id } -> { success, quest } | 404 | 500
```
Marks the old quest `void`, generates an easier replacement (lower reward). Same missing-import bug.

### `POST /api/gamification/evaluate_quests` → `{ success, message }`

### Titles
```
POST   /api/gamification/generate_title -> { success, title: { id, title, description, is_active } }
POST   /api/titles/:id/equip            -> { success, equipped: bool, activeTitleId }
DELETE /api/titles/:id                  -> { success, deletedId }
```
Generating a title also awards **50 bonus points** and clears `public_profile_cache`. Auto-equips only if the user has no active title. Equip is a **toggle** and enforces at most one active title.
⚠️ **BUG-01:** equip returns `res.status(44)` on "title not found" — not a valid HTTP status. `fetch` will throw / axios will behave unpredictably. Should be 404.

---

## 8. Settings — `routes/settings.js`

### `GET /api/user/settings` — the big client bootstrap object
```json
{ "id","username","hasStrava","hasGarmin","garminUsername",
  "coachTone","coachName","coachContext",
  "coachAvatarNeutral","coachAvatarHype","coachAvatarDisappointed","coachAvatarHorny",
  "athleteContext","gender","lastCycleStart","averageCycleLength",
  "searchPrivacy","profilePictureUrl","trainingAvailability",
  "sparkLevel": { /* getSparkLevelInfo(total_spark) */ },
  "dailyTokenUsage","dailyTokenLimit","subscriptionTier","subscription_tier" }
```
`dailyTokenUsage` is zeroed client-visibly if `last_token_reset_date !== today(AMS)`. Note `subscriptionTier` **and** `subscription_tier` are both returned (snake_case was added later; the client reads both in places). Pick one in the native model.
`trainingAvailability` is parsed from a JSON column into `{ monday: { status, max_minutes }, … }`.

### `POST /api/user/settings/coach`
```
req { coachTone, coachName, coachContext, athleteContext, gender, lastCycleStart, trainingAvailability }
res { message: "Coach updated successfully!" }
```
⚠️ **Entitlement check:** if `subscription_tier !== 'admin'` and the user tries a custom tone / a `coachName !== 'Spark'` / any `coachContext`, the server **silently reverts** all three to defaults and returns success. The client shows no error. This is a UX trap — the native app should read the tier and disable the fields instead.

### Other settings
```
POST   /api/settings/privacy                     req { searchPrivacy: bool } -> { success }
POST   /api/user/settings/language               req { language } -> { success, language }
POST   /api/settings/profile-picture             multipart photo -> { success, url }
POST   /api/settings/coach-avatar                multipart photo + { mood } -> { success, mood, url }
POST   /api/user/settings/coach-avatar           (alias of the above)
POST   /api/notifications/register-push-token    req { pushToken, platform? } -> { success }
POST   /api/track-spark-plus-click               -> { success }        // fake paywall counter
POST   /api/request-account-data                 -> { success, message } // GDPR counter only, no export
DELETE /api/user/account                         -> { success, message } | 403 for admin usernames
```
Coach avatar `mood` ∈ `neutral | hype | disappointed` mapped to `coach_avatar_*` columns.
⚠️ A fourth column `coach_avatar_horny` is returned by GET settings and has an "Upload Horny" button in the UI, but `handleCoachAvatarUpload` has **no branch for it** — uploads fall through to `coach_avatar_neutral`. See the content decision in the main spec.

⚠️ `POST /api/request-account-data` does **not** produce a data export. It increments a counter. If you ship to the EU App Store with a "Request my data" button that does nothing, that is a real GDPR exposure.

⚠️ The delete-account table list here (24 tables) and the one in `admin.js` (17 tables) **differ**. admin's is missing `nutrition_intake, daily_diet_logs, biometrics, physique_logs, milestones, bonus_points`. Unify them into one shared function.

---

## 9. Admin — `routes/admin.js`

```
POST   /api/admin/simulate-24h                -> fires a proactive check-in for the caller
POST   /api/admin/trigger-morning             -> runs sendMorningMessage() for everyone
POST   /api/admin/trigger-weekly-onboarding   -> runs runWeeklyFeatureOnboardingJob()
GET    /api/admin/usage                       -> per-user usage table
POST   /api/admin/add-tokens                  req { targetUsername } -> +50 000 to daily_token_limit
POST   /api/admin/set-tier                    req { targetUsername, tier } -> sets tier + limit (spark_plus 50k / else 10k)
DELETE /api/admin/delete-user/:targetUsername
GET    /api/admin/onboarding-status/:userId   -> { userId, features: [ {key,name,description,status,introduced_at,first_used_at} ] }
```

🔴 **CRITICAL — BUG-07 / privilege escalation.** Authorisation is:
```js
const isRutger = req.user.username?.toLowerCase().includes("rutger");
const isFelix  = req.user.username?.toLowerCase().includes("felixson");
if (!isRutger && !isFelix && req.user.id !== 1) return 403;
```
Registration is open and usernames are user-chosen. **Anyone can register `rutger99` and get full admin**, including `DELETE /api/admin/delete-user/:username` for every non-admin account. The same substring logic is what protects admin accounts from deletion, so it is load-bearing in two directions.
Also note `simulate-24h` and `trigger-morning`/`trigger-weekly-onboarding` have **no admin check at all** — any authenticated user can trigger the global morning-message job.

Fix before the native app ships: add a real `users.role` column, check `role='admin'`, and move these routes behind the separate admin site you already decided on.
