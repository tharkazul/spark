/**
 * Cloudflare Email Worker for <code>@live.rooka.io (see docs/LIVE_COACHING.md).
 *
 * Garmin LiveTrack emails a link when an athlete starts an activity. This worker pulls
 * the link out of the email and posts it to the rooka backend, which looks up the
 * athlete by the address code and starts live coaching. The server never parses email.
 *
 * Worker settings → Variables and secrets:
 *   WEBHOOK_URL     https://api.rooka.io/api/webhooks/livetrack
 *   WEBHOOK_SECRET  same value as LIVETRACK_WEBHOOK_SECRET on the server (type: Secret)
 */

const LINK = /https:\/\/livetrack\.garmin\.com\/session\/[0-9a-fA-F-]{36}\/token\/[0-9A-Za-z]{16,64}/;

function decodeQuotedPrintable(s) {
  return s.replace(/=\r?\n/g, "").replace(/=([0-9A-F]{2})/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
}

// The link may sit in a plain, quoted-printable or base64 encoded part.
function bodiesOf(raw) {
  const out = [raw, decodeQuotedPrintable(raw)];
  for (const m of raw.matchAll(/((?:[A-Za-z0-9+/=]{40,}\r?\n){2,}[A-Za-z0-9+/=]*)/g)) {
    try {
      out.push(atob(m[1].replace(/\s+/g, "")));
    } catch (_) {}
  }
  return out;
}

export default {
  async email(message, env) {
    const raw = await new Response(message.raw).text();
    const found = bodiesOf(raw).map((body) => body.match(LINK)).find(Boolean);
    if (!found) {
      console.log(`No LiveTrack link in mail to ${message.to} from ${message.from}`);
      return;
    }
    const res = await fetch(env.WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-rooka-webhook-secret": env.WEBHOOK_SECRET },
      body: JSON.stringify({ to: message.to, from: message.from, url: found[0] }),
    });
    console.log(`LiveTrack for ${message.to}: backend answered ${res.status} ${await res.text()}`);
  },
};
