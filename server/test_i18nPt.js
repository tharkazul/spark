// European Portuguese (pt-PT) on the server: every message, API string and pattern has a
// Portuguese text with the same {placeholders} as the English one, and pt is a supported language.
const assert = require("assert");
const { messages, apiMessages, apiPatterns } = require("./locales/serverMessages");
const i18n = require("./services/i18n");

const placeholders = (s) => (String(s).match(/\{\w+\}/g) || []).sort().join(",");
const problems = [];

const walk = (o, path) => {
  for (const [k, v] of Object.entries(o)) {
    const p = path ? `${path}.${k}` : k;
    if (v && typeof v === "object" && "en" in v) {
      if (!v.pt) problems.push(`messages.${p}: no pt`);
      else if (placeholders(v.en) !== placeholders(v.pt)) problems.push(`messages.${p}: placeholders differ`);
    } else if (v && typeof v === "object") walk(v, p);
  }
};
walk(messages, "");
for (const [en, tr] of Object.entries(apiMessages)) if (!tr.pt) problems.push(`api "${en}": no pt`);
for (const p of apiPatterns) {
  if (!p.pt) problems.push(`pattern "${p.en}": no pt`);
  else if (placeholders(p.en) !== placeholders(p.pt)) problems.push(`pattern "${p.en}": placeholders differ`);
}
assert.deepStrictEqual(problems, [], problems.join("\n"));

assert.strictEqual(i18n.normalizeLang("pt"), "pt");
assert.strictEqual(i18n.normalizeLang("pt-PT"), "pt");
assert.strictEqual(i18n.t("pt", "push.spark.title"), "Novo spark!");
assert.strictEqual(i18n.t("pt", "push.spark.body", { name: "Ana", activity: "Corrida" }), "Ana enviou-te um spark em Corrida!");
assert.match(i18n.languageDirective("pt"), /European Portuguese/);
assert.ok(/[a-z]/.test(i18n.t("pt", "api.genericError")), "generic error exists in pt");
assert.ok(!/Rooka/.test(JSON.stringify(require("./locales/serverMessages.pt"))), "rooka stays lowercase");

console.log("✅ Server pt-PT: every message, API string and pattern translated, placeholders intact");
