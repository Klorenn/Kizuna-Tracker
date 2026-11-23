// Renders the Open Graph / Twitter card: node scripts/og/render.mjs [outDir]
// HTML template + real brand assets + the app's own Inter / Geist Mono files -> 1200x630 PNG.
// Output: src/app/opengraph-image.png and src/app/twitter-image.png (Next.js file conventions).
// Needs a system CJK font for the kanji in the label (Hiragino on macOS, Noto Sans CJK elsewhere).
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { chromium } from "@playwright/test";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../..");
const outDir = path.resolve(process.argv[2] ?? path.join(root, "src/app"));

const dataUri = async (file, mime) =>
  `data:${mime};base64,${(await readFile(file)).toString("base64")}`;

const assets = {
  __FONT_INTER__: await dataUri(path.join(here, "fonts/inter-latin-var.woff2"), "font/woff2"),
  __FONT_GEIST_MONO__: await dataUri(path.join(here, "fonts/geist-mono-latin-var.woff2"), "font/woff2"),
  __SEAL__: await dataUri(path.join(root, "src/app/icon.svg"), "image/svg+xml"),
};
const catSrc = await dataUri(path.join(root, "public/brand/cat-lift-still.png"), "image/png");

const browser = await chromium.launch();
try {
  // The still PNG has faint near-white noise around the cat that a plain luminance mask would paint.
  // Upscale 3x (smooth) and level it first (below 0.45 -> hole, above 0.8 -> solid, smooth in between). The app masks the
  // same PNG; this only cleans the edges for the larger render.
  const prep = await browser.newPage();
  assets.__CAT_MASK__ = await prep.evaluate(async (src) => {
    const img = new Image();
    img.src = src;
    await img.decode();
    const c = document.createElement("canvas");
    const S = 3;
    c.width = img.width * S;
    c.height = img.height * S;
    const ctx = c.getContext("2d");
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(img, 0, 0, c.width, c.height);
    const d = ctx.getImageData(0, 0, c.width, c.height);
    for (let i = 0; i < d.data.length; i += 4) {
      const lum = (0.2126 * d.data[i] + 0.7152 * d.data[i + 1] + 0.0722 * d.data[i + 2]) / 255;
      const t = Math.min(1, Math.max(0, (lum - 0.45) / (0.8 - 0.45)));
      const v = Math.round(t * t * (3 - 2 * t) * 255);
      d.data[i] = d.data[i + 1] = d.data[i + 2] = v;
      d.data[i + 3] = 255;
    }
    ctx.putImageData(d, 0, 0);
    return c.toDataURL("image/png");
  }, catSrc);
  await prep.close();

  let html = await readFile(path.join(here, "template.html"), "utf8");
  for (const [key, value] of Object.entries(assets)) html = html.replaceAll(key, value);

  const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
  await page.setContent(html, { waitUntil: "load" });
  await page.evaluate(() => document.fonts.ready);
  const png = await page.screenshot({ type: "png", clip: { x: 0, y: 0, width: 1200, height: 630 } });
  for (const name of ["opengraph-image.png", "twitter-image.png"]) {
    await writeFile(path.join(outDir, name), png);
    console.log(`${path.join(outDir, name)} ${(png.length / 1024).toFixed(0)} kB`);
  }
} finally {
  await browser.close();
}
