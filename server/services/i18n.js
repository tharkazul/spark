/**
 * Server-side i18n.
 *
 * Every user-facing string the server produces (push notifications, coach chat messages
 * written without the LLM, API error/success messages) must be in the athlete's selected
 * language (users.language). LLM prompts must carry languageDirective(lang).
 *
 * Supported languages mirror the app: en, nl, de, es, fr.
 */
const db = require("./db");
const { messages, apiMessages, apiPatterns } = require("../locales/serverMessages");

const SUPPORTED = ["en", "nl", "de", "es", "fr"];
const LANGUAGE_NAMES = {
  en: "English",
  nl: "Dutch (Nederlands)",
  de: "German (Deutsch)",
  es: "Spanish (Español)",
  fr: "French (Français)",
};

function normalizeLang(lang) {
  if (!lang || typeof lang !== "string") return "en";
  const code = lang.toLowerCase().trim().slice(0, 2);
  return SUPPORTED.includes(code) ? code : "en";
}

function languageName(lang) {
  return LANGUAGE_NAMES[normalizeLang(lang)];
}

function interpolate(str, params) {
  if (!params) return str;
  return str.replace(/\{(\w+)\}/g, (m, k) => (params[k] !== undefined && params[k] !== null ? String(params[k]) : m));
}

/** Translate a server message key (see locales/serverMessages.js), e.g. t('nl', 'push.newComment.title'). */
function t(lang, key, params) {
  const l = normalizeLang(lang);
  const entry = key.split(".").reduce((o, k) => (o && typeof o === "object" ? o[k] : undefined), messages);
  if (!entry) return key;
  const str = typeof entry === "string" ? entry : entry[l] || entry.en;
  return interpolate(str, params);
}

/** Lower-case sport noun for use inside sentences, e.g. sportNoun('nl', 'Run') -> 'hardloopsessie'. */
function sportNoun(lang, sport) {
  const key = Object.keys(messages.sports).find((k) => k.toLowerCase() === String(sport || "").toLowerCase());
  return t(lang, `sports.${key || "Other"}`);
}

/** Sport as a label, e.g. sportLabel('nl', 'Run') -> 'Hardlopen'. */
function sportLabel(lang, sport) {
  const key = Object.keys(messages.sportLabels).find((k) => k.toLowerCase() === String(sport || "").toLowerCase());
  return key ? t(lang, `sportLabels.${key}`) : String(sport || t(lang, "sportLabels.Other"));
}

/** Localized macro-cycle phase name (BASE, BUILD, PEAK, TAPER, RACE WEEK, RACE DAY). */
function phaseName(lang, phase) {
  const key = String(phase || "").toUpperCase().trim();
  const entry = messages.phases[key];
  return entry ? entry[normalizeLang(lang)] || entry.en : String(phase || "").toLowerCase();
}

/**
 * Standard instruction appended to every LLM prompt that produces athlete-facing text.
 * Keep JSON keys / enum values in English so parsers keep working.
 */
function languageDirective(lang) {
  const l = normalizeLang(lang);
  const name = LANGUAGE_NAMES[l];
  return `\n\nLANGUAGE (MANDATORY): The athlete's selected app language is ${name} (${l}). Write ALL athlete-facing text (messages, titles, descriptions, rationale, tips, workout names and step notes) fluently and exclusively in ${name}. Never mix languages, and translate activity names from other languages naturally into ${name}. Only JSON keys, enum values and sport codes (e.g. RUN, BIKE, "pre", "post") stay exactly as specified in English, and so do strength-exercise "exerciseName" values (they are matched against the watch exercise library).`;
}

const langCache = new Map(); // userId -> { lang, at }
const LANG_CACHE_MS = 60 * 1000;

function rememberUserLanguage(userId, lang) {
  if (userId) langCache.set(String(userId), { lang: normalizeLang(lang), at: Date.now() });
}

/** Resolve a user's selected language (cached briefly). Always resolves, defaults to 'en'. */
function getUserLanguage(userId) {
  if (!userId) return Promise.resolve("en");
  const hit = langCache.get(String(userId));
  if (hit && Date.now() - hit.at < LANG_CACHE_MS) return Promise.resolve(hit.lang);
  return new Promise((resolve) => {
    db.get(`SELECT language FROM users WHERE id = ?`, [userId], (err, row) => {
      const lang = normalizeLang(row && row.language);
      if (!err) rememberUserLanguage(userId, lang);
      resolve(lang);
    });
  });
}

// ---- API response localization ------------------------------------------------------------

const patternRegexes = apiPatterns.map((p) => {
  const names = [];
  const src = p.en
    .replace(/[.*+?^$()|[\]\\]/g, "\\$&")
    .replace(/\\?\{(\w+)\\?\}/g, (m, n) => {
      names.push(n);
      return "(.+?)";
    });
  return { re: new RegExp(`^${src}$`), names, entry: p };
});

function localizeApiString(str, lang, isError) {
  const l = normalizeLang(lang);
  if (l === "en" || typeof str !== "string" || !str) return str;
  const exact = apiMessages[str] || apiMessages[str.trim()];
  if (exact && exact[l]) return exact[l];
  for (const { re, names, entry } of patternRegexes) {
    const m = str.match(re);
    if (m && entry[l]) {
      const params = {};
      names.forEach((n, i) => (params[n] = m[i + 1]));
      return interpolate(entry[l], params);
    }
  }
  // Unknown English error: never show English to a non-English athlete.
  if (isError && /^[A-Z][\x20-\x7E]*$/.test(str) && / /.test(str)) return messages.api.genericError[l];
  return str;
}

/**
 * Express middleware: localizes `error` / `message` fields of JSON responses into the
 * requester's language (the app's X-App-Language header = current UI language, else the
 * authenticated user's saved language, else Accept-Language). The original English text is kept in `error_en` / `message_en`
 * so client logic that inspects messages keeps working.
 */
function localizeResponses(req, res, next) {
  const originalJson = res.json.bind(res);
  res.json = (body) => {
    try {
      const lang = normalizeLang(
        req.headers["x-app-language"] ||
          (req.user && req.user.language) ||
          (req.headers["accept-language"] || "").split(",")[0]
      );
      if (lang !== "en" && body && typeof body === "object" && !Array.isArray(body)) {
        const isError = res.statusCode >= 400;
        if (typeof body.error === "string") {
          body = { ...body, error_en: body.error, error: localizeApiString(body.error, lang, true) };
        }
        if (typeof body.message === "string") {
          body = { ...body, message_en: body.message, message: localizeApiString(body.message, lang, isError) };
        }
      }
    } catch (e) {
      // never break a response because of localization
    }
    return originalJson(body);
  };
  next();
}

module.exports = {
  SUPPORTED,
  normalizeLang,
  languageName,
  languageDirective,
  t,
  sportNoun,
  sportLabel,
  phaseName,
  getUserLanguage,
  rememberUserLanguage,
  localizeApiString,
  localizeResponses,
};
