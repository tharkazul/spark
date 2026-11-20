# Usage analytics: event list and privacy text

Status: built 20 November 2026. Server: `server/services/usageAnalytics.js`, `server/routes/usage.js`, test `server/test_usageAnalytics.js`. App: `src/services/analytics.ts`. Admin: the Usage tab in `server/public/admin.html` (`admin-usage.js`).

## Principles

1. **First party only.** Events go to rooka's own server and into its own database, next to everything else. No analytics SDK, no new company that gets data.
2. **What was pressed, never what was entered.** Events carry a name and a few fixed values (a tab name, a sport, a yes/no). No message text, no numbers the athlete typed, no health values, no workout data, no Garmin data.
3. **Health stays out.** Logging a niggle, weight, food, sleep or a cycle date is not tracked at all, not even as "opened". Those screens reveal health information just by being used. If we ever want counts, the data already sits in the database.
4. **No device identifiers.** No advertising ID, no device ID, no IP address in the events table. A random session id is made each time the app starts and lives only in memory.
5. **Switch off in Profile.** On by default (legitimate interest); "Share usage statistics" in Profile's settings turns it off. Turning it off also deletes what was already recorded.
6. **Raw events kept 90 days**, then deleted automatically. Deleting the account deletes them with it. The charts survive: they read summary tables (counts per day, per week, per sign-up week) that hold no account ids and are kept for good. A day or week is summarised while its raw events are all still there and is final from then on.

## What every event carries

| Field | Example | Note |
|---|---|---|
| `name` | `tab_viewed` | From the list below; the server rejects unknown names |
| `props` | `{"tab": "coach"}` | Only the properties listed per event, only fixed values |
| `user_id` | `12` | Empty before login |
| `session_id` | random | New on every app start, never stored on the phone |
| `platform` | `ios` | ios / android |
| `app_version` | `1.1.1 (36)` | Plus the over-the-air update id, so a fix's effect is visible |
| `day` | `2026-11-20` | Amsterdam date, set by the server |

The app collects events in memory and sends them in one request every 30 seconds and when it goes to the background. If the app is killed before that, those events are lost, which is fine. Development builds only print the events to the Metro log, so testing never ends up in the charts.

## Event list (38 events)

The server keeps the same list in `EVENTS` (usageAnalytics.js) and drops anything not on it, so a new event has to be added in both places.

### Sessions and navigation

| Event | Properties | Answers |
|---|---|---|
| `app_opened` | `cold`: yes/no | How often people come back |
| `session_ended` | `seconds` | How long a visit lasts |
| `tab_viewed` | `tab`: planning / progress / coach / social / profile; `via`: tap / swipe | Which parts of the app get used |
| `subtab_viewed` | `tab`, `subtab`: e.g. fitness / body / history, feed / leaderboard / my_log, profile / training / coach / connections | Which sub-screens nobody opens |
| `screen_viewed` | `screen`: activities / activity_detail / athlete_profile | The screens outside the tabs |
| `push_opened` | `type`: coach / social / plan / other | Which notifications work (the morning message counts as coach) |

### Sign-up and onboarding (the main drop-off funnel)

