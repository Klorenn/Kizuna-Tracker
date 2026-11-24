const mods: Record<string, (c: any) => any> = {};
jest.mock("expo/config-plugins", () => ({
  withDangerousMod: (config: any, [platform, cb]: [string, (c: any) => any]) => ((mods[`dangerous:${platform}`] = cb), config),
  withSettingsGradle: (config: any, cb: (c: any) => any) => ((mods.settings = cb), config),
  withAppBuildGradle: (config: any, cb: (c: any) => any) => ((mods.app = cb), config),
}));
jest.mock("../plugins/widget-copy", () => ({ copyWidgetLibrary: jest.fn() }));

import { copyWidgetLibrary } from "../plugins/widget-copy";
import withKizunaWidget from "../plugins/with-kizuna-widget";

describe("with-kizuna-widget", () => {
  const config = { name: "Kizuna" };
  it("registers the three mods and returns the config", () => {
    expect(withKizunaWidget(config as never)).toBe(config);
    expect(Object.keys(mods).sort()).toEqual(["app", "dangerous:android", "settings"]);
  });
  it("patches settings.gradle and app/build.gradle contents", () => {
    withKizunaWidget(config as never);
    expect(mods.settings({ modResults: { contents: "include ':app'\n" } }).modResults.contents).toBe("include ':app'\ninclude ':widget'\n");
    const app = mods.app({ modResults: { contents: "dependencies {\n}\n" } }).modResults.contents;
    expect(app).toBe("dependencies {\n    implementation project(':widget')\n}\n");
  });
  it("a changed template makes the prebuild fail loudly instead of shipping without the widget", () => {
    withKizunaWidget(config as never);
    expect(() => mods.app({ modResults: { contents: "android {}\n" } })).toThrow(/anchor/);
  });
  it("copies ../android/widget into <platformProjectRoot>/widget", () => {
    withKizunaWidget(config as never);
    mods["dangerous:android"]({ modRequest: { projectRoot: "/repo/mobile", platformProjectRoot: "/repo/mobile/android" } });
    expect(copyWidgetLibrary).toHaveBeenCalledWith("/repo/android/widget", "/repo/mobile/android/widget");
  });
});
