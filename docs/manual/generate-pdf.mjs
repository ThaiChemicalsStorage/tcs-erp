/**
 * Regenerates `public/คู่มือการใช้งาน TCS ERP.pdf` from `user-manual.html` (added 2026-07-29 —
 * previously this was an ad-hoc throwaway script each time; committed so the go-live checklist's
 * mandatory "update the user manual" step G has a one-command path).
 *
 * Usage (from the repo root):
 *   npm install --no-save puppeteer-core   # not a devDependency on purpose — only needed here
 *   node docs/manual/generate-pdf.mjs
 *
 * Uses the system Chrome (no browser download). Waits for Google Fonts before printing.
 */
import puppeteer from "puppeteer-core";
import { pathToFileURL, fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { existsSync } from "node:fs";

const here = dirname(fileURLToPath(import.meta.url));
const htmlPath = join(here, "user-manual.html");
const outPath = join(here, "..", "..", "public", "คู่มือการใช้งาน TCS ERP.pdf");

const chromeCandidates = [
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
  "/usr/bin/google-chrome",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
];
const executablePath = chromeCandidates.find((p) => existsSync(p));
if (!executablePath) throw new Error("No system Chrome found — edit chromeCandidates in this script.");

const browser = await puppeteer.launch({ executablePath, headless: true });
try {
  const page = await browser.newPage();
  await page.goto(pathToFileURL(htmlPath).href, { waitUntil: "networkidle0", timeout: 120_000 });
  await page.evaluate(() => document.fonts.ready);
  await page.pdf({ path: outPath, preferCSSPageSize: true, printBackground: true });
  console.log("PDF written:", outPath);
} finally {
  await browser.close();
}
