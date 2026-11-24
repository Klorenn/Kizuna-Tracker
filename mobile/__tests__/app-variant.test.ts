import config from "../app.config";
import easJson from "../eas.json";

function withVariant<T>(variant: string | undefined, fn: () => T): T {
  const prev = process.env.APP_VARIANT;
  if (variant === undefined) delete process.env.APP_VARIANT;
  else process.env.APP_VARIANT = variant;
  try {
    return fn();
  } finally {
    if (prev === undefined) delete process.env.APP_VARIANT;
    else process.env.APP_VARIANT = prev;
  }
}
const build = () => config({ config: {} } as never);
// app.config reads the variant at module load, so each case loads it fresh
const load = (variant: string | undefined) =>
  withVariant(variant, () => {
    let expo!: ReturnType<typeof build>;
    jest.isolateModules(() => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      expo = (require("../app.config").default as typeof config)({ config: {} } as never);
    });
    return expo;
  });

describe("APP_VARIANT=dev", () => {
  const dev = load("dev");
  const prod = load(undefined);

  it("is Kizuna Dev with its own package and scheme, side by side with production", () => {
    expect(dev.name).toBe("Kizuna Dev");
    expect(dev.android?.package).toBe("com.kizunatracker.app.dev");
    expect(dev.scheme).toBe("kizuna-dev");
    expect(dev.android?.intentFilters?.[0].data).toEqual([{ scheme: "kizuna-dev", host: "app" }]);
  });
  it("keeps production untouched", () => {
    expect(prod.name).toBe("Kizuna");
    expect(prod.android?.package).toBe("com.kizunatracker.app");
    expect(prod.scheme).toBe("kizuna");
    expect(load("prod").android?.package).toBe("com.kizunatracker.app");
  });
  it("shares everything else, including the updates url and the project id", () => {
    expect(dev.updates).toEqual(prod.updates);
    expect(dev.extra).toEqual(prod.extra);
    expect(dev.version).toBe(prod.version);
    expect(dev.android?.versionCode).toBe(prod.android?.versionCode);
    expect(dev.plugins).toEqual(prod.plugins);
  });
  it("has a dev-preview EAS profile with remote credentials (never the prod keystore)", () => {
    const p = easJson.build["dev-preview"] as Record<string, unknown>;
    expect(p.extends).toBe("preview");
    expect(p.distribution).toBe("internal");
    expect(p.credentialsSource).toBe("remote");
    expect(p.android).toEqual({ buildType: "apk" });
    expect(p.env).toEqual({ APP_VARIANT: "dev" });
  });
});
