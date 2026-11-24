import type { ConfigContext, ExpoConfig } from "expo/config";

/**
 * Kizuna native app. The identity (package, versionCode >= 4, release keystore) is the TWA's, so the APK installs as an
 * update over it. versionCode is bumped by hand (eas.json: appVersionSource "local"). Secrets and ids come from the
 * environment (EAS file/env vars), never from this file.
 */
// Public id of @kl0ren/kizuna on EAS (not a secret); EAS_PROJECT_ID env overrides it.
const EAS_PROJECT_ID = "771483b4-e9ea-4113-90b0-ad3b15473879";

/**
 * `APP_VARIANT=dev` builds "Kizuna Dev": another package and scheme, so it installs next to the production app.
 * Everything else (updates url, projectId, version) is shared.
 */
const IS_DEV = process.env.APP_VARIANT === "dev";
const SCHEME = IS_DEV ? "kizuna-dev" : "kizuna";

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: IS_DEV ? "Kizuna Dev" : "Kizuna",
  slug: "kizuna",
  version: "1.1.2",
  scheme: SCHEME,
  orientation: "portrait",
  icon: "./assets/icon.png",
  userInterfaceStyle: "automatic",
  // appVersion, not fingerprint: the fingerprint depends on EAS-only env (google-services) and never matches locally.
  runtimeVersion: { policy: "appVersion" },
  updates: { url: process.env.EAS_UPDATES_URL ?? `https://u.expo.dev/${EAS_PROJECT_ID}` },
  android: {
    package: IS_DEV ? "com.kizunatracker.app.dev" : "com.kizunatracker.app",
    versionCode: 8,
    adaptiveIcon: {
      backgroundColor: "#FAFAFA",
      foregroundImage: "./assets/android-icon-foreground.png",
      backgroundImage: "./assets/android-icon-background.png",
      monochromeImage: "./assets/android-icon-monochrome.png",
    },
    googleServicesFile: process.env.GOOGLE_SERVICES_JSON,
    // kizuna://app only. The widget owns kizuna://widget/pair (its own activity): with a bare scheme both would match and Android
    // would show a chooser. No https filter and no autoVerify: https links stay with the TWA/browser during the transition.
    intentFilters: [{ action: "VIEW", category: ["BROWSABLE", "DEFAULT"], data: [{ scheme: SCHEME, host: "app" }] }],
  },
  plugins: [
    "expo-router",
    "expo-secure-store",
    // pushes: the small status-bar icon must be monochrome; the channel and the permission are handled in code
    ["expo-notifications", { icon: "./assets/android-icon-monochrome.png", color: "#5a5ac2" }],
    "./plugins/with-kizuna-widget",
    // the camera only (proof photos): no gallery, no microphone
    ["expo-image-picker", { cameraPermission: "Kizuna usa la cámara para tus fotos de prueba.", photosPermission: false, microphonePermission: false }],
  ],
  extra: { eas: { projectId: process.env.EAS_PROJECT_ID ?? EAS_PROJECT_ID } },
});
