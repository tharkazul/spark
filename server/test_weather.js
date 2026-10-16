// Weather service: budget steps, condition mapping, WeatherKit token. Throwaway key and database.
const path = require("path");
const os = require("os");
const fs = require("fs");
const crypto = require("crypto");
process.env.DB_PATH = path.join(os.tmpdir(), `rooka_weather_test_${process.pid}.db`);
const keyPath = path.join(os.tmpdir(), `rooka_weather_test_${process.pid}.p8`);
const { privateKey, publicKey } = crypto.generateKeyPairSync("ec", { namedCurve: "P-256" });
fs.writeFileSync(keyPath, privateKey.export({ type: "pkcs8", format: "pem" }));
Object.assign(process.env, { WEATHERKIT_TEAM_ID: "TEAM123456", WEATHERKIT_KEY_ID: "KEY1234567", WEATHERKIT_SERVICE_ID: "io.rooka.app", WEATHERKIT_KEY_PATH: keyPath });

const assert = require("assert");
const w = require("./services/weather");

console.log("🌦️  Running weather unit tests...\n");

{
  const H = 3600 * 1000;
  assert.strictEqual(w.freshForMs(0.1), 3 * H);
  assert.strictEqual(w.freshForMs(0.75), 6 * H);
  assert.strictEqual(w.freshForMs(0.95), 12 * H);
  assert.strictEqual(w.freshForMs(1), Infinity);
  console.log("✅ Refresh slows down as the monthly quota fills");
}
{
  assert.strictEqual(w.conditionFromWeatherKit("PartlyCloudy"), "partly_cloudy");
  assert.strictEqual(w.conditionFromWeatherKit("HeavyRain"), "rain");
  assert.strictEqual(w.conditionFromWeatherKit("ScatteredThunderstorms"), "thunder");
  assert.strictEqual(w.conditionFromWeatherKit("MostlyCloudy"), "cloudy");
  assert.strictEqual(w.conditionFromWeatherKit("Windy"), "wind");
  assert.strictEqual(w.conditionFromWmo(61), "rain");
  assert.strictEqual(w.conditionFromWmo(2), "partly_cloudy");
  console.log("✅ Condition codes map to the app's icons");
}
{
  const cfg = w.weatherKitConfig();
  assert.ok(cfg, "credentials are read from the environment");
  const [h, p, sig] = w.weatherKitToken(cfg).split(".");
  const header = JSON.parse(Buffer.from(h, "base64url"));
  const payload = JSON.parse(Buffer.from(p, "base64url"));
  assert.deepStrictEqual(header, { alg: "ES256", kid: "KEY1234567", id: "TEAM123456.io.rooka.app" });
  assert.strictEqual(payload.iss, "TEAM123456");
  assert.strictEqual(payload.sub, "io.rooka.app");
  assert.strictEqual(payload.exp - payload.iat, 3600);
  const ok = crypto.verify("sha256", Buffer.from(`${h}.${p}`), { key: publicKey, dsaEncoding: "ieee-p1363" }, Buffer.from(sig, "base64url"));
  assert.ok(ok, "ES256 signature verifies");
  console.log("✅ WeatherKit token is a valid ES256 JWT");
}

console.log("\n🎉 All weather tests passed!");
setTimeout(() => {
  for (const f of [process.env.DB_PATH, keyPath]) try { fs.unlinkSync(f); } catch (_) {}
  process.exit(0);
}, 200);