| Event | Properties | Answers |
|---|---|---|
| `login_viewed` | | Top of the funnel, before there's an account |
| `signup_started` | `method`: email / apple / google | |
| `signup_completed` | `method` | |
| `login_completed` | `method` | Which login methods people actually use |
| `onboarding_step_viewed` | `step`: welcome / language / coach_style / coach_gender / goal | **Where people stop during onboarding** |
| `onboarding_completed` | `seconds` | |
| `ai_consent_shown` | `where`: coach / shortcut / settings | |
| `ai_consent_answered` | `answer`: allow / not_now / off; `where` | How many say no, and where |
| `notifications_answered` | `granted`: yes/no | |
| `integration_connect_started` | `service`: garmin / strava / apple_health / suunto / trainerday | |
| `integration_connected` | `service` | Where connecting fails (recorded when the profile's connection flag turns on, whichever screen did it) |
| `integration_failed` | `service` | |
| `integration_disconnected` | `service` | |

### Planning

| Event | Properties | Answers |
|---|---|---|
| `workout_opened` | `sport`, `from`: today_card / agenda / other | Do people look at their plan |
| `why_this_workout_opened` | | Does anyone read the reasoning |
| `adapt_opened` / `adapt_submitted` | | Is Adapt found and finished (the reason isn't recorded: it's often a niggle) |
| `plan_shifted` | `days` | Adapt's "move everything one day" |
| `workout_added` | `sport`, `how`: manual | |
| `workout_sent_to_device` | `target`: garmin / suunto / apple_watch / trainerday | Which devices matter |
| `activity_logged_manually` | `sport` | |
| `partner_invited` | | |

### Coach

| Event | Properties | Answers |
|---|---|---|
| `coach_message_sent` | `kind`: text / voice / photo | Messages typed or dictated in the chat (not what is said); shortcuts like Adapt have their own events |
| `proposal_answered` | `answer`: accept / reject | Do athletes accept the coach's plan changes |
| `out_of_messages_shown` | | How often the budget is hit |
| `app_update_reloaded` | | Does the update card work |

### Paywall

| Event | Properties | Answers |
|---|---|---|
| `paywall_shown` | `from`: tab_bar / planning / coach / out_of_messages / profile / account / connections / my_log | Which entry point sells |
| `paywall_closed` | `from`, `result`: purchased / cancelled / restored / error | Conversion per entry point |
| `discount_code_tried` | `valid`: yes/no | |

### Social and settings

| Event | Properties | Answers |
|---|---|---|
| `friend_request_sent` | | |
| `kudos_given` | | |
| `setting_changed` | `setting`: coach_style / coach_gender / language / dark_mode / usage_stats; `value` for language, dark mode and turning usage statistics back on | Which settings people touch |

### Deliberately not tracked

Niggles, weight, body measurements, food and nutrition logging, sleep and wellbeing entries, cycle tracking, the content of any message, workout numbers, Garmin or Strava data, location and home town, anything typed into a field, and screen recordings.

## What the admin page shows (Usage tab)

1. **Active athletes** today, this week, per day.
2. **Onboarding funnel** per sign-up week: signed up → opened the app → each onboarding step → finished → allowed the AI → connected a device → messaged the coach → came back in week 2. The biggest loss is red.
3. **Before the account:** login screen → started signing up → created an account, in app sessions.
4. **Paywall:** shown, bought and restored per entry point.
5. **Retention:** per sign-up week, the share active in week 1 to 13 after their own sign-up.
6. **Tabs and all events:** the average share of weekly active athletes who used each.
7. **Event explorer:** any event per day, split by one of its properties (or any event split by platform or app version, to compare before and after an update).

Summaries are recomputed every hour for today and yesterday, and nightly for the last 85 days; "Refresh now" does the hourly run on demand.

## Privacy policy changes

Done in `server/public/privacy.html` (dated 20 November 2026). Section 12 promises to "let you know before the change applies": the app shows a one-time notice after login with a shortcut to the setting.

**Section 1, "Things collected automatically", replace the "Technical logs" bullet with two bullets:**

> - Technical logs on our servers, such as errors and when requests were made, used to fix problems.
> - How you use the app: which screens you open and which buttons you press, such as opening the Progress tab, sending the coach a message or connecting Garmin, together with your phone type and app version. We never record what you type or say, your health, nutrition or workout data, your location or any data from Garmin. This is stored on our own servers; no analytics company receives it. You can turn it off in the app (section 9).

**Section 2, "How we use it", add a bullet:**

> - To see which parts of rooka are used and where people get stuck, so we can improve the app. We do this because we have a legitimate interest in improving rooka; you can object at any time by turning it off.

**Section 8, "Keeping and deleting your data", add after the first paragraph:**

> Records of how you use the app are the exception: they are deleted after 90 days, or straight away when you turn them off or delete your account. What we keep after that are totals, such as how many athletes opened the Coach tab in a week, which can't be traced back to you.

**Section 9, "Your rights", add to the paragraph on withdrawing consent:**

> To stop us recording how you use the app, go to Profile and turn off Share usage statistics. What was recorded before is deleted at the same time.

Section 5 (who else sees your data) doesn't change: the events live on the Google Cloud servers already listed there.

## Store listings

- **App Store Connect, App Privacy:** add *Usage Data → Product Interaction*, purpose *Analytics*, linked to the user, **not** used for tracking. No ATT prompt needed.
- **Google Play, Data safety:** add *App activity → App interactions*, collected, purpose *Analytics*, not shared, user can request deletion.

Both forms can be updated without a new build, but they must be live before the update that starts sending events.

## Legitimate interest, in short

GDPR asks for a written balancing test when relying on legitimate interest. Kept here so it's on file:

- **Purpose:** find where athletes drop off and which features are used, to improve rooka. Not advertising, not shared, not sold.
- **Necessity:** store reviews and server data show *that* people leave, not *where*. Counting presses is the least intrusive way to see where.
- **Balance:** events contain no content and no health data, stay on rooka's own servers, are kept 90 days (after that only anonymous totals remain), can be switched off with one tap (which also deletes them), and athletes are told in the privacy policy and in the app. An athlete of a training app can reasonably expect the maker to see which screens are used.
- **Dutch Telecommunicatiewet 11.7a:** first-party measurement with little privacy impact, not shared with third parties: falls under the analytics exemption from consent, provided athletes are informed (they are) and data isn't used to build profiles of individuals for other purposes (it isn't).

## Rollout

1. Deploy the server (tables, `POST /api/usage-events`, the admin endpoints, the hourly and nightly jobs) together with the updated privacy policy.
2. Update the App Store and Google Play privacy forms.
3. Ship the app part. It's JavaScript only, so an over-the-air update reaches 1.1.1. New athletes run the store build's code on their very first launch, before the update downloads, so their onboarding only shows up in the funnel once a store build includes this code.
