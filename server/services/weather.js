/**
 * Weather for the athlete's home town, from Apple WeatherKit (REST API).
 *
 * - One forecast per ~10 km cell (coordinates rounded to 0.1°), shared by every
 *   athlete in that cell and stored in weather_cache, so calls scale with the
 *   number of towns, not athletes. Fetched only when something asks for it.
 * - Monthly budget: refresh every 3 h, every 6 h above 70% of the quota, every
 *   12 h above 90%, and only cached data once the quota is used up.
 * - Without WeatherKit credentials (local development) it falls back to
 *   Open-Meteo, whose free API is for non-commercial use only.
 * - Town search goes through OpenStreetMap Nominatim, one explicit search at a
 *   time (their policy forbids search-as-you-type).
 */
const crypto = require("crypto");
const fs = require("fs");
const db = require("./db");

const all = (sql, p = []) => new Promise((r) => db.all(sql, p, (e, rows) => r(e || !rows ? [] : rows)));
const get = (sql, p = []) => new Promise((r) => db.get(sql, p, (e, row) => r(e ? null : row || null)));
const run = (sql, p = []) => new Promise((res, rej) => db.run(sql, p, function (e) { return e ? rej(e) : res(this); }));

db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS weather_cache (cell TEXT PRIMARY KEY, provider TEXT, fetched_at INTEGER, payload TEXT)`);
  db.run(`CREATE TABLE IF NOT EXISTS weather_usage (month TEXT PRIMARY KEY, calls INTEGER DEFAULT 0)`);
  db.run(`ALTER TABLE users ADD COLUMN home_place TEXT`, () => {});
  db.run(`ALTER TABLE users ADD COLUMN home_lat REAL`, () => {});
  db.run(`ALTER TABLE users ADD COLUMN home_lon REAL`, () => {});
  db.run(`ALTER TABLE users ADD COLUMN home_timezone TEXT`, () => {});
});

const MONTHLY_BUDGET = Number(process.env.WEATHERKIT_MONTHLY_CALLS) || 500000;
const HOUR = 3600 * 1000;
const USER_AGENT = "rooka/1.0 (support@rooka.io)";

/** How long a cached forecast stays fresh, given the share of this month's quota used. */
function freshForMs(usedShare) {
  if (usedShare >= 1) return Infinity;
  if (usedShare >= 0.9) return 12 * HOUR;
  if (usedShare >= 0.7) return 6 * HOUR;
  return 3 * HOUR;
}

const monthKey = () => new Date().toISOString().slice(0, 7);

async function usedShare() {
  const row = await get(`SELECT calls FROM weather_usage WHERE month = ?`, [monthKey()]);
  return (row?.calls || 0) / MONTHLY_BUDGET;
}

function countCall() {
  return run(
    `INSERT INTO weather_usage (month, calls) VALUES (?, 1) ON CONFLICT(month) DO UPDATE SET calls = calls + 1`,
    [monthKey()]
  ).catch(() => {});
}

// --- WeatherKit authentication -------------------------------------------------

let keyCache = null;
function weatherKitConfig() {
  const { WEATHERKIT_TEAM_ID: team, WEATHERKIT_KEY_ID: kid, WEATHERKIT_SERVICE_ID: service, WEATHERKIT_KEY_PATH: keyPath } = process.env;
  if (!team || !kid || !service || !keyPath) return null;
  if (!keyCache || keyCache.path !== keyPath) {
    try {
      keyCache = { path: keyPath, key: crypto.createPrivateKey(fs.readFileSync(keyPath, "utf8")) };
    } catch (e) {
      console.error("[Weather] WeatherKit key could not be read:", e.message);
      keyCache = { path: keyPath, key: null };
    }
  }
  return keyCache.key ? { team, kid, service, key: keyCache.key } : null;
}

const b64url = (buf) => Buffer.from(buf).toString("base64").replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");

let tokenCache = null;
function weatherKitToken(cfg) {
  const now = Math.floor(Date.now() / 1000);
  if (tokenCache && tokenCache.exp - now > 300) return tokenCache.token;
  const header = { alg: "ES256", kid: cfg.kid, id: `${cfg.team}.${cfg.service}` };
  const payload = { iss: cfg.team, iat: now, exp: now + 3600, sub: cfg.service };
  const data = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(payload))}`;
  const signature = crypto.sign("sha256", Buffer.from(data), { key: cfg.key, dsaEncoding: "ieee-p1363" });
  tokenCache = { token: `${data}.${b64url(signature)}`, exp: payload.exp };
  return tokenCache.token;
}

