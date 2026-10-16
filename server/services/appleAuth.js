const { createRemoteJWKSet, jwtVerify } = require("jose");

const APPLE_ISSUER = "https://appleid.apple.com";

// Apple rotates its signing keys; jose fetches and caches the set and refetches
// when a token carries an unknown kid.
const appleJwks = createRemoteJWKSet(new URL("https://appleid.apple.com/auth/keys"));

// The iOS app's bundle id (app.json expo.ios.bundleIdentifier). Native Sign in
// with Apple tokens carry it as `aud`. APPLE_BUNDLE_IDS (comma-separated)
// overrides it, e.g. to also accept a web Services ID.
function allowedAudiences() {
  const fromEnv = (process.env.APPLE_BUNDLE_IDS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return fromEnv.length > 0 ? fromEnv : ["io.rooka.app"];
}

/**
 * Verifies an Apple identityToken's signature against Apple's JWKS and checks
 * iss, aud and exp. Returns the payload; throws if anything does not check out.
 */
async function verifyAppleIdentityToken(identityToken, { jwks = appleJwks } = {}) {
  const { payload } = await jwtVerify(identityToken, jwks, {
    issuer: APPLE_ISSUER,
    audience: allowedAudiences(),
    algorithms: ["RS256"],
    clockTolerance: 60,
  });
  if (!payload.sub) throw new Error("Apple token has no subject");
  return payload;
}

module.exports = { verifyAppleIdentityToken };
