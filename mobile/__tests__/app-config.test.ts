import config from "../app.config";

const expo = config({ config: {} } as never);

describe("app.config", () => {
  it("keeps the TWA identity so the APK installs as an update over it", () => {
    expect(expo.android?.package).toBe("com.kizunatracker.app");
    // 1.1.0 / versionCode 4 is already published: bump by patch only
    expect(expo.android?.versionCode).toBe(5);
    expect(expo.version).toBe("1.1.1");
  });
  it("registers the kizuna:// scheme and a VIEW intent filter for it, with no https filter", () => {
    expect(expo.scheme).toBe("kizuna");
    const filters = expo.android?.intentFilters ?? [];
    expect(filters).toHaveLength(1);
    expect(filters[0].action).toBe("VIEW");
    // host "app": the widget's kizuna://widget/pair activity must be the ONLY match for its link (no chooser)
    expect(filters[0].data).toEqual([{ scheme: "kizuna", host: "app" }]);
    expect(JSON.stringify(filters)).not.toContain("https");
    expect(JSON.stringify(filters)).not.toContain("autoVerify");
  });
  it("registers the expo-notifications plugin with the monochrome small icon", () => {
    const entry = (expo.plugins as unknown[]).find((p) => Array.isArray(p) && p[0] === "expo-notifications") as [string, Record<string, unknown>] | undefined;
    expect(entry?.[1]).toMatchObject({ icon: "./assets/android-icon-monochrome.png" });
  });
  it("uses the fingerprint runtime policy and the router plugin", () => {
    expect(expo.runtimeVersion).toEqual({ policy: "fingerprint" });
    expect(expo.plugins).toContain("expo-router");
    expect(expo.plugins).toContain("expo-secure-store");
    expect(expo.plugins).toContain("./plugins/with-kizuna-widget");
  });
  it("declares the camera permission for the proof photos, with Spanish copy, and nothing for the gallery", () => {
    const entry = (expo.plugins as unknown[]).find((p) => Array.isArray(p) && p[0] === "expo-image-picker") as [string, Record<string, unknown>] | undefined;
    expect(entry).toBeTruthy();
    expect(entry![1].cameraPermission).toMatch(/cámara/);
    expect(entry![1].photosPermission).toBe(false);
    expect(entry![1].microphonePermission).toBe(false);
  });
  it("reads secrets from the environment, never from the file", () => {
    const prev = process.env.GOOGLE_SERVICES_JSON;
    process.env.GOOGLE_SERVICES_JSON = "./google-services.json";
    try {
      expect(config({ config: {} } as never).android?.googleServicesFile).toBe("./google-services.json");
    } finally {
      if (prev === undefined) delete process.env.GOOGLE_SERVICES_JSON;
      else process.env.GOOGLE_SERVICES_JSON = prev;
    }
  });
});
