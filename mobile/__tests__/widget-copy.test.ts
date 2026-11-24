import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { copyWidgetLibrary } from "../plugins/widget-copy";

function tmp(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "kz-widget-"));
}

describe("copyWidgetLibrary", () => {
  it("copies the library recursively and skips build outputs", () => {
    const root = tmp();
    const src = path.join(root, "android", "widget");
    fs.mkdirSync(path.join(src, "src/main/java"), { recursive: true });
    fs.mkdirSync(path.join(src, "build/outputs"), { recursive: true });
    fs.writeFileSync(path.join(src, "build.gradle"), "plugins {}");
    fs.writeFileSync(path.join(src, "src/main/java/A.java"), "class A {}");
    fs.writeFileSync(path.join(src, "build/outputs/x.apk"), "binary");
    const dest = path.join(root, "out", "widget");
    copyWidgetLibrary(src, dest);
    expect(fs.readFileSync(path.join(dest, "build.gradle"), "utf8")).toBe("plugins {}");
    expect(fs.readFileSync(path.join(dest, "src/main/java/A.java"), "utf8")).toBe("class A {}");
    expect(fs.existsSync(path.join(dest, "build"))).toBe(false);
  });
  it("replaces a previous copy so deleted files do not linger", () => {
    const root = tmp();
    const src = path.join(root, "w");
    fs.mkdirSync(src);
    fs.writeFileSync(path.join(src, "keep.txt"), "1");
    const dest = path.join(root, "dest");
    fs.mkdirSync(dest);
    fs.writeFileSync(path.join(dest, "stale.txt"), "old");
    copyWidgetLibrary(src, dest);
    expect(fs.readdirSync(dest)).toEqual(["keep.txt"]);
  });
  it("throws a clear error when the source library is missing (EAS must upload the git root)", () => {
    expect(() => copyWidgetLibrary(path.join(tmp(), "nope"), path.join(tmp(), "dest"))).toThrow(/android\/widget not found/);
  });
});
