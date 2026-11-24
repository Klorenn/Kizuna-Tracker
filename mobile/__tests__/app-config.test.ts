import config from "../app.config";

const expo = config({ config: {} } as never);

describe("app.config", () => {
  it("keeps the TWA identity so the APK installs as an update over it", () => {
    expect(expo.android?.package).toBe("com.kizunatracker.app");
    expect(expo.android?.versionCode).toBe(4);
    expect(expo.version).toBe("1.1.0");
  });
  it("registers the kizuna:// scheme and a VIEW intent filter for it, with no https filter", () => {
    expect(expo.scheme).toBe("kizuna");
    const filters = expo.android?.intentFilters ?? [];
    expect(filters).toHaveLength(1);
    expect(filters[0].action).toBe("VIEW");
    expect(filters[0].data).toEqual([{ scheme: "kizuna" }]);
    expect(JSON.stringify(filters)).not.toContain("https");
    expect(JSON.stringify(filters)).not.toContain("autoVerify");
  });
  it("uses the fingerprint runtime policy and the router plugin", () => {
    expect(expo.runtimeVersion).toEqual({ policy: "fingerprint" });
    expect(expo.plugins).toContain("expo-router");
    expect(expo.plugins).toContain("expo-secure-store");
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
