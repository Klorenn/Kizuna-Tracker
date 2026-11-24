const path = require("node:path");
const { withAppBuildGradle, withDangerousMod, withSettingsGradle } = require("expo/config-plugins");
const { patchAppGradle, patchSettings } = require("./widget-patch");
const { copyWidgetLibrary } = require("./widget-copy");

/**
 * Links the repo's android/widget library (the home-screen widget) into the Expo prebuild project, so the native app
 * keeps the widget the TWA had: same package, same prefs and Keystore alias. EAS uploads the git root, so ../android/widget exists.
 */
module.exports = function withKizunaWidget(config) {
  config = withDangerousMod(config, [
    "android",
    (c) => {
      copyWidgetLibrary(path.resolve(c.modRequest.projectRoot, "..", "android", "widget"), path.join(c.modRequest.platformProjectRoot, "widget"));
      return c;
    },
  ]);
  config = withSettingsGradle(config, (c) => {
    c.modResults.contents = patchSettings(c.modResults.contents);
    return c;
  });
  config = withAppBuildGradle(config, (c) => {
    c.modResults.contents = patchAppGradle(c.modResults.contents);
    return c;
  });
  return config;
};