// --- Providers -------------------------------------------------------------------

/** WeatherKit condition codes, reduced to the categories the app has icons for. */
function conditionFromWeatherKit(code) {
  const c = String(code || "").toLowerCase();
  if (/thunder|storm|hurricane/.test(c)) return "thunder";
  if (/snow|flurr|sleet|blizzard|wintry|hail|freezing/.test(c)) return "snow";
  if (/rain|drizzle|shower/.test(c)) return "rain";
  if (/fog|haze|smok|dust/.test(c)) return "fog";
  if (/breezy|windy/.test(c)) return "wind";
  if (/partly|mostlyclear/.test(c)) return "partly_cloudy";
  if (/cloudy/.test(c)) return "cloudy";
  return "clear";
}

/** WMO weather codes (Open-Meteo) to the same categories. */
function conditionFromWmo(code) {
  const n = Number(code);
  if (n >= 95) return "thunder";
  if ((n >= 71 && n <= 77) || n === 85 || n === 86) return "snow";
  if ((n >= 51 && n <= 67) || (n >= 80 && n <= 82)) return "rain";
  if (n === 45 || n === 48) return "fog";
  if (n === 3) return "cloudy";
  if (n === 1 || n === 2) return "partly_cloudy";
  return "clear";
}

const round1 = (v) => (typeof v === "number" && Number.isFinite(v) ? Math.round(v * 10) / 10 : null);
const localDate = (iso, tz) => new Date(iso).toLocaleDateString("en-CA", { timeZone: tz });

async function fetchWeatherKit(cfg, lat, lon, tz) {
  const url =
    `https://weatherkit.apple.com/api/v1/weather/en/${lat}/${lon}` +
    `?dataSets=currentWeather,forecastDaily&timezone=${encodeURIComponent(tz)}`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${weatherKitToken(cfg)}` } });
  await countCall();
  if (!res.ok) throw new Error(`WeatherKit ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data = await res.json();
  const cur = data.currentWeather || {};
  return {
    provider: "weatherkit",
    timezone: tz,
    current: {
      tempC: round1(cur.temperature),
      condition: conditionFromWeatherKit(cur.conditionCode),
      windKmh: round1(cur.windSpeed),
      precipMmH: round1(cur.precipitationIntensity),
    },
    days: (data.forecastDaily?.days || []).map((d) => ({
      date: localDate(d.forecastStart, tz),
      tempMaxC: round1(d.temperatureMax),
      tempMinC: round1(d.temperatureMin),
      condition: conditionFromWeatherKit(d.conditionCode),
      precipMm: round1(d.precipitationAmount),
      windMaxKmh: round1(d.windSpeedMax ?? d.daytimeForecast?.windSpeed),
    })),
  };
}

async function fetchOpenMeteo(lat, lon, tz) {
  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
    `&current=temperature_2m,weather_code,wind_speed_10m,precipitation` +
    `&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,wind_speed_10m_max` +
    `&timezone=${encodeURIComponent(tz)}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Open-Meteo ${res.status}`);
  const data = await res.json();
  const d = data.daily || {};
  return {
    provider: "open-meteo",
    timezone: tz,
    current: {
      tempC: round1(data.current?.temperature_2m),
      condition: conditionFromWmo(data.current?.weather_code),
      windKmh: round1(data.current?.wind_speed_10m),
      precipMmH: round1(data.current?.precipitation),
    },
    days: (d.time || []).map((date, i) => ({
      date,
      tempMaxC: round1(d.temperature_2m_max?.[i]),
      tempMinC: round1(d.temperature_2m_min?.[i]),
      condition: conditionFromWmo(d.weather_code?.[i]),
      precipMm: round1(d.precipitation_sum?.[i]),
      windMaxKmh: round1(d.wind_speed_10m_max?.[i]),
    })),
  };
}

