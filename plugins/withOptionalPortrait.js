// orientation: "portrait" makes Play infer a *required* android.hardware.screen.portrait
// feature, which hides the app from devices without one (some Chromebooks, Android XR).
// Declaring it optional keeps the portrait lock but restores availability.
const { withAndroidManifest } = require('expo/config-plugins');

const FEATURE = 'android.hardware.screen.portrait';

module.exports = function withOptionalPortrait(config) {
  return withAndroidManifest(config, (cfg) => {
    const manifest = cfg.modResults.manifest;
    manifest['uses-feature'] = (manifest['uses-feature'] || []).filter(
      (f) => f.$['android:name'] !== FEATURE
    );
    manifest['uses-feature'].push({
      $: { 'android:name': FEATURE, 'android:required': 'false' },
    });
    return cfg;
  });
};
