/**
 * Parsing Strava JSON without losing ids.
 *
 * From 1 June 2027 Strava may hand out activity and athlete ids above 2^53. A plain
 * JSON.parse turns those into the nearest double, so a different id would be stored,
 * looked up and sent back to Strava. This keeps any whole number too large for a
 * double as its exact digits, in a string. Every id rooka stores is already TEXT and
 * every place that reads one wraps it in String(), so a string id goes through as is.
 * Ids that fit stay numbers, so nothing changes until Strava starts sending big ones.
 *
 * Needs Node 21+ (JSON.parse hands the reviver the source text). On an older Node the
 * value passes through unchanged, which is the old behaviour.
 */

function stravaReviver(key, value, context) {
  if (typeof value === "number" && Number.isInteger(value) && !Number.isSafeInteger(value) && context && typeof context.source === "string") {
    return context.source;
  }
  return value;
}

const parseStravaJson = (text) => JSON.parse(text, stravaReviver);

/** Use in place of `await response.json()` for responses from the Strava API. */
const readStravaJson = async (response) => parseStravaJson(await response.text());

module.exports = { stravaReviver, parseStravaJson, readStravaJson };