// --- Forecast with cache and budget --------------------------------------------

const inFlight = new Map();

/** Forecast for a location, or null when there's none to give. */
async function getForecast(lat, lon, tz = "Europe/Amsterdam") {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  // Rounded before anything leaves the server: the provider sees the cell, not the athlete's town centre.
  const rLat = Math.round(lat * 10) / 10;
  const rLon = Math.round(lon * 10) / 10;
  const cell = `${rLat.toFixed(1)},${rLon.toFixed(1)}`;
  const cfg = weatherKitConfig();
  const provider = cfg ? "weatherkit" : "open-meteo";

  const row = await get(`SELECT provider, fetched_at, payload FROM weather_cache WHERE cell = ?`, [cell]);
  const cached = row && row.provider === provider ? JSON.parse(row.payload) : null;
  const share = cfg ? await usedShare() : 0;
  if (cached && Date.now() - row.fetched_at < freshForMs(share)) return cached;
  if (cfg && share >= 1) return cached;

  if (inFlight.has(cell)) return inFlight.get(cell);
  const job = (async () => {
    try {
      const fresh = cfg ? await fetchWeatherKit(cfg, rLat, rLon, tz) : await fetchOpenMeteo(rLat, rLon, tz);
      await run(
        `INSERT INTO weather_cache (cell, provider, fetched_at, payload) VALUES (?, ?, ?, ?)
         ON CONFLICT(cell) DO UPDATE SET provider = excluded.provider, fetched_at = excluded.fetched_at, payload = excluded.payload`,
        [cell, provider, Date.now(), JSON.stringify(fresh)]
      );
      return fresh;
    } catch (e) {
      console.error("[Weather] fetch failed:", e.message);
      return cached;
    } finally {
      inFlight.delete(cell);
    }
  })();
  inFlight.set(cell, job);
  return job;
}

async function getHomeTown(userId) {
  const row = await get(`SELECT home_place, home_lat, home_lon, home_timezone FROM users WHERE id = ?`, [userId]);
  if (!row || row.home_lat == null || row.home_lon == null) return null;
  return { name: row.home_place, lat: row.home_lat, lon: row.home_lon, timezone: row.home_timezone || "Europe/Amsterdam" };
}

async function setHomeTown(userId, place) {
  if (!place) {
    await run(`UPDATE users SET home_place = NULL, home_lat = NULL, home_lon = NULL, home_timezone = NULL WHERE id = ?`, [userId]);
    return null;
  }
  const lat = Number(place.lat);
  const lon = Number(place.lon);
  const name = String(place.name || "").trim().slice(0, 120);
  if (!name || !Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) {
    throw new Error("Invalid place");
  }
  let tz = String(place.timezone || "").trim();
  try {
    new Intl.DateTimeFormat("en", { timeZone: tz });
  } catch (_) {
    tz = "";
  }
  await run(`UPDATE users SET home_place = ?, home_lat = ?, home_lon = ?, home_timezone = ? WHERE id = ?`, [
    name,
    lat,
    lon,
    tz || "Europe/Amsterdam",
    userId,
  ]);
  return getHomeTown(userId);
}

async function getForecastForUser(userId) {
  const home = await getHomeTown(userId);
  if (!home) return { home: null, forecast: null };
  return { home, forecast: await getForecast(home.lat, home.lon, home.timezone) };
}

