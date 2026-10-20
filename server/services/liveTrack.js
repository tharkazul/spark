/**
 * Garmin LiveTrack client.
 *
 * Reads the public LiveTrack link an athlete shares (by email) with no Garmin login:
 * the session page hands out a CSRF token and two cookies, after which the JSON API
 * answers. Unofficial and undocumented, so every call fails soft and the caller decides
 * what to do. Only livetrack.garmin.com is ever contacted.
 */

const LIVETRACK_ORIGIN = "https://livetrack.garmin.com";
const LINK_RE = /https:\/\/livetrack\.garmin\.com\/session\/([0-9a-fA-F-]{36})\/token\/([0-9A-Za-z]{16,64})/;
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36";
const TIMEOUT_MS = 15000;

/** { sessionId, token, url } from any text containing a LiveTrack link, else null. */
function parseLiveTrackUrl(text) {
  const m = String(text || "").match(LINK_RE);
  if (!m) return null;
  return { sessionId: m[1].toLowerCase(), token: m[2], url: `${LIVETRACK_ORIGIN}/session/${m[1]}/token/${m[2]}` };
}

class LiveTrackClient {
  constructor({ sessionId, token }) {
    this.sessionId = sessionId;
    this.token = token;
    this.headers = null;
  }

  get pageUrl() {
    return `${LIVETRACK_ORIGIN}/session/${this.sessionId}/token/${this.token}`;
  }

  async authenticate() {
    const res = await fetch(this.pageUrl, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(TIMEOUT_MS) });
    const html = await res.text();
    const csrf = (html.match(/name="csrf-token"\s+content="([^"]+)"/) || html.match(/content="([^"]+)"\s+name="csrf-token"/) || [])[1];
    if (!res.ok || !csrf) throw new Error(`LiveTrack page ${res.status}${csrf ? "" : " without csrf token"}`);
    const cookies = (res.headers.getSetCookie ? res.headers.getSetCookie() : []).map((c) => c.split(";")[0]).join("; ");
    this.headers = { "User-Agent": UA, Accept: "application/json", "Livetrack-Csrf-Token": csrf, Cookie: cookies };
  }

  async getJson(path) {
    if (!this.headers) await this.authenticate();
    for (let attempt = 0; attempt < 2; attempt++) {
      const res = await fetch(`${LIVETRACK_ORIGIN}${path}`, { headers: this.headers, signal: AbortSignal.timeout(TIMEOUT_MS) });
      if (res.status === 403 && attempt === 0) {
        // CSRF token or cookie expired: fetch a fresh pair once.
        await this.authenticate();
        continue;
      }
      if (!res.ok) throw new Error(`LiveTrack ${path.split("?")[0]} ${res.status}`);
      const text = await res.text();
      return text ? JSON.parse(text) : null;
    }
    throw new Error("LiveTrack refused after re-authenticating");
  }

  /** Session info: start, end (start + 24 h while live), unitId, publisher.connectUserProfileId, ... */
  getSession() {
    return this.getJson(`/api/v2/sessions/${this.sessionId}?token=${encodeURIComponent(this.token)}`);
  }

  /** Track points after `begin` (an ISO dateTime of the last point seen), oldest first. */
  async getTrackPoints(begin) {
    const q = new URLSearchParams({ token: this.token });
    if (begin) q.set("begin", begin);
    const data = await this.getJson(`/api/sessions/${this.sessionId}/track-points/common?${q}`);
    const points = (data && data.trackPoints) || [];
    return points.filter((p) => p && p.dateTime).sort((a, b) => Date.parse(a.dateTime) - Date.parse(b.dateTime));
  }
}

module.exports = { LiveTrackClient, parseLiveTrackUrl };
