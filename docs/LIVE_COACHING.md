# Live coaching during a workout

rooka follows a workout live through Garmin LiveTrack and sends short coach cues as push
notifications, which the watch shows during the activity.

```
watch ──GPS + HR──▶ Garmin LiveTrack ──email with link──▶ <code>@rookacoach.com
                                                              │ Cloudflare Email Worker
                                                              ▼
            api.rooka.io/api/webhooks/livetrack ──▶ liveSessionWorker (polls every 10 s)
                                                              │ rules: services/liveCoach.js
watch ◀── phone notification ◀── rooka push (sendPushToUser) ◀┘
```

Measured on 2026-10-20 (Forerunner, iPhone): track points reach the server 3–25 s after
they are recorded (median 13 s); a rooka push shows on the watch within seconds.

## Code

| File | Role |
|---|---|
| `server/services/liveTrack.js` | LiveTrack client (CSRF + cookies, session info, track points). Unofficial API. |
| `server/services/liveCoach.js` | Rule engine, pure. `RULES` holds the approved constants. |
| `server/services/liveSessionWorker.js` | One poller per session, push delivery, `live_sessions` table, resume after restart. |
| `server/routes/liveCoach.js` | Email webhook, `GET /api/live-coach/address` for the athlete's own address. |
| `server/routes/admin.js` | `/api/admin/live-sessions` (list, start from a pasted link, stop), address lookup. |
| `docs/livetrack-email-worker.js` | The Cloudflare Email Worker. |
| `server/test_liveCoach.js`, `server/test_liveSessionWorker.js` | Tests (part of `npm test`). |

## Cue rules (approved 2026-10-20)

| Rule | Value |
|---|---|
| Pace on target | target ±5% (the band rooka sends to the watch) |
| Power on target | exact target ±10%, or the zone bounds |
| HR on target | zone bounds ±3 bpm |
| Smoothing | average of the last 3 moving points (~30 s) |
| Grace at step start | 30 s (pace/power), 60 s (HR) |
| Off target | out of band ≥ 60 s → "ease off" / "pick it up", once per direction per step |
| Spot on | work step ≥ 2 min with ≥ 80% of points in band, at the end of the step |
| Last rep | first step of the last iteration of a repeat of 3+ |
| HR drift | steady stretch ≥ 20 min: HR ≥ 8% above its first 10 min at the same pace (±5%), once |
| Start | once, at the first point |
| Check-in | after 20 min without a cue while on target |
| Budget | ≥ 3 min between cues and ≤ 3 cues per rolling 20 min; the last-rep cue ignores both (it still counts toward the window for later cues) |

Position in the plan follows the activity timer and distance from the start of the activity,
like the watch. A step that ends on a lap press can't be followed, so plan cues stop there.
No GPS means LiveTrack sends no points at all, so treadmill and trainer sessions get nothing.

## Setup

### 1. Server

Add to `server/.env` and restart with `pm2 restart rooka-backend --update-env`:

```
LIVETRACK_WEBHOOK_SECRET=<openssl rand -hex 32>
# optional, default rookacoach.com
LIVETRACK_INBOX_DOMAIN=rookacoach.com
```

### 2. Cloudflare email for `rookacoach.com`

`rookacoach.com` exists only for these addresses. Don't use `rooka.io`: its mail runs on Google
Workspace (MX `aspmx.l.google.com`), Cloudflare would have to take over its MX records, and
catch-all rules don't work on subdomains.

1. **Email Service → Email Routing → Onboard Domain** → `rookacoach.com`. Accept the MX and TXT
   records Cloudflare adds.
2. **Workers & Pages** → Create → Worker `livetrack-email`. Replace the code with
   `docs/livetrack-email-worker.js` and deploy. Under Settings → Variables and secrets add
   `WEBHOOK_URL` (`https://api.rooka.io/api/webhooks/livetrack`) and `WEBHOOK_SECRET` (type
   Secret, same value as `LIVETRACK_WEBHOOK_SECRET`).
3. Email Routing → `rookacoach.com` → **Routing rules** → **Catch-all address** → action *Send to
   a Worker* → `livetrack-email`, enabled.

### 3. Athlete

1. Find the athlete's address: admin page → Live Coaching → user ID → *Show LiveTrack address*
   (the app can later show it from `GET /api/live-coach/address`).
2. Garmin Connect app → Safety & Tracking → LiveTrack: add that address as a contact and turn on
   **Auto Start LiveTrack**, so every outdoor activity sends the link.
3. Watch settings in Garmin Connect → Notifications & Alerts → Smart Notifications →
   **During Activity** on. Otherwise the watch holds rooka's pushes until the activity ends.

The first email session sets the athlete's Garmin profile; later sessions from another Garmin
account to the same address are refused.

## Testing without email

Admin page → Live Coaching: enter the user ID, paste a running LiveTrack link, *Start coaching*.
The table refreshes every 15 s while a session runs and lists every cue sent.
The worker's log (Cloudflare → the worker → Logs) shows each email and the backend's answer.

## Privacy

Track points stay in memory. `live_sessions` keeps the latest effort numbers (no position), the
cues sent and a short summary. The LiveTrack token, which lets anyone follow the athlete's
location, is erased when the session ends. No AI runs during the workout; the coach chat later
reads the summary and cues (`recentLiveSummaries`) as context.
