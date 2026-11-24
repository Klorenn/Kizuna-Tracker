import type { ConfigContext, ExpoConfig } from "expo/config";

/**
 * Kizuna native app. The identity (package, versionCode >= 4, release keystore) is the TWA's, so the APK installs as an
 * update over it. versionCode is bumped by hand (eas.json: appVersionSource "local"). Secrets and ids come from the
 * environment (EAS file/env vars), never from this file.
 */
// Public id of @kl0ren/kizuna on EAS (not a secret); EAS_PROJECT_ID env overrides it.
const EAS_PROJECT_ID = "771483b4-e9ea-4113-90b0-ad3b15473879";

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: "Kizuna",
  slug: "kizuna",
  version: "1.1.0",
  scheme: "kizuna",
  orientation: "portrait",
  icon: "./assets/icon.png",
  userInterfaceStyle: "automatic",
  runtimeVersion: { policy: "fingerprint" },
  updates: { url: process.env.EAS_UPDATES_URL ?? `https://u.expo.dev/${EAS_PROJECT_ID}` },
  android: {
    package: "com.kizunatracker.app",
    versionCode: 4,
    adaptiveIcon: {
      backgroundColor: "#FAFAFA",
      foregroundImage: "./assets/android-icon-foreground.png",
      backgroundImage: "./assets/android-icon-background.png",
      monochromeImage: "./assets/android-icon-monochrome.png",
    },
    googleServicesFile: process.env.GOOGLE_SERVICES_JSON,
    // kizuna:// only. No https filter and no autoVerify: https links stay with the TWA/browser during the transition.
    intentFilters: [{ action: "VIEW", category: ["BROWSABLE", "DEFAULT"], data: [{ scheme: "kizuna" }] }],
  },
  plugins: ["expo-router", "expo-secure-store", "./plugins/with-kizuna-widget"],
  extra: { eas: { projectId: process.env.EAS_PROJECT_ID ?? EAS_PROJECT_ID } },
});