/** The WEATHER CONTEXT block for coach prompts ("" without a home town or forecast). */
async function getWeatherPromptBlock(userId) {
  try {
    const { home, forecast } = await getForecastForUser(userId);
    if (!home || !forecast) return "";
    const c = forecast.current || {};
    const today = forecast.days?.[0] || {};
    const lines = [
      `\nWEATHER CONTEXT (${home.name}, the athlete's home town):`,
      `Now: ${c.tempC ?? "?"}°C, ${c.condition}, wind ${c.windKmh ?? "?"} km/h, precipitation ${c.precipMmH ?? 0} mm/h. Today: ${today.tempMinC ?? "?"}–${today.tempMaxC ?? "?"}°C, ${today.precipMm ?? 0} mm.`,
    ];
    const next = (forecast.days || []).slice(1, 4).map((d) => `${d.date} ${d.tempMaxC}°C ${d.condition}${d.precipMm ? ` ${d.precipMm} mm` : ""}`);
    if (next.length) lines.push(`Next days: ${next.join("; ")}.`);
    if ((c.precipMmH || 0) > 1 || (today.precipMm || 0) > 5 || (c.windKmh || 0) > 25) {
      lines.push("WEATHER ALERT: It is currently very miserable outside (heavy rain or high winds).");
    }
    lines.push("If the athlete is travelling, this is not their local weather.");
    return lines.join("\n") + "\n";
  } catch (e) {
    console.error("[Weather] prompt block failed:", e.message);
    return "";
  }
}

// --- Attribution (required wherever WeatherKit data is shown) -------------------

let attributionCache = null;
async function getAttribution(provider) {
  if (provider !== "weatherkit") {
    return { serviceName: "Open-Meteo.com", legalPageURL: "https://open-meteo.com/", logoLight: null, logoDark: null };
  }
  if (attributionCache && Date.now() - attributionCache.at < 24 * HOUR) return attributionCache.value;
  const fallback = { serviceName: "Apple Weather", legalPageURL: "https://weatherkit.apple.com/legal-attribution.html", logoLight: null, logoDark: null };
  // Logo paths in the response are relative to this host.
  const abs = (u) => (u ? new URL(u, "https://weatherkit.apple.com").toString() : null);
  try {
    const res = await fetch("https://weatherkit.apple.com/attribution/en");
    if (!res.ok) throw new Error(`attribution ${res.status}`);
    const a = await res.json();
    const value = {
      serviceName: a.serviceName || fallback.serviceName,
      legalPageURL: a.legalPageURL || fallback.legalPageURL,
      logoLight: abs(a["logoLight@3x"] || a["logoLight@2x"] || a["logoLight@1x"]),
      logoDark: abs(a["logoDark@3x"] || a["logoDark@2x"] || a["logoDark@1x"]),
    };
    attributionCache = { at: Date.now(), value };
    return value;
  } catch (e) {
    console.warn("[Weather] attribution fetch failed:", e.message);
    return fallback;
  }
}

// --- Town search (OpenStreetMap Nominatim) --------------------------------------

let lastSearchAt = 0;
const searchCache = new Map();

async function searchPlaces(query, lang = "en") {
  const q = String(query || "").trim().slice(0, 100);
  if (q.length < 2) return [];
  const cacheKey = `${lang}:${q.toLowerCase()}`;
  if (searchCache.has(cacheKey)) return searchCache.get(cacheKey);

  // Nominatim allows at most one request per second.
  const wait = lastSearchAt + 1100 - Date.now();
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastSearchAt = Date.now();

  const url =
    `https://nominatim.openstreetmap.org/search?format=jsonv2&addressdetails=1&limit=6&featureType=settlement` +
    `&accept-language=${encodeURIComponent(lang)}&q=${encodeURIComponent(q)}`;
  const res = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
  if (!res.ok) throw new Error(`Place search ${res.status}`);
  const rows = await res.json();
  const results = (Array.isArray(rows) ? rows : []).map((r) => {
    const a = r.address || {};
    const name = a.city || a.town || a.village || a.municipality || a.hamlet || r.name || q;
    const region = a.state || a.province || a.county || "";
    return {
      name,
      region,
      country: a.country || "",
      label: [name, region, a.country].filter(Boolean).join(", "),
      lat: Number(r.lat),
      lon: Number(r.lon),
    };
  });
  if (searchCache.size > 500) searchCache.clear();
  searchCache.set(cacheKey, results);
  return results;
}

module.exports = {
  freshForMs,
  conditionFromWeatherKit,
  conditionFromWmo,
  getForecast,
  getForecastForUser,
  getHomeTown,
  setHomeTown,
  getWeatherPromptBlock,
  getAttribution,
  searchPlaces,
  weatherKitConfig,
  weatherKitToken,
};
