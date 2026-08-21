/**
 * Renders the user manual (`public/manual.html`) to a PDF.
 *
 * ⚠️ Three things about this script changed on 2026-08-21, each of which used to make it produce a
 * wrong result — or an actively harmful one:
 *
 * 1. **It read the wrong source.** It rendered `docs/manual/user-manual.html`, SUPERSEDED since
 *    2026-08-07 — the live manual is `public/manual.html`. Running it produced a PDF missing every
 *    module added since (Service, Accounting, Project, Production, Stock, Departments). That file
 *    and its `docs/manual/images/` folder were deleted the same day, so the wrong source no longer
 *    exists to be pointed back at.
 *
 * 2. **It wrote into `public/`.** The old output path was `public/คู่มือการใช้งาน TCS ERP.pdf`, a
 *    file deliberately moved OUT of that directory by commit c2f91b5 ("Move real customer/company
 *    documents out of public/ — data-exposure fix") — it now lives, gitignored, at
 *    `reference/company/คู่มือการใช้งาน TCS ERP.pdf`. Everything under `public/` is served with NO
 *    authentication, so regenerating a PDF full of real customer names and amounts back into that
 *    directory would have silently undone that fix. Output now defaults to `dist-manual/` and
 *    writing anywhere under `public/` is refused outright.
 *
 * 3. **It loaded the page over `file://`.** The manual references its screenshots with absolute
 *    paths (`/manual-images/…`), which under `file://` resolve to the filesystem root — so every
 *    figure came out blank. The page is now loaded over HTTP from the running app instead.
 *
 * Usage (from the repo root, with `npm run dev` running — Vite serves `public/` on :3000):
 *   npm install --no-save puppeteer-core   # not a devDependency on purpose — only needed here
 *   node docs/manual/generate-pdf.mjs [outputPath] [--url <address>]
 *
 * Use `npm run dev`, not `npm start`. `npm start` listens on **:3001** (`server/index.ts`) and
 * serves the *built* `dist/`, so it needs `--url http://localhost:3001/manual.html` AND a fresh
 * `npm run build` — otherwise it renders whatever copy of the manual the last build froze, which is
 * bug 1 below all over again. `npm run dev` serves `public/manual.html` itself, so it is always the
 * file you just edited.
 *
 * Uses the system Chrome (no browser download). The page is self-contained apart from those
 * screenshots (system font stack, no external requests) and its @media print block swaps the dark
 * reading theme back to light, so the PDF prints on white.
 */
import puppeteer from "puppeteer-core";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve, sep } from "node:path";
import { existsSync, mkdirSync } from "node:fs";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, "..", "..");

const argv = process.argv.slice(2);
let pageUrl = "http://localhost:3000/manual.html";
const positional = [];
for (let i = 0; i < argv.length; i++) {
  if (argv[i] !== "--url") {
    positional.push(argv[i]);
    continue;
  }
  pageUrl = argv[++i];
  if (!pageUrl) throw new Error("--url needs an address, e.g. --url http://localhost:3001/manual.html");
}

// Default output stays OUT of public/ — see note 2 above.
const outPath = resolve(positional[0] || join(repoRoot, "dist-manual", "คู่มือการใช้งาน TCS ERP.pdf"));
const publicDir = resolve(join(repoRoot, "public"));
// Case-fold on Windows: `PUBLIC\x.pdf` and `public\x.pdf` are the same directory there, so a
// case-sensitive compare would wave the second spelling straight past this guard.
const fold = (p) => (process.platform === "win32" ? p.toLowerCase() : p);
if (fold(outPath) === fold(publicDir) || fold(outPath).startsWith(fold(publicDir) + sep)) {
  throw new Error(
    "refusing to write the manual PDF into public/ — that directory is served without authentication, " +
      "and the previous PDF was removed from it as a data-exposure fix (commit c2f91b5).",
  );
}
mkdirSync(dirname(outPath), { recursive: true });

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
  let res;
  try {
    res = await page.goto(pageUrl, { waitUntil: "networkidle0", timeout: 120_000 });
  } catch (err) {
    throw new Error(
      `could not load ${pageUrl} — is the app running? Start it with \`npm run dev\` (or pass ` +
        `--url <address>). Original error: ${err.message}`,
    );
  }
  if (!res || !res.ok()) throw new Error(`${pageUrl} returned ${res ? res.status() : "no response"}`);

  await page.evaluate(() => document.fonts.ready);

  // The figures are `loading="lazy"`, so the ones below the fold have not been fetched at
  // networkidle0 and would print blank. Force them all eager and wait for each to settle.
  await page.evaluate(async () => {
    const imgs = [...document.images];
    for (const img of imgs) {
      img.loading = "eager";
      if (!img.complete) img.src = img.src; // nudge a lazy image into fetching now
    }
    await Promise.all(
      imgs.map(
        (img) =>
          new Promise((resolve) => {
            if (img.complete) return resolve();
            img.addEventListener("load", resolve, { once: true });
            img.addEventListener("error", resolve, { once: true });
            setTimeout(resolve, 15_000); // never hang the build on one stuck image
          }),
      ),
    );
  });

  // Fail loudly rather than shipping a PDF with blank figures.
  const brokenImages = await page.evaluate(() =>
    [...document.images].filter((img) => !img.complete || img.naturalWidth === 0).map((img) => img.getAttribute("src")),
  );
  if (brokenImages.length) throw new Error(`images failed to load:\n  ${brokenImages.join("\n  ")}`);

  await page.pdf({
    path: outPath,
    format: "A4",
    printBackground: true,
    margin: { top: "16mm", right: "14mm", bottom: "16mm", left: "14mm" },
  });
  console.log("PDF written:", outPath);
  console.log("NOTE: this PDF contains real customer data — do not copy it into public/.");
} finally {
  await browser.close();
}
