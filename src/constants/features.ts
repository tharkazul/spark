// Launch switches for features that are parked, not deleted. Flip one back to
// true to restore the feature; the code behind it is left in place.

// Direct Garmin login (username + password) is off until Garmin's official
// developer API is available again. Athletes who already connected keep sync
// and disconnect; new athletes are pointed to Garmin -> Apple Health / Strava.
export const GARMIN_DIRECT_LOGIN_ENABLED = false;

// Weekly quests are off: they were generated without looking at the plan and
// could add load the plan didn't ask for. To be replaced by achievements.
// Mirrors QUESTS_ENABLED in server/services/utils.js.
export const QUESTS_ENABLED = false;

// Screens this build has that the server may point athletes to (sent as X-App-Caps).
// The coach's feature reminders only mention a screen when the athlete's app has it.
// Add a name here when a release adds a screen a reminder links to.
export const APP_CAPABILITIES = ['health-connect', 'home-town'];
