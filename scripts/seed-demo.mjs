/**
 * seed-demo.mjs — fills a SEPARATE demo database with a tidy, fictional Thai B2B dataset for the
 * user-manual screenshots (public/manual-images/, shot list docs/manual/figures.json).
 *
 * What it does
 *   1. Refuses to run unless MONGODB_DB ends in "_demo" AND MONGODB_URI points at that same
 *      database (so it can never touch the dev database tcs_erp or production).
 *   2. DROPS that demo database and starts the real Express app (server/app.ts) in-process on a
 *      random local port — .env is NOT read, nothing listens on :3000/:3001/:3200.
 *   3. Replays about a year of company life (Oct 2568 → today) through the real REST API, logged in
 *      as fictional employees: setup wizard, company settings, departments/teams/roles/users,
 *      catalog + opening stock, vendors, code register, customers, quotations in every status,
 *      Scope of Work, delivery orders, AR billing, service reports, projects, MR/JO/PR, production
 *      orders, POs, receiving + AP, vendor bills, store documents, tools, product requests, Cost
 *      Control, password-reset requests. Numbers, totals, workflow states, audit entries and stock
 *      movements are therefore all produced by the app itself.
 *      Back-dating works by shifting this process's clock (Date) to each event's simulated time —
 *      no direct database writes are made.
 *   4. Prints the document counts per collection.
 *
 * The timeline dates are fixed (Oct 2025 → 1 Oct 2026); events later than the real clock run at "now".
 * Every person and company in here is fictional. Demo login: admin / Demo@2026 (all demo users share
 * that password; store02 is left with a temporary password on purpose — figure ch01-3).
 *
 * Run from the repo root (tsx is needed because it imports server/app.ts):
 *   bash:        MONGODB_URI=mongodb://localhost:27017/tcs_erp_demo MONGODB_DB=tcs_erp_demo npx tsx scripts/seed-demo.mjs
 *   PowerShell:  $env:MONGODB_URI="mongodb://localhost:27017/tcs_erp_demo"; $env:MONGODB_DB="tcs_erp_demo"; npx tsx scripts/seed-demo.mjs
 * Optional: SEED_OUT=<file.json> writes a few ids the screenshot scripts need (temporary password,
 * customer-approval link).
 * Then view it with:  PORT=3200 MONGODB_URI=… MONGODB_DB=tcs_erp_demo npx tsx server/index.ts  (after npx vite build)
 * (MONGODB_DB matters: api/_lib/mongodb.ts picks the database by MONGODB_DB, not by the URI path.)
 */
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createRequire } from "node:module";

// ── guard, simulated clock, in-process app, API client, scheduler ──
// Core: guard, fake clock, in-process app, API client, scheduler.

const PASSWORD = "Demo@2026";

const RealDate = Date;
let OFFSET = 0;
class FakeDate extends RealDate {
  constructor(...a) { if (a.length) super(...a); else super(RealDate.now() + OFFSET); }
  static now() { return RealDate.now() + OFFSET; }
}
globalThis.Date = FakeDate;
const realNow = () => RealDate.now();

/** Simulated Bangkok wall clock "YYYY-MM-DD HH:mm"; null = the real now. Never moves past the real now. */
function setClock(bkk) {
  if (!bkk) { OFFSET = 0; return; }
  const [d, t = "10:00"] = bkk.split(" ");
  const target = RealDate.parse(`${d}T${t}:00+07:00`);
  OFFSET = Math.min(0, target - RealDate.now());
}

function assertDemoTarget() {
  const uri = process.env.MONGODB_URI || "";
  const db = process.env.MONGODB_DB || "";
  const uriDb = (uri.split("?")[0].split("/")[3] || "");
  if (!/_demo$/.test(db) || uriDb !== db) {
    console.error(`REFUSING TO RUN: MONGODB_DB (${db || "unset"}) must end in "_demo" and MONGODB_URI must point at that same database (got "${uriDb || "none"}").`);
    process.exit(2);
  }
  return db;
}

let baseUrl = "";
async function startApp(repoRoot) {
  if (!process.env.JWT_SECRET) process.env.JWT_SECRET = "seed-demo-" + Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
  process.env.LINE_CHANNEL_ACCESS_TOKEN = "";
  process.env.LINE_CHANNEL_SECRET = "";
  const { createApp } = await import(pathToFileURL(path.join(repoRoot, "server", "app.ts")).href);
  const app = createApp();
  await new Promise((resolve) => {
    const s = app.listen(0, "127.0.0.1", () => { baseUrl = `http://127.0.0.1:${s.address().port}`; resolve(); });
  });
  return baseUrl;
}

const cookies = new Map();
async function login(username, password = PASSWORD) {
  const res = await fetch(`${baseUrl}/api/auth/login`, {
    method: "POST", headers: { "content-type": "application/json", "user-agent": "seed-demo" },
    body: JSON.stringify({ identifier: username, password }),
  });
  if (!res.ok) throw new Error(`login ${username} -> ${res.status} ${await res.text()}`);
  cookies.set(username, (res.headers.get("set-cookie") || "").split(";")[0]);
  return (await res.json()).user;
}
function setCookie(username, setCookieHeader) { cookies.set(username, setCookieHeader.split(";")[0]); }

async function raw(method, p, body, headers = {}) {
  const res = await fetch(`${baseUrl}/api${p}`, {
    method, headers: { "content-type": "application/json", ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let data; try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  return { status: res.status, data, headers: res.headers };
}

/** api("admin", "POST", "/quotes", body) — throws on non-2xx unless the status is in opts.allow. */
async function api(user, method, p, body, opts = {}) {
  for (let attempt = 0; attempt < 6; attempt++) {
    if (!cookies.has(user)) await login(user);
    const res = await fetch(`${baseUrl}/api${p}`, {
      method, headers: { "content-type": "application/json", cookie: cookies.get(user), "user-agent": "seed-demo" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const sc = res.headers.get("set-cookie");
    if (sc && sc.startsWith("tcs_erp_session=") && !sc.startsWith("tcs_erp_session=;")) cookies.set(user, sc.split(";")[0]);
    if (res.status === 401 && attempt < 5) { cookies.delete(user); continue; }
    const text = await res.text();
    let data; try { data = text ? JSON.parse(text) : null; } catch { data = text; }
    if (!res.ok && !(opts.allow || []).includes(res.status)) {
      throw new Error(`${user} ${method} ${p} -> ${res.status} ${typeof data === "string" ? data : JSON.stringify(data)}`.slice(0, 2000));
    }
    return data;
  }
}
const enc = encodeURIComponent;

// ── scheduler: events run in simulated-time order ──
const events = [];
let seq = 0;
function at(when, label, fn) { events.push({ when, label, fn, seq: seq++ }); }
function addDays(ymd, n) {
  const d = new RealDate(`${ymd}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
async function runSchedule() {
  events.sort((a, b) => (a.when < b.when ? -1 : a.when > b.when ? 1 : a.seq - b.seq));
  for (const e of events) {
    setClock(e.when === "NOW" ? null : e.when);
    try { await e.fn(); }
    catch (err) { console.error(`\n✖ ${e.when} ${e.label}\n`, err.message); throw err; }
  }
  setClock(null);
}

const C = { PASSWORD, realNow, setClock, assertDemoTarget, startApp, login, setCookie, raw, api, enc, at, addDays, runSchedule };

// ── generated demo images / files ──
// Generated demo images/files (no real people, no real documents).

function makeAssets(repoRoot) {
  const require = createRequire(path.join(repoRoot, "package.json"));
  const sharp = require("sharp");

  const toWebpDataUrl = async (input, { width, quality = 82 } = {}) => {
    let img = sharp(input);
    if (width) img = img.resize({ width, withoutEnlargement: true });
    const buf = await img.webp({ quality }).toBuffer();
    return "data:image/webp;base64," + buf.toString("base64");
  };
  const svg = (s) => Buffer.from(s);

  async function logo() {
    return toWebpDataUrl(fs.readFileSync(path.join(repoRoot, "public", "logo.png")), { width: 360 });
  }

  async function stamp() {
    const s = `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="320">
      <defs><path id="c" d="M160,160 m-118,0 a118,118 0 1,1 236,0 a118,118 0 1,1 -236,0"/></defs>
      <circle cx="160" cy="160" r="150" fill="none" stroke="#1d3f9a" stroke-width="8"/>
      <circle cx="160" cy="160" r="96" fill="none" stroke="#1d3f9a" stroke-width="4"/>
      <text font-family="Tahoma, Leelawadee UI, sans-serif" font-size="25" fill="#1d3f9a" font-weight="bold" letter-spacing="1">
        <textPath href="#c" startOffset="2%">บริษัท ไทย เคมิคอลส์ สโตเรจ จำกัด • THAI CHEMICALS STORAGE •</textPath></text>
      <text x="160" y="150" text-anchor="middle" font-family="Tahoma, sans-serif" font-size="46" font-weight="bold" fill="#1d3f9a">TCS</text>
      <text x="160" y="192" text-anchor="middle" font-family="Tahoma, sans-serif" font-size="20" fill="#1d3f9a">สำนักงานใหญ่</text>
    </svg>`;
    return toWebpDataUrl(svg(s), { quality: 85 });
  }

  const AVATAR_COLORS = ["#0b1d3a", "#1e5a8c", "#7a5c1e", "#2f6b4f", "#6b2f4f", "#3d3d7a", "#8c4a1e", "#24605f"];
  async function avatar(initial, idx) {
    const bg = AVATAR_COLORS[idx % AVATAR_COLORS.length];
    const s = `<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256">
      <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${bg}"/><stop offset="1" stop-color="#c9a84c"/></linearGradient></defs>
      <rect width="256" height="256" fill="url(#g)"/>
      <circle cx="128" cy="104" r="46" fill="#ffffff" fill-opacity="0.92"/>
      <path d="M40,256 C48,184 86,160 128,160 C170,160 208,184 216,256 Z" fill="#ffffff" fill-opacity="0.92"/>
      <text x="128" y="120" text-anchor="middle" font-family="Tahoma, Leelawadee UI, sans-serif" font-size="44" font-weight="bold" fill="${bg}">${initial}</text>
    </svg>`;
    return toWebpDataUrl(svg(s));
  }

  async function signature(seed) {
    // A loose cursive-looking stroke — not anyone's real signature.
    const r = (n) => { seed = (seed * 9301 + 49297) % 233280; return (seed / 233280) * n; };
    let d = `M ${20 + r(10)} ${70 + r(10)}`;
    let x = 30;
    for (let i = 0; i < 7; i++) {
      x += 35 + r(15);
      d += ` C ${x - 30} ${10 + r(30)}, ${x - 15} ${100 + r(20)}, ${x} ${55 + r(25)}`;
    }
    d += ` M ${40 + r(20)} ${95 + r(5)} Q ${180} ${80 + r(20)} ${320 + r(30)} ${88 + r(10)}`;
    const s = `<svg xmlns="http://www.w3.org/2000/svg" width="380" height="130"><path d="${d}" fill="none" stroke="#14213d" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
    const buf = await sharp(svg(s)).png().toBuffer();
    return "data:image/png;base64," + buf.toString("base64");
  }

  /** A synthetic "site photo": corroded pipe flange on a grey wall (drawn, not photographed). */
  async function sitePhoto(variant = 0) {
    const s = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="900">
      <defs>
        <linearGradient id="wall" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#9aa3a8"/><stop offset="1" stop-color="#6f777c"/></linearGradient>
        <linearGradient id="pipe" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#d9d4c3"/><stop offset="0.5" stop-color="#f1ecdc"/><stop offset="1" stop-color="#a9a391"/></linearGradient>
        <radialGradient id="rust" cx="0.5" cy="0.5" r="0.5"><stop offset="0" stop-color="#7a3b12"/><stop offset="0.6" stop-color="#a5571f" stop-opacity="0.8"/><stop offset="1" stop-color="#a5571f" stop-opacity="0"/></radialGradient>
      </defs>
      <rect width="1200" height="900" fill="url(#wall)"/>
      <rect x="0" y="${330 + variant * 20}" width="1200" height="220" fill="url(#pipe)"/>
      <rect x="520" y="${290 + variant * 20}" width="70" height="300" rx="8" fill="#c8c2ae" stroke="#8d8774" stroke-width="4"/>
      <rect x="600" y="${290 + variant * 20}" width="70" height="300" rx="8" fill="#c8c2ae" stroke="#8d8774" stroke-width="4"/>
      ${[0, 1, 2, 3, 4].map((i) => `<circle cx="${555 + (i % 2) * 80}" cy="${320 + i * 60 + variant * 20}" r="11" fill="#6d6a60"/>`).join("")}
      <ellipse cx="610" cy="${560 + variant * 20}" rx="120" ry="60" fill="url(#rust)"/>
      <path d="M560 ${590 + variant * 20} q 20 60 -10 140 M640 ${600 + variant * 20} q 10 70 30 150" stroke="#7a3b12" stroke-width="10" fill="none" opacity="0.7"/>
      <rect x="0" y="780" width="1200" height="120" fill="#55595c"/>
    </svg>`;
    return sharp(svg(s)).jpeg({ quality: 82 }).toBuffer();
  }

  /** Scanned-looking signed delivery note (fictional). */
  async function deliveryNoteScan() {
    const s = `<svg xmlns="http://www.w3.org/2000/svg" width="1240" height="1754">
      <rect width="1240" height="1754" fill="#fbfaf6"/>
      <text x="620" y="150" text-anchor="middle" font-family="Tahoma, sans-serif" font-size="46" font-weight="bold" fill="#222">ใบส่งมอบสินค้า (สำเนาลงนาม)</text>
      <text x="120" y="260" font-family="Tahoma, sans-serif" font-size="28" fill="#333">ลูกค้า: บริษัท ตัวอย่าง จำกัด</text>
      <text x="120" y="310" font-family="Tahoma, sans-serif" font-size="28" fill="#333">งวดที่ 1 — ถังเก็บสารเคมี FRP 2,000 ลิตร และ Wet Scrubber</text>
      ${[0, 1, 2, 3, 4, 5].map((i) => `<line x1="120" y1="${420 + i * 90}" x2="1120" y2="${420 + i * 90}" stroke="#bbb" stroke-width="2"/>`).join("")}
      <text x="140" y="465" font-family="Tahoma, sans-serif" font-size="26" fill="#444">1. ถังเก็บสารเคมี FRP 2,000 ลิตร   1 ใบ</text>
      <text x="140" y="555" font-family="Tahoma, sans-serif" font-size="26" fill="#444">2. Wet Scrubber FRP 5,000 CMH   1 ชุด</text>
      <path d="M760 1400 c 30 -60 60 40 90 -10 s 50 -40 80 10 s 40 20 70 -20" stroke="#1a2a6c" stroke-width="5" fill="none"/>
      <line x1="720" y1="1440" x2="1100" y2="1440" stroke="#555" stroke-width="2"/>
      <text x="910" y="1480" text-anchor="middle" font-family="Tahoma, sans-serif" font-size="24" fill="#555">ผู้รับสินค้า</text>
    </svg>`;
    return sharp(svg(s)).jpeg({ quality: 80 }).toBuffer();
  }

  /** Minimal valid one-page PDF with a title line (Latin text only — standard font). */
  function pdf(title) {
    const content = `BT /F1 20 Tf 72 760 Td (${title.replace(/[()\\]/g, "")}) Tj ET\nBT /F1 11 Tf 72 730 Td (Demo document - Thai Chemicals Storage demo data) Tj ET`;
    const objs = [
      "<< /Type /Catalog /Pages 2 0 R >>",
      "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
      "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
      `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
      "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    ];
    let out = "%PDF-1.4\n";
    const offs = [];
    objs.forEach((o, i) => { offs.push(out.length); out += `${i + 1} 0 obj\n${o}\nendobj\n`; });
    const xref = out.length;
    out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n` + offs.map((o) => String(o).padStart(10, "0") + " 00000 n \n").join("");
    out += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
    return Buffer.from(out, "latin1");
  }

  return { logo, stamp, avatar, signature, sitePhoto, deliveryNoteScan, pdf };
}

// ── data ──
// Master data: company, departments/teams, roles, users, catalog, opening stock, vendors, codes,
// customers, quotation + service templates. All fictional.
async function masterData(C, A, S) {
  const { at, api, PASSWORD } = C;
  const START = "2025-10-01";

  // ── people ──
  // [username, fullName, roleKeyOrCustom, department, teamName, position, phone, employeeId]
  S.people = [
    ["admin", "ปกรณ์ ศรีวัฒนกุล", "super_admin", "Management", "", "กรรมการผู้จัดการ", "081-400-1001", "EMP-0001"],
    ["mgr01", "วีระพงษ์ จันทร์หอม", "approver_1", "Sales", "", "ผู้จัดการฝ่ายขาย", "081-400-1002", "EMP-0002"],
    ["sales01", "อรอุมา แก้วประเสริฐ", "sales_user", "Sales", "ทีมขาย 1", "เจ้าหน้าที่ขาย", "081-400-1011", "EMP-0011"],
    ["sales02", "ภานุวัฒน์ ทองมา", "sales_user", "Sales", "ทีมขาย 2", "เจ้าหน้าที่ขาย", "081-400-1012", "EMP-0012"],
    ["sales03", "ชไมพร สุขเจริญ", "sales_user", "Service", "", "เจ้าหน้าที่ขายงานบริการ", "081-400-1013", "EMP-0013"],
    ["acc01", "สุภาวดี มณีรัตน์", "accounting_user", "Accounting", "", "เจ้าหน้าที่บัญชี", "081-400-1021", "EMP-0021"],
    ["acc02", "จิราพร วงศ์สวัสดิ์", "accounting_user", "Accounting", "", "หัวหน้าแผนกบัญชี", "081-400-1022", "EMP-0022"],
    ["pur01", "กิตติศักดิ์ บุญมา", "@purchasing", "Purchase", "", "เจ้าหน้าที่จัดซื้อ", "081-400-1031", "EMP-0031"],
    ["pur02", "นภัสสร อินทร์แก้ว", "@purchasing", "Purchase", "", "หัวหน้าแผนกจัดซื้อ", "081-400-1032", "EMP-0032"],
    ["fac01", "สมศักดิ์ พรหมวงศ์", "@production", "Factory", "ทีม FRP", "หัวหน้าฝ่ายผลิต", "081-400-1041", "EMP-0041"],
    ["fac02", "ธีรวัฒน์ คงสมบูรณ์", "@production", "Factory", "ทีมเหล็ก", "ช่างเทคนิคอาวุโส", "081-400-1042", "EMP-0042"],
    ["store01", "ณรงค์ชัย ปัญญาดี", "@store", "Store", "", "หัวหน้าสโตร์", "081-400-1051", "EMP-0051"],
    ["store02", "วรรณา ศรีบุญเรือง", "@store", "Store", "", "เจ้าหน้าที่สโตร์", "081-400-1052", "EMP-0052"],
    ["prj01", "ศิริพร แสงทอง", "@project", "Project", "ทีมติดตั้ง A", "วิศวกรโครงการ", "081-400-1061", "EMP-0061"],
    ["prj02", "ณัฐวุฒิ อ่อนละมัย", "@project", "Project", "ทีมติดตั้ง B", "หัวหน้าทีมติดตั้ง", "081-400-1062", "EMP-0062"],
    ["svc01", "อนุชา ทองดี", "service_engineer", "Service", "", "ช่างบริการ", "081-400-1071", "EMP-0071"],
    ["ops01", "ชัยวัฒน์ เกษมสุข", "@ops", "Management", "", "ผู้จัดการฝ่ายปฏิบัติการ", "081-400-1003", "EMP-0003"],
    ["bd01", "พิมพ์ชนก รัตนวงศ์", "@bd", "Sales", "", "เจ้าหน้าที่ BD / ประมาณราคา", "081-400-1081", "EMP-0081"],
    ["sales04", "มานพ รุ่งเรืองศรี", "sales_user", "Sales", "ทีมขาย 2", "เจ้าหน้าที่ขาย", "081-400-1014", "EMP-0014"],
  ];
  S.user = {}; // username -> {id, fullName}
  S.name = (u) => S.people.find((p) => p[0] === u)[1];

  const CUSTOM_ROLES = {
    "@purchasing": { name: "ฝ่ายจัดซื้อ", description: "เปิดใบขอซื้อ/ใบสั่งซื้อ ดูแลทะเบียนผู้ขายและทะเบียนรหัส", permissions: [
      "dashboard:view", "dashboard:tabPurchasing", "products:view", "stock:view",
      "purchaseRequest:view", "purchaseRequest:viewAll", "purchaseRequest:create", "purchaseRequest:edit", "purchaseRequest:editApproved", "purchaseRequest:print",
      "purchaseOrder:view", "purchaseOrder:viewAll", "purchaseOrder:create", "purchaseOrder:edit", "purchaseOrder:print",
      "vendor:view", "vendor:create", "vendor:edit", "codeRegister:view", "codeRegister:create", "codeRegister:edit",
      "receivingReport:view", "receivingReport:viewAll", "productRequest:view", "productRequest:create"] },
    "@store": { name: "สโตร์", description: "รับสินค้า จ่ายของตามใบเบิก ตั้งรหัสสินค้า และดูแลยอดสต๊อก", permissions: [
      "dashboard:view", "dashboard:tabInventory", "products:view", "products:create", "products:edit", "stock:view", "stock:adjust",
      "materialRequisition:view", "materialRequisition:viewAll", "materialRequisition:create", "materialRequisition:edit", "materialRequisition:print",
      "receivingReport:view", "receivingReport:viewAll", "receivingReport:create", "receivingReport:edit", "receivingReport:receive", "receivingReport:print",
      "purchaseRequest:view", "purchaseRequest:viewAll", "purchaseOrder:view", "purchaseOrder:viewAll",
      "productRequest:view", "productRequest:viewAll", "productRequest:create", "productRequest:review"] },
    "@project": { name: "ฝ่ายโครงการ", description: "ดูแลโครงการ เปิดใบเบิกวัสดุ ใบสั่งงาน และใบขอซื้อของงาน", permissions: [
      "dashboard:view", "dashboard:tabProject", "scopeOfWork:view", "scopeOfWork:viewAll", "products:view", "stock:view",
      "project:view", "project:viewAll", "project:create", "project:edit", "project:print",
      "materialRequisition:view", "materialRequisition:create", "materialRequisition:edit", "materialRequisition:print",
      "jobOrder:view", "jobOrder:create", "jobOrder:edit", "jobOrder:print",
      "purchaseRequest:view", "purchaseRequest:create", "purchaseRequest:edit", "purchaseRequest:print",
      "productRequest:view", "productRequest:create"] },
    "@production": { name: "ฝ่ายผลิต", description: "เปิดใบสั่งผลิต ใบเบิกวัสดุ และใบขอซื้อของฝ่ายผลิต", permissions: [
      "dashboard:view", "dashboard:tabProduction", "scopeOfWork:view", "scopeOfWork:viewAll", "products:view", "stock:view", "project:view",
      "productionOrder:view", "productionOrder:viewAll", "productionOrder:create", "productionOrder:edit", "productionOrder:print",
      "materialRequisition:view", "materialRequisition:create", "materialRequisition:edit", "materialRequisition:print",
      "purchaseRequest:view", "purchaseRequest:create", "purchaseRequest:edit", "purchaseRequest:print",
      "productRequest:view", "productRequest:create"] },
    "@ops": { name: "ผู้จัดการฝ่ายปฏิบัติการ", description: "อนุมัติเอกสารฝ่ายโครงการ ผลิต จัดซื้อ สโตร์ และ Cost Control", permissions: [
      "dashboard:view", "dashboard:tabOverview", "dashboard:tabPurchasing", "dashboard:tabInventory", "dashboard:tabProduction", "dashboard:tabProject", "dashboard:tabBd",
      "scopeOfWork:view", "scopeOfWork:viewAll", "products:view", "stock:view", "vendor:view",
      "project:view", "project:viewAll", "project:edit", "project:finalize", "project:print",
      "materialRequisition:view", "materialRequisition:viewAll", "materialRequisition:edit", "materialRequisition:finalize", "materialRequisition:print",
      "jobOrder:view", "jobOrder:viewAll", "jobOrder:edit", "jobOrder:finalize", "jobOrder:print",
      "purchaseRequest:view", "purchaseRequest:viewAll", "purchaseRequest:edit", "purchaseRequest:finalize", "purchaseRequest:print",
      "productionOrder:view", "productionOrder:viewAll", "productionOrder:edit", "productionOrder:finalize", "productionOrder:print",
      "purchaseOrder:view", "purchaseOrder:viewAll", "purchaseOrder:edit", "purchaseOrder:finalize", "purchaseOrder:print",
      "costControl:view", "costControl:viewAll", "costControl:edit", "costControl:finalize", "costControl:print",
      "receivingReport:view", "receivingReport:viewAll"] },
    "@bd": { name: "BD / ประมาณราคา", description: "ทำ Cost Control จากไฟล์ประมาณราคา และติดตามงานขาย", permissions: [
      "dashboard:view", "dashboard:tabBd", "quotations:view", "quotations:viewAll", "scopeOfWork:view", "scopeOfWork:viewAll", "products:view",
      "costControl:view", "costControl:viewAll", "costControl:create", "costControl:edit", "costControl:print"] },
  };

  at(`${START} 08:00`, "setup", async () => {
    const r = await C.raw("POST", "/auth/setup", { employeeId: "EMP-0001", fullName: S.name("admin"), username: "admin", email: "pakorn.s@tcs-demo.example", password: PASSWORD });
    if (r.status !== 201) throw new Error("setup " + r.status + JSON.stringify(r.data));
    S.user.admin = { id: r.data.user.id, fullName: r.data.user.fullName };
    await C.login("admin");
  });

  at(`${START} 08:05`, "company", async () => {
    await api("admin", "PUT", "/company", {
      name: "บริษัท ไทย เคมิคอลส์ สโตเรจ จำกัด",
      address: "99/14 หมู่ 6 ถนนบางนา-ตราด กม.23 ตำบลบางเสาธง อำเภอบางเสาธง จังหวัดสมุทรปราการ 10570",
      phone: "02-170-5500", email: "sales@tcs-demo.example", website: "www.tcs-demo.example",
      facebookName: "Thai Chemicals Storage", lineId: "@tcs-demo", taxId: "0115561009876",
      logoDataUrl: await A.logo(), stampDataUrl: await A.stamp(), vatRate: 7,
      bankName: "ธนาคารกรุงไทย จำกัด (มหาชน)", bankAccountName: "บริษัท ไทย เคมิคอลส์ สโตเรจ จำกัด", bankAccountNumber: "123-4-56789-0", bankBranch: "สาขาบางนา-ตราด กม.23",
      termsAndConditions: "1. ราคานี้ยืนราคา 30 วันนับจากวันที่ออกใบเสนอราคา\n2. ระยะเวลาส่งมอบนับจากวันที่ได้รับใบสั่งซื้อและเงินมัดจำ\n3. รับประกันงานผลิต 1 ปี ไม่รวมความเสียหายจากการใช้งานผิดวิธี\n4. ราคายังไม่รวมงานโยธาและงานไฟฟ้าภายนอกขอบเขตงาน",
    });
  });

  at(`${START} 08:10`, "departments/teams/roles/users", async () => {
    const { departments } = await api("admin", "GET", "/departments");
    const RENAME = { SALES: "Sales", PURCHASING: "Purchase", WAREHOUSE: "Store", ACCOUNTING: "Accounting", HR: "HR", MANAGEMENT: "Management", IT: "Technic" };
    S.dept = {};
    for (const d of departments) {
      const nn = RENAME[d.code] ?? d.name;
      await api("admin", "PATCH", `/departments/${d.id}`, { name: nn });
      S.dept[nn] = d.id;
    }
    for (const [name, code] of [["Factory", "FACTORY"], ["Project", "PROJECT"], ["Service", "SERVICE"]]) {
      const r = await api("admin", "POST", "/departments", { name, code });
      S.dept[name] = r.department.id;
    }
    await api("admin", "PATCH", `/departments/${S.dept.HR}`, { isActive: false });
    S.team = {};
    for (const [dept, names] of [["Sales", ["ทีมขาย 1", "ทีมขาย 2"]], ["Factory", ["ทีม FRP", "ทีมเหล็ก", "ทีมประกอบ"]], ["Project", ["ทีมติดตั้ง A", "ทีมติดตั้ง B"]]]) {
      for (const n of names) S.team[n] = (await api("admin", "POST", "/teams", { name: n, departmentId: S.dept[dept] })).team.id;
    }
    S.roleKey = {};
    for (const [k, r] of Object.entries(CUSTOM_ROLES)) S.roleKey[k] = (await api("admin", "POST", "/roles", r)).role.key;
    await api("admin", "GET", "/roles");
    for (const [u, fullName, role, dept, team, position, phone, emp] of S.people) {
      if (u === "admin") {
        await api("admin", "PATCH", `/users/${S.user.admin.id}`, { phone, department: dept, position });
        continue;
      }
      const roleKey = role.startsWith("@") ? S.roleKey[role] : role;
      const r = await api("admin", "POST", "/users", {
        employeeId: emp, fullName, username: u, email: `${u}@tcs-demo.example`, password: PASSWORD,
        roleKey, phone, department: dept, teamId: team ? S.team[team] : "", position,
      });
      S.user[u] = { id: r.user.id, fullName };
    }
    // pictures + signatures
    const pics = ["admin", "mgr01", "sales01", "sales02", "acc01", "pur02", "store01", "prj01", "ops01"];
    let i = 0;
    for (const u of pics) {
      await api("admin", "PATCH", `/users/${S.user[u].id}`, { profilePictureDataUrl: await A.avatar(S.name(u).slice(0, 1), i++) });
    }
    let seed = 11;
    for (const u of ["admin", "mgr01", "sales01", "sales02", "sales03", "acc01", "pur02", "ops01", "store01", "fac01", "prj01"]) {
      await api("admin", "PATCH", `/users/${S.user[u].id}`, { signatureDataUrl: await A.signature(seed += 37) });
    }
  });

  // ── catalog ──
  // [code, name, category, unit, price, reorderPoint, opening qty, unit cost]
  const P = [
    ["EQ-0001", "ถังเก็บสารเคมี FRP 2,000 ลิตร", "อุปกรณ์ระบบ", "ใบ", 85000, 0, 2, 52000],
    ["EQ-0002", "ถังเก็บสารเคมี FRP 10,000 ลิตร", "อุปกรณ์ระบบ", "ใบ", 265000, 0, 0, 0],
    ["EQ-0003", "Wet Scrubber FRP 5,000 CMH", "อุปกรณ์ระบบ", "ชุด", 680000, 0, 0, 0],
    ["EQ-0004", "Activated Carbon Filter Box 3,000 CMH", "อุปกรณ์ระบบ", "ชุด", 245000, 0, 0, 0],
    ["EQ-0005", "Blower FRP 7.5 kW", "อุปกรณ์ระบบ", "ชุด", 128000, 0, 1, 81000],
    ["EQ-0006", "Dust Collector (Bag Filter) 64 ถุง", "อุปกรณ์ระบบ", "ชุด", 540000, 0, 0, 0],
    ["EQ-0007", "ปั๊มสารเคมี Magnetic Drive 1.5 kW", "อุปกรณ์ระบบ", "ชุด", 38500, 1, 3, 24500],
    ["EQ-0008", "ท่อ FRP Ø 300 mm", "อุปกรณ์ระบบ", "เมตร", 2850, 0, 36, 1650],
    ["EQ-0009", "ตะแกรง FRP Grating 38 mm", "อุปกรณ์ระบบ", "ตร.ม.", 3900, 0, 24, 2400],
    ["SV-0001", "ค่าติดตั้งและทดสอบระบบ", "บริการ", "งาน", 45000, 0, 0, 0],
    ["SV-0002", "งานบุผิว FRP Lining", "บริการ", "ตร.ม.", 2400, 0, 0, 0],
    ["SV-0003", "ค่าบริการตรวจเช็คระบบประจำปี (PM)", "บริการ", "ครั้ง", 18000, 0, 0, 0],
    ["SV-0004", "ค่าขนส่งและเครน", "บริการ", "เที่ยว", 12000, 0, 0, 0],
    ["MAT-0001", "เรซิ่น Vinyl Ester", "วัตถุดิบ", "kg", 185, 200, 640, 152],
    ["MAT-0002", "ใยแก้ว CSM 450", "วัตถุดิบ", "kg", 95, 150, 420, 78],
    ["MAT-0003", "ใยแก้วทอ WR 600", "วัตถุดิบ", "kg", 110, 100, 260, 91],
    ["MAT-0004", "แผ่น PP หนา 10 mm", "วัตถุดิบ", "แผ่น", 4200, 4, 3, 3450],
    ["MAT-0005", "ท่อ PVC Ø 4 นิ้ว", "วัตถุดิบ", "ท่อน", 650, 10, 42, 480],
    ["MAT-0006", "เหล็กฉาก 50x50x5 mm", "วัตถุดิบ", "เส้น", 520, 20, 85, 410],
    ["MAT-0007", "ถ่านกัมมันต์ (Activated Carbon)", "วัตถุดิบ", "kg", 140, 500, 1250, 108],
    ["MAT-0008", "ถุงกรองฝุ่น Polyester", "วัตถุดิบ", "ใบ", 450, 64, 60, 365],
    ["MAT-0009", "สี Epoxy Primer", "วัตถุดิบ", "แกลลอน", 1350, 4, 0, 0],
    ["SP-0001", "สกรู M6x30 SUS304", "อะไหล่", "ตัว", 3.5, 100, 240, 2.4],
    ["SP-0002", "แหวน M6 SUS304", "อะไหล่", "ตัว", 1, 100, 500, 0.6],
    ["SP-0003", "หัวน็อต M6 SUS304", "อะไหล่", "ตัว", 1.5, 100, 180, 0.9],
    ["SP-0004", "U-Bolt Ø 4 นิ้ว SUS304", "อะไหล่", "ตัว", 85, 20, 64, 58],
    ["SP-0005", "ซีลปั๊ม Mechanical Seal 1.5 นิ้ว", "อะไหล่", "ชุด", 3200, 2, 2, 2450],
    ["SP-0006", "หัวสเปรย์ Nozzle PP 1/2 นิ้ว", "อะไหล่", "ตัว", 280, 20, 48, 195],
    ["SP-0007", "สายพาน B-52", "อะไหล่", "เส้น", 450, 4, 0, 0],
    ["TO-0001", "สว่านไฟฟ้า 13 mm", "เครื่องมือ", "เครื่อง", 3900, 0, 6, 2850, true],
    ["TO-0002", "เครื่องเจียร 4 นิ้ว", "เครื่องมือ", "เครื่อง", 2400, 0, 8, 1650, true],
    ["TO-0003", "ประแจทอร์ค 1/2 นิ้ว", "เครื่องมือ", "อัน", 4500, 0, 3, 3200, true],
    ["TO-0004", "เครื่องตัดไฟเบอร์ 14 นิ้ว", "เครื่องมือ", "เครื่อง", 6900, 0, 2, 4800, true],
    ["TO-0005", "เครื่องเชื่อมพลาสติก PP (Hot Air)", "เครื่องมือ", "เครื่อง", 12500, 0, 0, 0, true],
    ["TO-0006", "รอกโซ่ 1 ตัน", "เครื่องมือ", "ตัว", 5200, 0, 2, 3900, true],
    ["PK-0001", "ถังพลาสติก 200 ลิตร (เลิกใช้)", "บรรจุภัณฑ์", "ใบ", 950, 0, 0, 0, false, true],
    ["PK-0002", "แกลลอนพลาสติก 20 ลิตร (เลิกใช้)", "บรรจุภัณฑ์", "ใบ", 120, 0, 0, 0, false, true],
    ["MAT-0010", "เรซิ่น Ortho (สูตรเดิม)", "วัตถุดิบ", "kg", 120, 0, 0, 0, false, true],
  ];
  S.prod = {}; // code -> {id, name, unit}

  at(`${START} 09:00`, "catalog", async () => {
    S.cat = {};
    for (const n of ["วัตถุดิบ", "อุปกรณ์ระบบ", "อะไหล่", "เครื่องมือ", "บริการ", "บรรจุภัณฑ์"]) {
      S.cat[n] = (await api("admin", "POST", "/categories", { name: n })).category.id;
    }
    for (const [code, name, cat, unit, price, reorder, , , isTool, archived] of P) {
      const r = await api("admin", "POST", "/products", { code, name, categoryId: S.cat[cat], unit, defaultPrice: price, description: "", specifications: "", isTool: !!isTool });
      S.prod[code] = { id: r.product.id, name, unit };
      const patch = {};
      if (reorder) patch.reorderPoint = reorder;
      if (archived) patch.archived = true;
      if (Object.keys(patch).length) await api("admin", "PATCH", `/products/${r.product.id}`, patch);
    }
    await api("admin", "PATCH", `/categories/${S.cat["บรรจุภัณฑ์"]}`, { archived: true });
    for (const [code, name, comps] of [
      ["KIT-0001", "ชุดยึดท่อ U-Bolt Ø 4 นิ้ว", [["SP-0004", 1], ["SP-0003", 2], ["SP-0002", 2]]],
      ["KIT-0003", "ชุดน็อตยึดแท่น M6", [["SP-0001", 1], ["SP-0002", 2], ["SP-0003", 1]]],
    ]) {
      const r = await api("admin", "POST", "/products", { code, name, categoryId: S.cat["อะไหล่"], unit: "ชุด", defaultPrice: code === "KIT-0003" ? 8 : 120, description: "", specifications: "" });
      await api("admin", "PATCH", `/products/${r.product.id}`, { kitComponents: comps.map(([c, q]) => ({ productId: S.prod[c].id, qty: q })) });
      S.prod[code] = { id: r.product.id, name, unit: "ชุด" };
    }
    // the material requisition module seeds the store catalog on first use — trigger it now so the
    // opening balance below can include those items too
    await api("admin", "GET", "/material-requisitions");
    const all = (await api("admin", "GET", "/products")).products ?? [];
    for (const p of all) if (!S.prod[p.code]) S.prod[p.code] = { id: p.id, name: p.name, unit: p.unit };
  });

  at(`${START} 09:30`, "opening stock (import)", async () => {
    const rows = P.filter((p) => p[6] > 0).map((p) => ({ code: p[0], qty: p[6], unitCost: p[7] }));
    // store-catalog items: a believable opening balance for most of them
    const catalogCodes = Object.keys(S.prod).filter((c) => !P.some((p) => p[0] === c) && !c.startsWith("KIT-"));
    let k = 0;
    for (const code of catalogCodes) {
      k++;
      if (k % 9 === 0) continue; // a few genuinely empty shelves
      const fixed = { "PD-0645": [150, 28], "PD-0034": [100, 12], "PD-0004": [200, 13], "PD-0084": [60, 26], "PD-0028": [80, 20], "PD-0141": [10, 85], "PD-0062": [8, 410], "PD-0032": [120, 14], "PD-0110": [80, 18], "PD-0036": [400, 6], "PD-0161": [30, 35] }[code];
      const qty = fixed ? fixed[0] : [12, 25, 40, 8, 60, 100, 15, 30][k % 8];
      const cost = fixed ? fixed[1] : [18, 35, 45, 120, 9, 260, 75, 22][k % 8];
      rows.push({ code, qty, unitCost: cost });
    }
    await api("admin", "POST", "/stock-movements/import", { rows, note: "ยอดยกมาต้นงวด (ตรวจนับ 30 ก.ย. 2568)" });
  });

  // ── vendors ──
  const V = [
    ["V-001", "บริษัท สยามเคมีภัณฑ์ จำกัด", "0105548011223", "คุณปิยะพงษ์ ศรีเมือง", "02-311-4567", "55/2 ถนนสุขุมวิท 105 แขวงบางนา เขตบางนา กรุงเทพฯ 10260", "approved"],
    ["V-002", "บริษัท ไทยสตีลซัพพลาย จำกัด", "0105552033441", "คุณธนกร เลิศวิริยะ", "02-740-2210", "120 หมู่ 3 ถนนเทพารักษ์ ตำบลบางพลีใหญ่ อำเภอบางพลี จังหวัดสมุทรปราการ 10540", "approved"],
    ["V-003", "บริษัท เอเชียวาล์วแอนด์ฟิตติ้ง จำกัด", "0105556071882", "คุณสุนิสา พูลผล", "02-896-3300", "88/9 ถนนพระราม 2 แขวงแสมดำ เขตบางขุนเทียน กรุงเทพฯ 10150", "approved"],
    ["V-004", "ร้าน ศรีสุขการไฟฟ้า", "3101400562210", "คุณสมพงษ์ ศรีสุข", "038-221-450", "14/7 ถนนสุขุมวิท ตำบลเสม็ด อำเภอเมืองชลบุรี จังหวัดชลบุรี 20000", "approved"],
    ["V-005", "บริษัท ผู้ขายตัวอย่าง จำกัด", "0105560099887", "คุณกมลชนก ทรัพย์มาก", "02-105-7788", "300 หมู่ 1 ถนนบางนา-ตราด ตำบลบางโฉลง อำเภอบางพลี จังหวัดสมุทรปราการ 10540", "approved"],
    ["V-009", "บริษัท อีสเทิร์น ปั๊ม แอนด์ วาล์ว จำกัด", "0215559004412", "คุณวิทยา แก้วมณี", "038-604-118", "77/3 หมู่ 2 ตำบลมาบยางพร อำเภอปลวกแดง จังหวัดระยอง 21140", "inactive"],
    ["V-008", "บริษัท พีเอ็นเค ไฮดรอลิก จำกัด", "0105563045671", "คุณพัชรี นาคสวัสดิ์", "02-462-9031", "19 ซอยเพชรเกษม 81 แขวงหนองค้างพลู เขตหนองแขม กรุงเทพฯ 10160", "rejected"],
    ["V-007", "บริษัท บางนา ทูลส์ แอนด์ ฮาร์ดแวร์ จำกัด", "0105561027734", "คุณเอกชัย บุญประเสริฐ", "02-183-4402", "45 ถนนบางนา-ตราด กม.4 แขวงบางนา เขตบางนา กรุงเทพฯ 10260", "draft"],
    ["V-006", "บริษัท โกลบอล แก๊ส ซัพพลาย จำกัด", "0105558066120", "คุณณัฐธิดา ชัยมงคล", "02-326-1199", "9/9 ถนนกิ่งแก้ว ตำบลราชาเทวะ อำเภอบางพลี จังหวัดสมุทรปราการ 10540", "pending"],
  ];
  S.vendor = {}; // name -> {id, code, taxId, contact, phone, address}
  at(`${START} 10:00`, "vendors (approved set)", async () => {
    for (const [code, name, taxId, contactName, phone, address, state] of V) {
      if (state === "draft" || state === "pending" || state === "rejected") continue;
      const r = await api("pur02", "POST", "/vendors", { code, name, taxId, contactName, phone, address, note: "", isActive: true });
      S.vendor[name] = { id: r.vendor.id, code, taxId, contactName, phone, address };
      await api("pur02", "POST", `/vendors/${r.vendor.id}/submit-approval`);
      await api("acc02", "POST", `/vendors/${r.vendor.id}/approve`);
      if (state === "inactive") await api("pur02", "PATCH", `/vendors/${r.vendor.id}`, { isActive: false });
    }
  });
  at("2026-08-18 14:10", "vendor rejected", async () => {
    const [code, name, taxId, contactName, phone, address] = V.find((v) => v[6] === "rejected");
    const r = await api("pur01", "POST", "/vendors", { code, name, taxId, contactName, phone, address, note: "ผู้ขายรายใหม่ งานกระบอกไฮดรอลิก", isActive: true });
    await api("pur01", "POST", `/vendors/${r.vendor.id}/submit-approval`);
    C.setClock("2026-08-19 10:30");
    await api("acc02", "POST", `/vendors/${r.vendor.id}/reject`, { comment: "เอกสาร ภ.พ.20 ไม่ตรงกับชื่อบริษัท กรุณาแนบฉบับปัจจุบัน" });
  });
  at("2026-09-24 11:20", "vendor draft", async () => {
    const [code, name, taxId, contactName, phone, address] = V.find((v) => v[6] === "draft");
    await api("pur01", "POST", "/vendors", { code, name, taxId, contactName, phone, address, note: "", isActive: true });
  });
  at("2026-09-29 15:40", "vendor pending", async () => {
    const [code, name, taxId, contactName, phone, address] = V.find((v) => v[6] === "pending");
    const r = await api("pur02", "POST", "/vendors", { code, name, taxId, contactName, phone, address, note: "ผู้ขายแก๊สอาร์กอนและ CO2 สำหรับงานเชื่อม", isActive: true });
    await api("pur02", "POST", `/vendors/${r.vendor.id}/submit-approval`);
  });

  // ── code register ──
  at(`${START} 10:30`, "code register", async () => {
    for (const [code, name] of [["G110", "ฝ่ายขาย"], ["G120", "ฝ่ายบริหาร"], ["G131", "ฝ่ายผลิต FRP"], ["G132", "ฝ่ายผลิตงานเหล็ก"], ["G143", "ฝ่ายโครงการ"], ["G150", "สโตร์"], ["G160", "ฝ่ายบริการ"]]) {
      await api("pur02", "POST", "/code-entries", { kind: "department", code, name });
    }
    for (const [code, name] of [["ST", "งานเหล็ก"], ["FC", "งานโรงงาน"], ["PD", "งานผลิต"], ["IN", "งานติดตั้งหน้างาน"], ["MT", "งานซ่อมบำรุง"]]) {
      await api("pur02", "POST", "/code-entries", { kind: "workType", code, name });
    }
    const acc = [
      ["1150-00", "สินค้าคงเหลือ", "สินทรัพย์", 2, true, ""],
      ["1150-01", "วัตถุดิบคงเหลือ", "สินทรัพย์", 3, false, "1150-00"],
      ["1150-02", "อะไหล่และวัสดุโรงงานคงเหลือ", "สินทรัพย์", 3, false, "1150-00"],
      ["1150-03", "งานระหว่างทำ", "สินทรัพย์", 3, false, "1150-00"],
      ["5100-00", "ต้นทุนขายและบริการ", "ต้นทุนขาย", 2, true, ""],
      ["5100-10", "ต้นทุนวัตถุดิบทางตรง", "ต้นทุนขาย", 3, false, "5100-00"],
      ["5100-20", "ค่าแรงทางตรง", "ต้นทุนขาย", 3, false, "5100-00"],
      ["5100-30", "ค่าจ้างผู้รับเหมาช่วง", "ต้นทุนขาย", 3, false, "5100-00"],
      ["5230-00", "ค่าใช้จ่ายในการดำเนินงาน", "ค่าใช้จ่าย", 2, true, ""],
      ["5230-11", "ค่าวัสดุสิ้นเปลือง", "ค่าใช้จ่าย", 3, false, "5230-00"],
      ["5230-15", "ค่าซ่อมแซมและบำรุงรักษา", "ค่าใช้จ่าย", 3, false, "5230-00"],
      ["5230-21", "ค่าขนส่ง", "ค่าใช้จ่าย", 3, false, "5230-00"],
      ["5230-31", "ค่าเครื่องมือเครื่องใช้", "ค่าใช้จ่าย", 3, false, "5230-00"],
      ["5230-41", "ค่าก๊าซและวัสดุงานเชื่อม", "ค่าใช้จ่าย", 3, false, "5230-00"],
    ];
    await api("pur02", "POST", "/code-entries/import", { kind: "account", entries: acc.map(([code, name, category, level, isControl, parentCode]) => ({ code, name, category, level, isControl, parentCode })) });
  });

  // ── customers ──
  S.cust = {};
  const CU = [
    ["C-0001", "บริษัท ตัวอย่าง จำกัด", "0215559012345", "88/8 หมู่ 5 นิคมอุตสาหกรรมอมตะซิตี้ ตำบลมาบยางพร อำเภอปลวกแดง จังหวัดระยอง 21140", "คุณวิชัย ประเสริฐสุข", "ผู้จัดการฝ่ายวิศวกรรม", "081-234-5678", "wichai.p@tuayang.example", "จัดส่งทางรถขนส่ง", "ระบบบำบัดอากาศ อาคารผลิต 2", "88/8 หมู่ 5 นิคมอุตสาหกรรมอมตะซิตี้ (ประตู 3 อาคารผลิต 2) จังหวัดระยอง 21140"],
    ["C-0002", "บริษัท สยามโพลีเมอร์ เทค จำกัด", "0105557043218", "112 หมู่ 4 นิคมอุตสาหกรรมบางปู ตำบลแพรกษา อำเภอเมืองสมุทรปราการ จังหวัดสมุทรปราการ 10280", "คุณศุภชัย นิลวงศ์", "หัวหน้าแผนกซ่อมบำรุง", "089-552-0147", "supachai@siampolymer.example", "จัดส่งทางรถขนส่ง", "ถังเก็บกรดไลน์ใหม่", ""],
    ["C-0003", "บริษัท อีสเทิร์น ซีบอร์ด เคมิคอล จำกัด", "0215560078123", "7 ถนนไอ-แปด นิคมอุตสาหกรรมมาบตาพุด ตำบลมาบตาพุด อำเภอเมืองระยอง จังหวัดระยอง 21150", "คุณกานต์ธิดา สมบูรณ์ชัย", "วิศวกรสิ่งแวดล้อม", "086-771-2030", "kanthida@esbchem.example", "ลูกค้ารับเอง", "Scrubber หอกลั่นที่ 3", ""],
    ["C-0004", "บริษัท ไทยรุ่งเรือง อิเล็กโทรเพลทติ้ง จำกัด", "0105545021987", "59/3 ซอยพุทธบูชา 36 แขวงบางมด เขตทุ่งครุ กรุงเทพฯ 10140", "คุณประเสริฐ ทองคำ", "ผู้จัดการโรงงาน", "081-907-4466", "prasert@thairungrueng.example", "จัดส่งทางรถขนส่ง", "ระบบดูดไอกรดบ่อชุบ", ""],
    ["C-0005", "บริษัท กรีนวอเตอร์ เอ็นจิเนียริ่ง จำกัด", "0105562011456", "222/5 ถนนรามอินทรา แขวงคันนายาว เขตคันนายาว กรุงเทพฯ 10230", "คุณอัญชลี แสงอรุณ", "Project Manager", "092-418-3355", "anchalee@greenwater.example", "จัดส่งทางรถขนส่ง", "ระบบบำบัดน้ำเสีย โรงงานอาหาร", ""],
    ["C-0006", "บริษัท บางปู ฟู้ด อินดัสทรี จำกัด", "0115551023344", "333 หมู่ 2 ถนนสุขุมวิท ตำบลบางปูใหม่ อำเภอเมืองสมุทรปราการ จังหวัดสมุทรปราการ 10280", "คุณธีรพงษ์ ชาญเวช", "ผู้จัดการฝ่ายผลิต", "081-650-9921", "teerapong@bangpoofood.example", "จัดส่งทางรถขนส่ง", "ระบบกำจัดกลิ่นห้องต้ม", ""],
    ["C-0007", "บริษัท มาบตาพุด รีไฟน์นิ่ง ซัพพลาย จำกัด", "0215558034567", "48/1 ถนนสุขุมวิท ตำบลห้วยโป่ง อำเภอเมืองระยอง จังหวัดระยอง 21150", "คุณจักรพันธ์ ศรีสมบัติ", "จัดซื้ออาวุโส", "087-233-6610", "jakkapan@mtprs.example", "จัดส่งทางรถขนส่ง", "ถังเก็บโซดาไฟ", ""],
    ["C-0008", "บริษัท นวนคร พลาสติก จำกัด", "0135553009871", "101/45 นิคมอุตสาหกรรมนวนคร ตำบลคลองหนึ่ง อำเภอคลองหลวง จังหวัดปทุมธานี 12120", "คุณเพ็ญศรี บุญยืน", "ผู้จัดการทั่วไป", "085-119-7720", "pensri@navanakornplastic.example", "จัดส่งทางรถขนส่ง", "ระบบดักฝุ่นห้องบด", ""],
    ["C-0009", "บริษัท เจริญชัย เพนท์ จำกัด", "0105538007766", "15 ถนนเพชรเกษม แขวงบางแค เขตบางแค กรุงเทพฯ 10160", "คุณมาลัย เจริญชัย", "เจ้าของกิจการ", "02-454-1180", "malai@charoenchaipaint.example", "จัดส่งทางรถขนส่ง", "", ""],
    ["C-0010", "บริษัท โชคดี เทรดดิ้ง จำกัด", "0105549015532", "9 ถนนเจริญกรุง แขวงวัดพระยาไกร เขตบางคอแหลม กรุงเทพฯ 10120", "คุณสมหญิง ใจงาม", "จัดซื้อ", "089-001-2233", "somying@chokdee.example", "ลูกค้ารับเอง", "", ""],
  ];
  at(`${START} 11:00`, "customers", async () => {
    for (const [code, companyName, taxId, address, contactName, position, phone, email, deliveryMethod, projectName, deliveryAddress] of CU) {
      const r = await api("sales01", "POST", "/customers", {
        code, companyName, taxId, address, contactName, phone, email, deliveryMethod, projectName,
        deliveryAddress: deliveryAddress || address, apContactName: "", apContactPhone: "", apContactEmail: "", billingConditions: "", requiresReport: false, isActive: true,
      });
      S.cust[companyName] = { id: r.customer.id, code, companyName, taxId, address, contactName, position, phone, email, deliveryMethod, projectName, deliveryAddress: deliveryAddress || address };
    }
  });
  at("2026-06-10 16:00", "customer inactive", async () => {
    await api("admin", "PATCH", `/customers/${S.cust["บริษัท เจริญชัย เพนท์ จำกัด"].id}`, { isActive: false });
  });
  at("2026-07-02 09:15", "customer archived", async () => {
    await api("admin", "POST", `/customers/${S.cust["บริษัท โชคดี เทรดดิ้ง จำกัด"].id}/archive`, { isDeleted: true });
  });

  // ── quotation templates ──
  at(`${START} 11:30`, "quotation templates", async () => {
    await api("admin", "POST", "/quotation-templates/import");
    const { templates } = await api("admin", "GET", "/quotation-templates?includeArchived=true");
    S.tpl = Object.fromEntries(templates.map((t) => [t.templateCode, t]));
    // link one Wet Scrubber item to the product catalogue (shows its code in the editor)
    const full = (await api("admin", "GET", `/quotation-templates/${S.tpl["SC-WET-SCRUBBER"].id}`)).template;
    S.tplFull = { "SC-WET-SCRUBBER": full };
    const sections = full.sections.map((s) => ({ ...s, items: s.items.map((it) => ({ ...it })) }));
    const target = sections.flatMap((s) => s.items).find((it) => /blower|fan|พัดลม/i.test(it.name)) ?? sections[0].items[0];
    target.productId = S.prod["EQ-0005"].id;
    const { id, templateCode, templateName, jobTypeCode, jobTypeName, description, version, defaultTerms, internalNotes, isActive } = full;
    await api("admin", "PATCH", `/quotation-templates/${id}`, { templateCode, templateName, jobTypeCode, jobTypeName, description, version, sections, defaultTerms, internalNotes, isActive });
    for (const code of ["SC-ACTIVATED-CARBON", "BF-BAG-FILTER", "TA-FRP-TANK", "LI-FRP-LINING"]) {
      S.tplFull[code] = (await api("admin", "GET", `/quotation-templates/${S.tpl[code].id}`)).template;
    }
  });
  at("2026-03-12 10:00", "manual templates", async () => {
    const a = await api("admin", "POST", "/quotation-templates", {
      templateCode: "SC-BIO-ODOR", templateName: "Bio Scrubber กำจัดกลิ่น (ร่าง)", jobTypeCode: "BI", jobTypeName: "Bio Scrubber",
      description: "ระบบกำจัดกลิ่นด้วยจุลินทรีย์ สำหรับโรงงานอาหาร", version: "0.9", isActive: false,
      sections: [{ title: "ตัวระบบ", items: [
        { itemType: "item", name: "Bio Scrubber Tower FRP Ø 1,800 mm", unit: "ชุด", quantity: 1, subDetails: ["Media: Plastic Pall Ring", "Nutrient dosing pump"] },
        { itemType: "item", name: "Recirculation pump", unit: "ชุด", quantity: 1, subDetails: [] },
        { itemType: "specification", name: "ประสิทธิภาพการกำจัดกลิ่น ≥ 90%", unit: "", quantity: null, subDetails: [] }] }],
      defaultTerms: [{ type: "paymentTerm", text: "30% Down Payment / 60% After Delivery / 10% After Job Complete" }], internalNotes: [],
    });
    const b = await api("admin", "POST", "/quotation-templates", {
      templateCode: "TA-OLD-2024", templateName: "ถัง FRP แบบเดิม (ปี 2567)", jobTypeCode: "TA", jobTypeName: "Fiberglass Tank",
      description: "แบบเก่า เลิกใช้แล้ว", version: "1.0", isActive: true,
      sections: [{ title: "ถังเก็บ", items: [{ itemType: "item", name: "ถัง FRP ตั้งพื้น 5,000 ลิตร", unit: "ใบ", quantity: 1, subDetails: [] }] }],
      defaultTerms: [], internalNotes: [],
    });
    await api("admin", "PATCH", `/quotation-templates/${b.template.id}`, { isDeleted: true });
    void a;
  });

  // ── service templates ──
  at(`${START} 11:45`, "service templates", async () => {
    const { serviceTemplates } = await api("admin", "GET", "/service-templates");
    S.svcTpl = Object.fromEntries(serviceTemplates.map((t) => [t.templateCode, t]));
    const c = await api("admin", "POST", "/service-templates", {
      templateName: "Service Check Sheet - ระบบดักฝุ่น (Dust Collector)", description: "ตรวจเช็คระบบดักฝุ่นแบบถุงกรองประจำไตรมาส",
      sections: [{ key: "dc", title: "ระบบดักฝุ่น", isOptionalAddon: false, groups: [
        { key: "bag", title: "ถุงกรองและโครงตะกร้า", items: [{ key: "bag.condition", label: "สภาพถุงกรอง", kind: "normalAbnormal" }, { key: "bag.cage", label: "โครงตะกร้า", kind: "normalAbnormal" }, { key: "bag.dp", label: "ความดันตกคร่อม", kind: "measurement", unit: "mmAq" }] },
        { key: "pulse", title: "ระบบพัลส์เจ็ท", items: [{ key: "pulse.valve", label: "Diaphragm valve", kind: "normalAbnormal" }, { key: "pulse.air", label: "แรงดันลม", kind: "measurement", unit: "bar" }] }] }],
    });
    S.svcTpl.custom = c.serviceTemplate;
    const d = await api("admin", "POST", "/service-templates", {
      templateName: "แบบตรวจเช็คปั๊มสารเคมี (ฉบับเดิม)", description: "เลิกใช้ ย้ายไปรวมในแบบระบบบำบัดอากาศ",
      sections: [{ key: "pump", title: "ปั๊ม", isOptionalAddon: false, groups: [{ key: "p", title: "ปั๊มสารเคมี", items: [{ key: "p.leak", label: "การรั่วซึม", kind: "normalAbnormal" }] }] }],
    });
    await api("admin", "POST", `/service-templates/${d.serviceTemplate.id}/archive`, { isDeleted: true });
  });
}

// Sales side: quotations (every status), Scope of Work, delivery orders, AR billing, service reports.
async function salesData(C, A, S) {
  const { at, api, enc, addDays } = C;
  S.q = {}; S.sow = {}; S.do = {};

  // ── line builders ──
  let lid = 0;
  const L = (description, unit, qty, unitPrice, subs = [], tags = []) => ({
    id: ++lid, description, unit, qty, unitPrice, discount: 0, discountMode: "percent", tags,
    subDetails: subs.map((t, i) => ({ id: `sd-${lid}-${i + 1}`, text: t })), isSectionHeader: false,
  });
  const H = (description) => ({ id: ++lid, description, unit: "", qty: 0, unitPrice: 0, discount: 0, discountMode: "percent", tags: [], subDetails: [], isSectionHeader: true });

  const LINES = {
    SC: () => [H("งานระบบ Wet Scrubber"),
      L("Wet Scrubber FRP 5,000 CMH", "ชุด", 1, 680000, ["วัสดุ FRP Vinyl Ester ทนกรด-ด่าง", "Packing: PP Pall Ring 2 นิ้ว สูง 1.5 m"], ["ผลิตเอง", "รับประกัน 1 ปี"]),
      L("Blower FRP 7.5 kW", "ชุด", 1, 128000, ["Centrifugal Blower ใบพัด FRP", "Motor 7.5 kW IE3"]),
      L("ท่อ FRP Ø 300 mm", "เมตร", 24, 2850, ["หนา 5 mm พร้อมหน้าแปลน"]),
      H("งานติดตั้ง"),
      L("ค่าติดตั้งและทดสอบระบบ", "งาน", 1, 45000, ["รวมเครนและนั่งร้าน", "ทดสอบ Air flow ก่อนส่งมอบ"])],
    SC_BIG: () => [H("งานระบบ Wet Scrubber"),
      L("Wet Scrubber FRP 5,000 CMH", "ชุด", 1, 680000, ["วัสดุ FRP Vinyl Ester ทนกรด-ด่าง", "Packing: PP Pall Ring 2 นิ้ว"], ["ผลิตเอง", "รับประกัน 1 ปี"]),
      L("Blower FRP 7.5 kW", "ชุด", 1, 128000, ["Centrifugal Blower ใบพัด FRP"]),
      L("ปั๊มสารเคมี Magnetic Drive 1.5 kW", "ชุด", 2, 38500, ["ปั๊มหมุนเวียนน้ำยา NaOH"]),
      L("ท่อ FRP Ø 300 mm", "เมตร", 36, 2850, ["หนา 5 mm พร้อมหน้าแปลน"]),
      H("งานโครงสร้างและติดตั้ง"),
      L("ตะแกรง FRP Grating 38 mm", "ตร.ม.", 12, 3900, ["ทางเดินบำรุงรักษารอบ Scrubber"]),
      L("ค่าติดตั้งและทดสอบระบบ", "งาน", 1, 45000, ["รวมเครนและนั่งร้าน"])],
    TANKSC: () => [H("งานถังเก็บและระบบบำบัดไอกรด"),
      L("ถังเก็บสารเคมี FRP 2,000 ลิตร", "ใบ", 2, 85000, ["Ø 1,400 x H 1,500 mm", "ทนกรดเกลือ 35%"], ["ผลิตเอง"]),
      L("Wet Scrubber FRP 5,000 CMH", "ชุด", 1, 680000, ["ดูดไอกรดจากถังเก็บ"]),
      L("ปั๊มสารเคมี Magnetic Drive 1.5 kW", "ชุด", 2, 38500, ["ปั๊มถ่ายสารเคมี"]),
      L("ท่อ FRP Ø 300 mm", "เมตร", 24, 2850, ["หนา 5 mm"])],
    TA: () => [H("งานถังเก็บสารเคมี"),
      L("ถังเก็บสารเคมี FRP 10,000 ลิตร", "ใบ", 2, 265000, ["Ø 2,400 x H 2,500 mm", "Resin Vinyl Ester"], ["ผลิตเอง"]),
      L("ปั๊มสารเคมี Magnetic Drive 1.5 kW", "ชุด", 2, 38500, ["พร้อมฐานและท่อด้านดูด"]),
      L("ค่าขนส่งและเครน", "เที่ยว", 2, 12000, ["รถเครน 25 ตัน"]),
      L("ค่าติดตั้งและทดสอบระบบ", "งาน", 1, 45000, ["ทดสอบรั่วด้วยน้ำ 24 ชม."])],
    LI: () => [H("งานบุผิว FRP"),
      L("งานบุผิว FRP Lining", "ตร.ม.", 120, 2400, ["Corrosion layer 2.5 mm", "Resin Vinyl Ester"]),
      L("ค่าเตรียมผิว Sandblast", "ตร.ม.", 120, 350, ["Sa 2½"]),
      L("ค่าติดตั้งและทดสอบระบบ", "งาน", 1, 45000, ["Spark test"])],
    AC: () => [H("งานระบบ Activated Carbon"),
      L("Activated Carbon Filter Box 3,000 CMH", "ชุด", 1, 245000, ["โครง SUS304", "Carbon bed 2 ชั้น"]),
      L("ถ่านกัมมันต์ (Activated Carbon)", "kg", 600, 140, ["Coconut shell 4x8 mesh"]),
      L("Blower FRP 7.5 kW", "ชุด", 1, 128000, ["Centrifugal"]),
      L("ค่าติดตั้งและทดสอบระบบ", "งาน", 1, 45000, ["รวมงานท่อเชื่อมต่อ"])],
    BF: () => [H("งานระบบดักฝุ่น"),
      L("Dust Collector (Bag Filter) 64 ถุง", "ชุด", 1, 540000, ["Pulse jet", "ถุงกรอง Polyester 550 g/m²"]),
      L("Blower FRP 7.5 kW", "ชุด", 1, 128000, ["Motor 7.5 kW"]),
      L("ท่อ FRP Ø 300 mm", "เมตร", 30, 2850, ["ท่อดูดจุดบด"]),
      L("ค่าติดตั้งและทดสอบระบบ", "งาน", 1, 45000, ["รวมเครน"])],
    GA: () => [H("งานตะแกรง FRP"),
      L("ตะแกรง FRP Grating 38 mm", "ตร.ม.", 80, 3900, ["Mesh 38x38 mm สีเหลือง"]),
      L("ค่าติดตั้งและทดสอบระบบ", "งาน", 1, 45000, ["ยึดด้วย Clip SUS304"])],
    PM: () => [H("งานบริการ"),
      L("ค่าบริการตรวจเช็คระบบประจำปี (PM)", "ครั้ง", 4, 18000, ["ทุก 3 เดือน", "พร้อมรายงานผลตรวจ"]),
      L("หัวสเปรย์ Nozzle PP 1/2 นิ้ว", "ตัว", 12, 280, ["เปลี่ยนตามรอบ PM"])],
    WTP: () => [H("งานระบบบำบัดน้ำ"),
      L("ถังเก็บสารเคมี FRP 10,000 ลิตร", "ใบ", 1, 265000, ["ถังพักน้ำเสีย"]),
      L("ปั๊มสารเคมี Magnetic Drive 1.5 kW", "ชุด", 2, 38500, ["ปั๊มจ่ายสารปรับ pH"]),
      L("ค่าติดตั้งและทดสอบระบบ", "งาน", 1, 45000, [""].filter(Boolean))],
  };
  const TPL = { SC: "SC-WET-SCRUBBER", SC_BIG: "SC-WET-SCRUBBER", TANKSC: "SC-WET-SCRUBBER", TA: "TA-FRP-TANK", LI: "LI-FRP-LINING", AC: "SC-ACTIVATED-CARBON", BF: "BF-BAG-FILTER" };
  const JT = { SC: "SC", SC_BIG: "SC", TANKSC: "SC", TA: "TA", LI: "LI", AC: "SC", BF: "BF", GA: "GA", PM: "OTHER SC", WTP: "WTP" };
  const PAY = {
    std: "30% Down Payment / 40% After Delivery (Credit 30 Days) / 30% After Job Complete (Credit 30 Days)",
    two: "30% Down Payment / 70% After Delivery (Credit 30 Days)",
    pm: "ชำระรายครั้งหลังเข้าบริการ เครดิต 30 วัน",
  };

  // ── quotation flow ──
  // outcome: draft | pending | approved | sent | won | custRejected | lost | rejected
  function quote(key, o) {
    const date = o.date;
    const t = o.time ?? "10:15";
    at(`${date} ${t}`, `quote ${key} create`, async () => {
      const c = S.cust[o.cust];
      const kind = o.kind;
      const lines = o.lines ? o.lines() : LINES[kind]();
      const body = {
        client: c.companyName, customerId: c.id, jobTypeCode: JT[kind],
        salesperson: S.name(o.owner),
        contacts: [{ name: c.contactName, position: c.position, phone: c.phone, email: c.email }],
        address: c.address, taxId: c.taxId, deliveryMethod: c.deliveryMethod, deliveryAddress: c.deliveryAddress,
        project: o.project ?? c.projectName, poRef: "", paymentTerms: o.pay ?? (kind === "PM" ? PAY.pm : PAY.std),
        issueDate: date, expiryDate: addDays(date, 30), followUpDate: o.followUp ?? "",
        remarks: o.remarks ?? "ราคานี้ยังไม่รวมงานไฟฟ้าควบคุม (MCC) และงานฐานราก",
        isPotentialOpportunity: !!o.potential, discount: o.discount ?? 0, discountMode: "percent", lines,
      };
      if (TPL[kind] && S.tpl[TPL[kind]]) body.quotationTemplateId = S.tpl[TPL[kind]].id;
      const r = await api(o.owner, "POST", "/quotes", body);
      S.q[key] = r.quote.id;
      if (o.interest) await api(o.owner, "PATCH", `/quotes/${enc(r.quote.id)}`, { interest: o.interest });
    });
    const wf = (when, user, action, comment = "") => at(when, `quote ${key} ${action}`, () => api(user, "POST", `/quotes/${enc(S.q[key])}/workflow`, { action, comment, draft: {} }));
    const out = o.outcome;
    if (out === "draft") return;
    const sub = o.submitAt ?? `${date} 16:20`;
    wf(sub, o.owner, "submitted");
    if (out === "pending") return;
    if (out === "rejected") { wf(o.rejectAt ?? `${addDays(date, 1)} 09:40`, "mgr01", "rejected", o.rejectComment); return; }
    wf(o.approveAt ?? `${addDays(date, 1)} 09:30`, o.approver ?? "mgr01", "approved", "อนุมัติ");
    if (out === "approved") return;
    wf(o.sentAt ?? `${addDays(date, 1)} 14:10`, o.owner, "sent_to_customer");
    if (out === "sent") return;
    if (out === "won") {
      wf(o.acceptAt ?? `${addDays(date, 6)} 11:00`, o.owner, "customer_accepted");
      wf(o.wonAt ?? `${addDays(date, 7)} 10:00`, o.owner, "marked_won");
      return;
    }
    wf(o.custRejectAt ?? `${addDays(date, 8)} 15:30`, o.owner, "customer_rejected", o.custRejectComment ?? "ลูกค้าเลือกผู้รับเหมารายอื่นที่ราคาต่ำกว่า");
    if (out === "lost") wf(o.lostAt ?? `${addDays(date, 9)} 10:00`, o.owner, "marked_lost", "");
  }

  const EX = "บริษัท ตัวอย่าง จำกัด";
  // won — one or two per month so the revenue chart has shape
  quote("W1", { date: "2025-10-08", owner: "sales01", cust: "บริษัท สยามโพลีเมอร์ เทค จำกัด", kind: "TA", outcome: "won", interest: "น่าสนใจ" });
  quote("W2", { date: "2025-11-12", owner: "sales02", cust: "บริษัท อีสเทิร์น ซีบอร์ด เคมิคอล จำกัด", kind: "SC", outcome: "won", pay: PAY.two });
  quote("W3", { date: "2025-12-03", owner: "sales04", cust: "บริษัท ไทยรุ่งเรือง อิเล็กโทรเพลทติ้ง จำกัด", kind: "AC", outcome: "won" });
  quote("L1", { date: "2025-12-15", owner: "sales02", cust: "บริษัท เจริญชัย เพนท์ จำกัด", kind: "SC", outcome: "lost" });
  quote("W4", { date: "2026-01-14", owner: "sales01", cust: EX, kind: "LI", outcome: "won", pay: PAY.two, project: "บุผิวบ่อบำบัดกรด" });
  quote("W5", { date: "2026-02-10", owner: "sales02", cust: "บริษัท บางปู ฟู้ด อินดัสทรี จำกัด", kind: "AC", outcome: "won", pay: PAY.two });
  quote("W6", { date: "2026-03-05", owner: "sales03", cust: "บริษัท กรีนวอเตอร์ เอ็นจิเนียริ่ง จำกัด", kind: "PM", outcome: "won" });
  quote("W7", { date: "2026-03-24", owner: "sales01", cust: "บริษัท นวนคร พลาสติก จำกัด", kind: "BF", outcome: "won", pay: PAY.two });
  quote("L2", { date: "2026-04-08", owner: "sales04", cust: "บริษัท ไทยรุ่งเรือง อิเล็กโทรเพลทติ้ง จำกัด", kind: "BF", outcome: "lost" });
  quote("W8", { date: "2026-04-20", owner: "sales02", cust: "บริษัท มาบตาพุด รีไฟน์นิ่ง ซัพพลาย จำกัด", kind: "TA", outcome: "won" });
  quote("W9", { date: "2026-05-18", owner: "sales01", cust: EX, kind: "TA", outcome: "won", pay: PAY.two, project: "ถังเก็บโซดาไฟ อาคาร 1" });
  quote("W10", { date: "2026-06-15", owner: "sales04", cust: "บริษัท สยามโพลีเมอร์ เทค จำกัด", kind: "GA", outcome: "won", pay: PAY.two });
  quote("W11", { date: "2026-07-01", owner: "sales01", cust: EX, kind: "SC_BIG", outcome: "won", interest: "น่าสนใจ", pay: "30% Down Payment / 60% After Delivery (Credit 30 Days) / 10% After Job Complete (Credit 30 Days)" });
  quote("L3", { date: "2026-07-20", owner: "sales02", cust: "บริษัท นวนคร พลาสติก จำกัด", kind: "LI", outcome: "lost" });
  quote("W12", { date: "2026-07-27", owner: "sales01", cust: EX, kind: "TANKSC", outcome: "won", project: "ถังเก็บกรดและระบบดูดไอกรด" });
  quote("CR1", { date: "2026-08-12", owner: "sales02", cust: "บริษัท มาบตาพุด รีไฟน์นิ่ง ซัพพลาย จำกัด", kind: "SC", outcome: "custRejected", potential: true, followUp: "2026-09-26", custRejectComment: "ลูกค้าขอเลื่อนงบประมาณไปปีหน้า" });
  quote("W13", { date: "2026-08-17", owner: "sales02", cust: "บริษัท อีสเทิร์น ซีบอร์ด เคมิคอล จำกัด", kind: "AC", outcome: "won", interest: "น่าสนใจ" });
  quote("W14", { date: "2026-08-27", owner: "sales01", cust: EX, kind: "SC", outcome: "won", project: "ระบบดูดไอกรด ห้องชุบ" });
  quote("W10b", { date: "2026-08-28", owner: "sales02", cust: "บริษัท นวนคร พลาสติก จำกัด", kind: "BF", outcome: "won", pay: PAY.two, project: "ระบบดักฝุ่นห้องบด เฟส 2" });
  quote("S1", { date: "2026-09-01", owner: "sales02", cust: "บริษัท สยามโพลีเมอร์ เทค จำกัด", kind: "TA", outcome: "sent", potential: true, interest: "น่าสนใจ", followUp: "2026-09-25" });
  quote("W15", { date: "2026-09-03", owner: "sales01", cust: EX, kind: "TA", outcome: "won", project: "ถังเก็บกรดไลน์ 3" });
  quote("W16", { date: "2026-09-08", owner: "sales03", cust: "บริษัท บางปู ฟู้ด อินดัสทรี จำกัด", kind: "PM", outcome: "won" });
  quote("CR2", { date: "2026-09-10", owner: "sales01", cust: "บริษัท กรีนวอเตอร์ เอ็นจิเนียริ่ง จำกัด", kind: "WTP", outcome: "custRejected", followUp: "2026-10-08", custRejectComment: "ลูกค้าขอให้ปรับสเปกถังใหม่ จะส่งแบบมาอีกครั้ง" });
  quote("X1", { date: "2026-09-14", owner: "sales02", cust: "บริษัท บางปู ฟู้ด อินดัสทรี จำกัด", kind: "SC", outcome: "rejected", rejectComment: "ราคา Blower ต่ำกว่าทุน กรุณาปรับราคาและแนบใบเสนอราคาผู้ขาย", project: "ระบบดูดไอกรดห้องล้าง" });
  at("2026-09-16 10:05", "X1 rewrite", async () => {
    const r = await api("sales02", "POST", `/quotes/${enc(S.q.X1)}/rewrite`);
    S.q.X1R1 = r.quote.id;
    const lines = r.quote.lines.map((l) => (l.description.startsWith("Blower") ? { ...l, unitPrice: 142000 } : l));
    await api("sales02", "PATCH", `/quotes/${enc(S.q.X1R1)}`, { lines, revisionNote: "ปรับราคา Blower ตามใบเสนอราคาผู้ขาย" });
    await api("admin", "POST", `/quotes/${enc(S.q.X1)}/workflow`, { action: "cancelled", comment: "แก้ไขเป็นฉบับ R1", draft: {} });
    C.setClock("2026-09-16 14:30");
    await api("sales02", "POST", `/quotes/${enc(S.q.X1R1)}/workflow`, { action: "submitted", comment: "", draft: {} });
    C.setClock("2026-09-17 09:15");
    await api("mgr01", "POST", `/quotes/${enc(S.q.X1R1)}/workflow`, { action: "approved", comment: "อนุมัติ", draft: {} });
    C.setClock("2026-09-17 13:40");
    await api("sales02", "POST", `/quotes/${enc(S.q.X1R1)}/workflow`, { action: "sent_to_customer", comment: "", draft: {} });
    await api("sales02", "PATCH", `/quotes/${enc(S.q.X1R1)}`, { followUpDate: "2026-09-29", isPotentialOpportunity: true });
  });
  quote("S2", { date: "2026-09-18", owner: "sales01", cust: "บริษัท อีสเทิร์น ซีบอร์ด เคมิคอล จำกัด", kind: "BF", outcome: "sent", potential: true, followUp: "2026-10-06" });
  quote("A1", { date: "2026-09-22", owner: "sales01", cust: EX, kind: "SC", outcome: "approved", potential: true, project: "ระบบบำบัดอากาศ อาคารผลิต 3" });
  quote("A2", { date: "2026-09-24", owner: "sales03", cust: "บริษัท บางปู ฟู้ด อินดัสทรี จำกัด", kind: "PM", outcome: "approved" });
  quote("P1", { date: "2026-09-25", owner: "sales01", cust: "บริษัท นวนคร พลาสติก จำกัด", kind: "AC", outcome: "pending", potential: true, followUp: "2026-10-02", submitAt: "2026-09-26 11:10" });
  quote("P2", { date: "2026-09-28", owner: "sales02", cust: "บริษัท กรีนวอเตอร์ เอ็นจิเนียริ่ง จำกัด", kind: "TA", outcome: "pending", submitAt: "2026-09-28 15:45", followUp: "2026-10-05" });
  quote("D2", { date: "2026-09-30", owner: "sales02", cust: "บริษัท มาบตาพุด รีไฟน์นิ่ง ซัพพลาย จำกัด", kind: "TA", outcome: "draft", time: "11:20" });
  quote("D1", { date: "2026-09-30", owner: "sales01", cust: EX, kind: "SC", outcome: "draft", time: "15:05", discount: 5, project: "ระบบดูดไอกรด อาคารผลิต 2 (เฟส 2)", followUp: "2026-10-09" });
  quote("P3", { date: "2026-10-01", owner: "sales03", cust: "บริษัท อีสเทิร์น ซีบอร์ด เคมิคอล จำกัด", kind: "PM", outcome: "pending", time: "08:40", submitAt: "2026-10-01 09:05" });
  at("2026-08-31 17:30", "suspend sales04", () => api("admin", "PATCH", `/users/${S.user.sales04.id}`, { status: "inactive" }));

  // ── Scope of Work ──
  const CHECK_BASE = [
    { key: "safety", options: [{ key: "general", checked: true }] },
    { key: "transportation", options: [{ key: "has", checked: true }] },
    { key: "logo", options: [{ key: "huma", checked: true }] },
    { key: "namePlate", options: [{ key: "sticker", checked: true }] },
    { key: "pj2", options: [{ key: "none", checked: true }] },
    { key: "billingConditions", options: [{ key: "none", checked: true }] },
    { key: "deliveryDocFormat", options: [{ key: "companyForm", checked: true }] },
  ];
  const inst = {
    std: [{ id: "pay-dp", pct: 30, label: "Down Payment", paymentType: "Cash", days: null }, { id: "pay-del", pct: 40, label: "After Delivery", paymentType: "Credit", days: 30 }, { id: "pay-fin", pct: 30, label: "After Job Complete", paymentType: "Credit", days: 30 }],
    two: [{ id: "pay-dp", pct: 30, label: "Down Payment", paymentType: "Cash", days: null }, { id: "pay-del", pct: 70, label: "After Delivery", paymentType: "Credit", days: 30 }],
    j1: [{ id: "pay-dp", pct: 30, label: "Down Payment", paymentType: "Cash", days: null }, { id: "pay-del", pct: 60, label: "After Delivery", paymentType: "Credit", days: 30 }, { id: "pay-fin", pct: 10, label: "After Job Complete", paymentType: "Credit", days: 30 }],
    half: [{ id: "pay-dp", pct: 50, label: "Down Payment", paymentType: "Cash", days: null }, { id: "pay-del", pct: 50, label: "After Delivery", paymentType: "Credit", days: 30 }],
  };
  // key: [quoteKey, scopeNumber, owner, created, installments, docsToSend, {po, addPo, submit, final, drawing, delivery}]
  function scope(key, o) {
    at(`${o.created} 09:20`, `sow ${key} create`, async () => {
      const r = await api(o.owner, "POST", "/scope-of-works", { quotationId: S.q[o.quote], scopeNumber: o.number });
      const sow = r.scopeOfWork;
      S.sow[key] = { id: sow.id, number: o.number, items: sow.items };
      const c = Object.values(S.cust).find((x) => x.companyName === sow.customerSnapshot.companyName);
      const docs = { key: "documentsToSend", note: o.docsNote ?? "", options: (o.docs ?? ["purchase", "factory"]).map((k) => ({ key: k, checked: true })) };
      await api(o.owner, "PATCH", `/scope-of-works/${sow.id}`, {
        deliveryDate: o.delivery, drawingCode: o.drawing ?? `DWG-${o.number.slice(2, 8)}-01`, deliveryLocation: c.deliveryAddress,
        shippingContact: c.contactName, shippingPhone: c.phone, billingContact: o.billing ?? "คุณจันทร์เพ็ญ บัญชีลูกหนี้", billingPhone: "02-555-0140",
        customerPoNumber: o.po ?? "", additionalPoNumbers: o.addPo ? [o.addPo] : [],
        paymentConditions: { description: "ตามเงื่อนไขในใบเสนอราคา", notes: "", installments: o.inst },
        checklistGroups: [...CHECK_BASE, docs],
        approver: { name: S.name("mgr01"), userId: S.user.mgr01.id, date: "" },
        ...(o.seller ? {} : {}),
      });
    });
    if (o.submit) at(o.submit, `sow ${key} submit`, () => api(o.owner, "POST", `/scope-of-works/${S.sow[key].id}/submit-approval`));
    if (o.final) at(o.final, `sow ${key} finalize`, () => api("mgr01", "POST", `/scope-of-works/${S.sow[key].id}/finalize`));
  }
  scope("W2", { quote: "W2", number: "PQ202511-034-SC-PN", owner: "sales02", created: "2025-11-20", inst: inst.two, po: "4500018832", delivery: "2026-01-15", submit: "2025-11-20 14:00", final: "2025-11-21 10:00" });
  scope("W4", { quote: "W4", number: "PQ202601-052-LI-OR", owner: "sales01", created: "2026-01-21", inst: inst.two, po: "TY-PO-2601-0021", delivery: "2026-03-10", submit: "2026-01-21 15:00", final: "2026-01-22 09:30" });
  scope("W5", { quote: "W5", number: "PQ202602-061-SC-PN", owner: "sales02", created: "2026-02-17", inst: inst.two, po: "BPF-26-0117", delivery: "2026-04-15", submit: "2026-02-17 14:00", final: "2026-02-18 09:30" });
  scope("W7", { quote: "W7", number: "PQ202603-066-BF-OR", owner: "sales01", created: "2026-03-31", inst: inst.two, po: "NNP-2603-77", delivery: "2026-05-25", submit: "2026-03-31 15:00", final: "2026-04-01 09:30" });
  scope("J7", { quote: "W8", number: "PQ202604-071-TA-PN", owner: "sales02", created: "2026-04-28", inst: inst.std, po: "MTP-PO-26-0412", delivery: "2026-06-10", submit: "2026-04-28 15:00", final: "2026-04-29 09:30" });
  scope("J8", { quote: "W9", number: "PQ202605-083-TA-OR", owner: "sales01", created: "2026-05-26", inst: inst.two, po: "TY-PO-2605-0188", delivery: "2026-06-20", submit: "2026-05-26 15:00", final: "2026-05-27 09:30" });
  scope("J6", { quote: "W10", number: "PQ202606-098-GA-MN", owner: "sales04", created: "2026-06-23", inst: inst.two, delivery: "2026-08-15", submit: "2026-06-23 15:00", final: "2026-06-24 10:00" });
  scope("J1", { quote: "W11", number: "PQ202607-112-SC-OR", owner: "sales01", created: "2026-07-09", inst: inst.j1, po: "TY-PO-2607-0451", addPo: "TY-PO-2608-0013", delivery: "2026-09-30", drawing: "DWG-SC-2607-112", docs: ["purchase", "factory"], submit: "2026-07-10 11:00", final: "2026-07-10 15:30" });
  scope("J2", { quote: "W12", number: "PQ202608-121-SC-OR", owner: "sales01", created: "2026-08-04", inst: inst.std, po: "TY-PO-2608-0102", delivery: "2026-10-20", docs: ["purchase", "factory", "project"], submit: "2026-08-05 10:30", final: "2026-08-05 16:00" });
  scope("J5", { quote: "W13", number: "PQ202608-127-SC-PN", owner: "sales02", created: "2026-08-25", inst: inst.std, delivery: "2026-11-10", submit: "2026-09-24 10:40" });
  scope("J10", { quote: "W10b", number: "PQ202609-129-BF-PN", owner: "sales02", created: "2026-09-04", inst: inst.two, po: "NNP-2609-12", delivery: "2026-11-30", submit: "2026-09-04 15:00", final: "2026-09-07 09:30" });
  scope("J3", { quote: "W14", number: "PQ202609-131-SC-OR", owner: "sales01", created: "2026-09-04", inst: inst.half, delivery: "2026-11-25", drawing: "DWG-SC-2609-131", docs: ["purchase", "factory", "other"], docsNote: "ส่งสำเนาให้ฝ่าย QC ตรวจแบบก่อนผลิต" });

  // J1: recipients, message, attachments, send
  at("2026-07-10 16:10", "J1 recipients + attachments", async () => {
    const id = S.sow.J1.id;
    await api("sales01", "PATCH", `/scope-of-works/${id}`, {
      documentRecipients: { purchase: [S.user.pur02.id], factory: [S.user.fac01.id], additional: [S.user.acc01.id] },
      documentRecipientMessage: "รบกวนฝ่ายจัดซื้อสั่ง Blower และวัสดุ FRP ตามรายการ ส่วนโรงงานเริ่มขึ้นรูป Scrubber ได้เลย กำหนดส่งปลายเดือนกันยายน",
    });
    await api("sales01", "POST", `/scope-of-works/${id}/attachments`, { fileName: "TY-PO-2607-0451.pdf", contentType: "application/pdf", dataBase64: A.pdf("Purchase Order TY-PO-2607-0451").toString("base64") });
    await api("sales01", "POST", `/scope-of-works/${id}/attachments`, { fileName: "site-layout-photo.jpg", contentType: "image/jpeg", dataBase64: (await A.sitePhoto(1)).toString("base64") });
    await api("sales01", "POST", `/scope-of-works/${id}/send-documents`);
  });
  at("2026-09-29 16:40", "J3 last touch", () => api("sales01", "PATCH", `/scope-of-works/${S.sow.J3.id}`, { remarks: "ลูกค้าขอให้ส่งแบบ Shop Drawing ก่อนผลิต 1 สัปดาห์" }));

  // ── delivery orders ──
  async function makeDo(key, sowKey, owner, pages) {
    const r = await api(owner, "POST", "/delivery-orders", { scopeOfWorkId: S.sow[sowKey].id });
    const d = r.deliveryOrder;
    S.do[key] = { id: d.id, installments: d.installments, items: d.items };
    const items = d.items.map((x) => x.id);
    const installments = d.installments.map((p, i) => ({ id: p.id, itemIds: (pages[i]?.items ?? []).map((n) => items[n]).filter(Boolean), documentNumber: pages[i]?.no ?? "", issueDate: pages[i]?.date ?? "", remark: pages[i]?.remark ?? p.remark }));
    await api(owner, "PATCH", `/delivery-orders/${d.id}`, { installments });
    return d.id;
  }
  at("2026-06-08 10:00", "DO J7", async () => {
    const id = await makeDo("J7", "J7", "sales02", [{ items: [0, 1], no: "DO2606-031", date: "2026-06-10" }, { items: [2, 3], no: "DO2607-007", date: "2026-07-08" }]);
    await api("sales02", "POST", `/delivery-orders/${id}/submit-approval`);
    await api("mgr01", "POST", `/delivery-orders/${id}/finalize`);
  });
  at("2026-06-18 10:00", "DO J8", async () => {
    const id = await makeDo("J8", "J8", "sales01", [{ items: [0, 1, 2, 3], no: "DO2606-044", date: "2026-06-20" }]);
    await api("sales01", "POST", `/delivery-orders/${id}/submit-approval`);
    await api("mgr01", "POST", `/delivery-orders/${id}/finalize`);
  });
  at("2026-08-12 10:00", "DO J6", async () => {
    const id = await makeDo("J6", "J6", "sales04", [{ items: [0, 1], no: "DO2608-019", date: "2026-08-14" }]);
    await api("sales04", "POST", `/delivery-orders/${id}/submit-approval`);
    C.setClock("2026-08-13 09:30");
    await api("mgr01", "POST", `/delivery-orders/${id}/finalize`);
  });
  at("2026-08-20 10:30", "DO J1", async () => {
    const id = await makeDo("J1", "J1", "sales01", [{ items: [0, 1, 2, 3, 4], no: "DO2608-052", date: "2026-08-24" }, { items: [5], no: "", date: "" }]);
    await api("sales01", "POST", `/delivery-orders/${id}/submit-approval`);
    C.setClock("2026-08-21 09:10");
    await api("mgr01", "POST", `/delivery-orders/${id}/finalize`);
  });
  at("2026-09-21 14:00", "DO J10", async () => { const id = await makeDo("J10", "J10", "sales02", [{ items: [0, 1, 2, 3], no: "DO2609-058", date: "2026-09-29" }]); C.setClock("2026-09-28 10:20"); await api("sales02", "POST", `/delivery-orders/${id}/submit-approval`); });
  at("2026-09-24 11:30", "DO J2 draft", async () => {
    const id = await makeDo("J2", "J2", "sales01", [
      { items: [0, 2], no: "DO2609-061", date: "2026-09-26", remark: "40% After Delivery (Credit 30 Days) — ส่งถังเก็บและปั๊ม" },
      { items: [1] },
    ]);
    await api("sales01", "POST", `/delivery-orders/${id}/attachments`, { fileName: "ใบส่งมอบงวด1-ลงนาม.jpg", contentType: "image/jpeg", dataBase64: (await A.deliveryNoteScan()).toString("base64") });
    await api("sales01", "POST", `/delivery-orders/${id}/send-to-departments`, { departmentIds: [S.dept.Project] });
  });

  // ── AR billing ──
  async function bill(sowKey, instId, { work = "goods", receipt } = {}) {
    const m = (await api("acc01", "POST", "/ar-milestones/open", { scopeOfWorkId: S.sow[sowKey].id, installmentId: instId })).milestone;
    const isDp = instId === "pay-dp";
    await api("acc01", "PATCH", `/ar-milestones/${m.id}`, { workClassification: work, checklistState: isDp ? { poCopy: true } : { poCopy: true, deliveryNote: true } });
    const r = await api("acc01", "POST", "/ar-documents", { milestoneId: m.id });
    const principal = r.documents[0];
    return principal;
  }
  const receipt = (docId) => api("acc01", "POST", `/ar-documents/${docId}/receipt`);
  S.ar = {};
  const billAt = (when, key, sowKey, instId, opts) => at(when, `AR ${key}`, async () => { S.ar[key] = await bill(sowKey, instId, opts); });
  const payAt = (when, key) => at(when, `RE ${key}`, () => receipt(S.ar[key].id));
  billAt("2025-11-25 10:00", "W2dp", "W2", "pay-dp"); payAt("2025-12-05 14:00", "W2dp");
  billAt("2026-01-20 10:00", "W2iv", "W2", "pay-del"); payAt("2026-02-18 11:00", "W2iv");
  billAt("2026-01-26 10:00", "W4dp", "W4", "pay-dp", { work: "service" }); payAt("2026-02-03 14:00", "W4dp");
  billAt("2026-03-16 10:00", "W4iv", "W4", "pay-del", { work: "service" }); payAt("2026-04-15 11:00", "W4iv");
  billAt("2026-02-20 10:00", "W5dp", "W5", "pay-dp"); payAt("2026-03-02 14:00", "W5dp");
  billAt("2026-04-20 10:00", "W5iv", "W5", "pay-del"); payAt("2026-05-21 11:00", "W5iv");
  billAt("2026-04-03 10:00", "W7dp", "W7", "pay-dp"); payAt("2026-04-10 14:00", "W7dp");
  billAt("2026-05-28 10:00", "W7iv", "W7", "pay-del"); payAt("2026-06-29 11:00", "W7iv");
  billAt("2026-04-30 10:00", "J7dp", "J7", "pay-dp"); payAt("2026-05-06 14:00", "J7dp");
  billAt("2026-06-15 10:00", "J7iv", "J7", "pay-del"); payAt("2026-07-14 11:00", "J7iv");
  billAt("2026-05-28 10:30", "J8dp", "J8", "pay-dp"); payAt("2026-06-04 14:00", "J8dp");
  billAt("2026-06-25 10:00", "J8iv", "J8", "pay-del");
  billAt("2026-06-25 10:30", "J6dp", "J6", "pay-dp"); payAt("2026-07-03 14:00", "J6dp");
  billAt("2026-07-14 10:00", "J1dp", "J1", "pay-dp"); payAt("2026-07-28 14:00", "J1dp");
  billAt("2026-08-12 10:00", "J2dp", "J2", "pay-dp");
  at("2026-09-12 10:00", "manual IV (Sep)", async () => {
    const c = S.cust["บริษัท กรีนวอเตอร์ เอ็นจิเนียริ่ง จำกัด"];
    const r = await api("acc01", "POST", "/ar-documents/manual", {
      docType: "IV", customer: { companyName: c.companyName, address: c.address, taxId: c.taxId, branch: "สำนักงานใหญ่", contactName: c.contactName, phone: c.phone, email: c.email },
      lines: [{ description: "ซีลปั๊ม Mechanical Seal 1.5 นิ้ว", qty: 2, unitPrice: 3200, unit: "ชุด" }, { description: "หัวสเปรย์ Nozzle PP 1/2 นิ้ว", qty: 10, unitPrice: 280, unit: "ตัว" }],
      remarks: ["อะไหล่สำหรับงาน PM ไตรมาส 3"], paymentType: "Credit", days: 30,
    });
    S.ar.manSep = r.documents[0];
  });
  // today (current month): 2 AR, 3 IV (one cancelled), 5 BI, 2 RE
  at("2026-10-01 08:50", "AR today J10 deposit", async () => { S.ar.J10dp = await bill("J10", "pay-dp"); });
  at("2026-10-01 09:05", "IV today J6", async () => { S.ar.J6iv = await bill("J6", "pay-del"); });
  at("2026-10-01 09:20", "manual AR today", async () => {
    const c = S.cust["บริษัท บางปู ฟู้ด อินดัสทรี จำกัด"];
    const r = await api("acc01", "POST", "/ar-documents/manual", {
      docType: "AR", customer: { companyName: c.companyName, address: c.address, taxId: c.taxId, branch: "สำนักงานใหญ่", contactName: c.contactName, phone: c.phone, email: c.email },
      lines: [{ description: "เงินมัดจำงานบริการตรวจเช็คระบบ (PM) ปี 2569-2570", qty: 1, unitPrice: 21600, unit: "งาน" }], paymentType: "Cash",
    });
    S.ar.manAr = r.documents[0];
    await receipt(S.ar.manAr.id);
  });
  at("2026-10-01 09:40", "manual IV wrong + cancel + reissue", async () => {
    const c = S.cust["บริษัท ไทยรุ่งเรือง อิเล็กโทรเพลทติ้ง จำกัด"];
    const base = { docType: "IV", lines: [{ description: "ถ่านกัมมันต์ (Activated Carbon) เปลี่ยนตามรอบ", qty: 300, unitPrice: 140, unit: "kg" }, { description: "ค่าแรงเปลี่ยนถ่าน", qty: 1, unitPrice: 6500, unit: "งาน" }], paymentType: "Credit", days: 30 };
    const wrong = await api("acc01", "POST", "/ar-documents/manual", { ...base, customer: { companyName: c.companyName, address: "59/3 ซอยพุทธบูชา 63 แขวงบางมด เขตทุ่งครุ กรุงเทพฯ 10140", taxId: c.taxId, branch: "สำนักงานใหญ่", contactName: c.contactName, phone: c.phone, email: c.email } });
    await api("acc01", "POST", `/ar-documents/${wrong.documents[0].id}/cancel`, { reason: "ที่อยู่ลูกค้าผิด (ซอย 63 → ซอย 36) ออกใบใหม่แทน" });
    await api("acc01", "POST", `/ar-documents/${wrong.documents[1].id}/cancel`, { reason: "ยกเลิกตามใบกำกับภาษีที่ออกผิด" });
    const right = await api("acc01", "POST", "/ar-documents/manual", { ...base, customer: { companyName: c.companyName, address: c.address, taxId: c.taxId, branch: "สำนักงานใหญ่", contactName: c.contactName, phone: c.phone, email: c.email } });
    S.ar.manOk = right.documents[0];
  });
  at("2026-10-01 10:10", "RE today (manual IV Sep)", () => receipt(S.ar.manSep.id));

  // ── service reports ──
  S.sr = {};
  async function serviceReport(key, o) {
    const r = await api("svc01", "POST", "/service-reports", {
      templateId: S.svcTpl[o.tpl].id, customerId: S.cust[o.cust].id,
      serviceLocation: o.location, projectOrJobCode: o.job ?? "", serviceSystemName: o.system, serviceType: o.type ?? "PM",
      inspectionDate: o.date, reportDate: o.date, nextPmDate: o.next ?? "",
      assignedServiceEngineerId: S.user.svc01.id, additionalInspectorNames: o.extra ?? [],
      onSiteContactName: S.cust[o.cust].contactName, onSiteContactPhone: S.cust[o.cust].phone,
      overallCustomerSummary: o.summary ?? "", overallRemark: o.remark ?? "",
    });
    S.sr[key] = r.serviceReport;
    return r.serviceReport;
  }
  function answers(report, ratio, abnormal) {
    // answer roughly `ratio` of the non-addon items: mostly normal, `abnormal` keys abnormal
    const checklist = [];
    let n = 0;
    const measure = (it) => {
      const s = `${it.key.split(".").pop()} ${it.label}`;
      if (it.key === "airFlow.flowRate") return "1,250";
      if (/level|solenoid/i.test(s)) return "ทำงานปกติ";
      if (/^other/i.test(s)) return "-";
      if (/blower|pump/i.test(s)) return "11.8 A";
      if (/flow/i.test(s)) return "3,050 CMH";
      if (/rpm|กระแส|current/i.test(s)) return "12.4 A / 1,450 rpm";
      if (/pressure|diff/i.test(s)) return "2.4";
      if (/ph\b/i.test(s)) return "8.6";
      if (/temp|อุณห/i.test(s)) return "34";
      return "ปกติ";
    };
    for (const sec of report.templateSnapshot.sections) {
      if (sec.isOptionalAddon) continue;
      const groups = [];
      for (const g of sec.groups) {
        const items = [];
        for (const it of g.items) {
          n++;
          if (ratio < 1 && n % Math.round(1 / ratio) !== 1 && !abnormal[it.key] && it.key !== "airFlow.flowRate") continue;
          if (it.kind === "measurement") items.push({ key: it.key, measurementValue: measure(it) });
          else if (abnormal[it.key]) items.push({ key: it.key, status: "abnormal", abnormalDetail: abnormal[it.key] });
          else items.push({ key: it.key, status: "normal" });
        }
        if (items.length) groups.push({ key: g.key, items });
      }
      if (groups.length) checklist.push({ key: sec.key, groups });
    }
    return checklist;
  }
  at("2026-06-12 09:00", "SR completed (approved by customer)", async () => {
    const rep = await serviceReport("old1", { tpl: "SVC-AIRPOLLUTION-STD", cust: "บริษัท กรีนวอเตอร์ เอ็นจิเนียริ่ง จำกัด", location: "โรงงานลาดกระบัง อาคาร B", system: "Wet Scrubber 3,000 CMH", date: "2026-06-12", next: "2026-09-12", summary: "ระบบทำงานปกติ ประสิทธิภาพอยู่ในเกณฑ์", job: "PM-GW-2606" });
    await api("svc01", "PATCH", `/service-reports/${rep.id}`, { checklist: answers(rep, 1, {}) });
    await api("svc01", "POST", `/service-reports/${rep.id}/status`, { action: "complete" });
    const s = await api("svc01", "POST", `/service-reports/${rep.id}/send-approval`);
    const key = new URL(s.approvalUrl).searchParams.get("key");
    C.setClock("2026-06-13 10:20");
    await C.raw("POST", `/service-reports/${enc(rep.id)}/approval/respond`, { key, decision: "approved", signatureDataUrl: await A.signature(991), signedName: "คุณอัญชลี แสงอรุณ" });
  });
  at("2026-08-21 09:00", "SR completed", async () => {
    const rep = await serviceReport("old2", { tpl: "SVC-CARBON-WETSCRUBBER", cust: "บริษัท บางปู ฟู้ด อินดัสทรี จำกัด", location: "ห้องต้ม อาคาร 2", system: "Activated Carbon Box 3,000 CMH", date: "2026-08-21", next: "2026-11-21", summary: "แนะนำเปลี่ยนถ่านกัมมันต์รอบถัดไป", job: "PM-BPF-2608" });
    await api("svc01", "PATCH", `/service-reports/${rep.id}`, { checklist: answers(rep, 1, {}) });
    await api("svc01", "POST", `/service-reports/${rep.id}/status`, { action: "complete" });
  });
  at("2026-09-28 09:30", "SR draft (featured)", async () => {
    const rep = await serviceReport("draft", { tpl: "SVC-AIRPOLLUTION-STD", cust: EX, location: "อาคารผลิต 2 ชั้นดาดฟ้า", system: "Wet Scrubber FRP 5,000 CMH (PQ202607-112-SC-OR)", date: "2026-09-28", next: "2026-12-28", job: "PQ202607-112-SC-OR", extra: ["ธีรวัฒน์ คงสมบูรณ์"] });
    const abnormalKey = "blower.vibration";
    await api("svc01", "PATCH", `/service-reports/${rep.id}`, { checklist: answers(rep, 0.5, { [abnormalKey]: "Blower สั่นผิดปกติที่ฐานยึด น็อตยึดแท่นหลวม 2 ตัว และมีคราบสนิมที่หน้าแปลน" }) });
    await api("svc01", "POST", `/service-reports/${rep.id}/photos`, { sectionKey: "systemMaintenance", groupKey: "blower", itemKey: abnormalKey, fileName: "blower-base.jpg", dataBase64: (await A.sitePhoto(0)).toString("base64") });
    S.srDraftId = rep.id;
  });
  at("2026-09-30 16:30", "SR draft send approval", async () => {
    const s = await api("svc01", "POST", `/service-reports/${S.srDraftId}/send-approval`);
    S.srApprovalUrl = s.approvalUrl;
  });
  at("2026-09-15 13:00", "SR draft older", async () => {
    const rep = await serviceReport("draft2", { tpl: "custom", cust: "บริษัท นวนคร พลาสติก จำกัด", location: "ห้องบด อาคาร A", system: "Dust Collector 64 ถุง", date: "2026-09-15", next: "2026-12-15", job: "PQ202603-066-BF-OR" });
    void rep;
  });
}

// Operations: projects, MR/JO/PR, production orders, POs, receiving, AP, vendor bills, store
// documents, tools, product requests, Cost Control, password-reset requests, misc stock.
async function opsData(C, A, S) {
  const { at, api, enc } = C;
  const P = (code) => S.prod[code].id;
  S.prj = {}; S.mr = {}; S.jo = {}; S.pr = {}; S.pdo = {}; S.po = {}; S.rr = {}; S.cc = {};

  const approve = async (path, id, approver = "ops01", submitter) => {
    if (submitter) await api(submitter, "POST", `/${path}/${enc(id)}/submit-approval`);
    await api(approver, "POST", `/${path}/${enc(id)}/approve`);
  };
  const itemIdx = (sowKey, i) => S.sow[sowKey].items.filter((x) => !x.isSectionHeader)[i].id;

  // ── projects ──
  const project = (key, sowKey, when, user = "prj01") => at(when, `project ${key}`, async () => {
    const r = await api(user, "POST", "/projects", { scopeOfWorkId: S.sow[sowKey].id });
    S.prj[key] = r.project;
  });
  const projectStatus = (key, when, status, user = "prj01") => at(when, `project ${key} ${status}`, () => api(user, "PATCH", `/projects/${S.prj[key].id}`, { status }));
  project("J7", "J7", "2026-04-30 13:00", "prj02"); projectStatus("J7", "2026-05-05 09:00", "InProgress", "prj02"); projectStatus("J7", "2026-07-20 16:00", "Completed", "prj02");
  project("J1", "J1", "2026-07-13 10:00"); projectStatus("J1", "2026-07-20 09:00", "InProgress");
  project("J2", "J2", "2026-08-10 10:00", "prj02");
  project("J10", "J10", "2026-09-10 10:30", "prj02");

  // ── material requisitions (department) ──
  const mrLines = (spec) => spec.map(([code, category, qty]) => ({ productId: P(code), category, plannedQty: qty }));
  async function createMr(key, user, body, lines, extra = {}) {
    const r = await api(user, "POST", "/material-requisitions", body);
    const id = r.materialRequisition.id;
    const p = await api(user, "PATCH", `/material-requisitions/${enc(id)}`, { lines: mrLines(lines), ...extra });
    S.mr[key] = p.materialRequisition;
    return id;
  }
  // store issue slip made from a department MR; rounds: [[date, {code: qty}], ...], newLines on a round
  async function storeSlip(key, mrKey, code = "PP") {
    const r = await api("store01", "POST", "/material-requisitions", { ownerDepartment: "store", issueCode: code });
    const p = await api("store01", "PATCH", `/material-requisitions/${enc(r.materialRequisition.id)}`, { sourceRequisitionId: S.mr[mrKey].id });
    S.mr[key] = p.materialRequisition;
  }
  async function issueRound(key, date, qtyByCode, newLines = [], remark = "") {
    const slip = S.mr[key];
    const byProduct = Object.fromEntries(slip.lines.map((l) => [l.productId, l.id]));
    const lines = Object.entries(qtyByCode).map(([code, qty]) => ({ lineId: byProduct[P(code)], qty })).filter((l) => l.lineId && l.qty > 0);
    const r = await api("store01", "POST", `/material-requisitions/${enc(slip.id)}/issues`, {
      issuedDate: date, issuedBy: S.name("store01"), remark, lines,
      newLines: newLines.map(([c, qty, category = "other"]) => ({ productId: P(c), qty, category })),
    });
    S.mr[key] = r.materialRequisition;
  }

  // J7 (May) — fully issued
  at("2026-05-06 09:30", "MR J7", async () => {
    const id = await createMr("J7", "prj02", { projectId: S.prj.J7.id, itemIds: [itemIdx("J7", 0)] },
      [["MAT-0001", "chemical", 120], ["MAT-0002", "chemical", 80], ["SP-0001", "hardware", 40], ["PD-0645", "consumable", 20]], { responsibleEmployee: S.name("prj02") });
    await approve("material-requisitions", id, "ops01", "prj02");
  });
  at("2026-05-07 08:30", "PP J7 issue", async () => { await storeSlip("PPJ7", "J7"); await issueRound("PPJ7", "2026-05-07", { "MAT-0001": 120, "MAT-0002": 80, "SP-0001": 40, "PD-0645": 20 }); });
  // J1 July — fully issued (ท่อ FRP item)
  at("2026-07-22 10:00", "MR J1-A", async () => {
    const id = await createMr("J1A", "prj01", { projectId: S.prj.J1.id, itemIds: [itemIdx("J1", 3)] },
      [["MAT-0001", "chemical", 150], ["MAT-0002", "chemical", 90], ["MAT-0003", "chemical", 60], ["SP-0001", "hardware", 60], ["PD-0034", "consumable", 30]], { responsibleEmployee: S.name("prj01") });
    await approve("material-requisitions", id, "ops01", "prj01");
  });
  at("2026-07-24 08:40", "PP J1-A issue", async () => { await storeSlip("PPJ1A", "J1A"); await issueRound("PPJ1A", "2026-07-24", { "MAT-0001": 150, "MAT-0002": 90, "MAT-0003": 60, "SP-0001": 60, "PD-0034": 30 }); });
  // blank MR (no job code) with a kit line — fully issued
  at("2026-09-10 14:00", "MR blank", async () => {
    const id = await createMr("BLANK", "prj02", {}, [["KIT-0003", "hardware", 10], ["PD-0004", "consumable", 24], ["PD-0084", "consumable", 6]], { responsibleEmployee: S.name("prj02"), productName: "งานซ่อมบำรุงฐานปั๊มในโรงงาน" });
    await approve("material-requisitions", id, "ops01", "prj02");
  });
  at("2026-09-11 09:00", "PP blank issue", async () => { await storeSlip("PPBLANK", "BLANK"); await issueRound("PPBLANK", "2026-09-11", { "KIT-0003": 10, "PD-0004": 24, "PD-0084": 6 }); });
  // J1 MR-C — Final, partly issued (ค้างเบิก), store slip round 1 posted + a store-added line
  at("2026-09-18 10:20", "MR J1-C", async () => {
    const id = await createMr("J1C", "prj01", { projectId: S.prj.J1.id },
      [["MAT-0001", "chemical", 50], ["MAT-0002", "chemical", 20], ["SP-0001", "hardware", 60], ["MAT-0009", "chemical", 4], ["SP-0004", "hardware", 12]],
      { responsibleEmployee: S.name("prj01"), chargeDepartmentId: S.dept.Project, chargeTeamId: S.team["ทีมติดตั้ง A"] });
    await approve("material-requisitions", id, "ops01", "prj01");
  });
  at("2026-09-21 08:50", "PP J1-C", () => storeSlip("PPJ1C", "J1C"));
  at("2026-09-22 09:15", "PP J1-C round 1", () => issueRound("PPJ1C", "2026-09-22", { "MAT-0001": 30, "MAT-0002": 20, "SP-0001": 40, "SP-0004": 6 }, [["SP-0006", 6, "hardware"]], "จ่ายรอบแรก ส่วนที่เหลือรอของเข้า"));
  // production MRs with outstanding lines, no store slip yet
  // (created later, after the production orders exist)
  // Pending MR (J2)
  at("2026-09-29 13:30", "MR J2 pending", async () => {
    const id = await createMr("J2P", "prj02", { projectId: S.prj.J2.id }, [["MAT-0005", "other", 8], ["SP-0004", "hardware", 16], ["PD-0028", "consumable", 10]], { responsibleEmployee: S.name("prj02") });
    await api("prj02", "POST", `/material-requisitions/${enc(id)}/submit-approval`);
  });
  // Draft MR (J1, the featured editor) — one line short of stock, one kit
  at("2026-09-30 10:40", "MR J1-B draft", async () => {
    await createMr("J1B", "prj01", { projectId: S.prj.J1.id, itemIds: [itemIdx("J1", 2)] },
      [["SP-0005", "other", 4], ["KIT-0003", "hardware", 20], ["MAT-0005", "other", 6], ["SP-0006", "hardware", 12]], { responsibleEmployee: S.name("prj01") });
  });
  at("2026-08-02 10:00", "MR templates", async () => {
    const t = (code, category, qty) => ({ productId: P(code), productCode: code, productName: S.prod[code].name, unit: S.prod[code].unit, category, plannedQty: qty });
    await api("prj01", "POST", "/material-requisition-templates", { name: "ชุดวัสดุบุผิว FRP มาตรฐาน (ต่อ 10 ตร.ม.)", description: "เรซิ่น ใยแก้ว และวัสดุสิ้นเปลืองสำหรับงานบุผิว", lines: [t("MAT-0001", "chemical", 30), t("MAT-0002", "chemical", 15), t("MAT-0003", "chemical", 10), t("PD-0141", "consumable", 2), t("PD-0645", "consumable", 10)] });
    await api("prj01", "POST", "/material-requisition-templates", { name: "ชุดติดตั้งปั๊มสารเคมี", description: "อุปกรณ์ยึดและท่อสำหรับติดตั้งปั๊ม 1 ชุด", lines: [t("KIT-0003", "hardware", 4), t("SP-0004", "hardware", 4), t("MAT-0005", "other", 2), t("PD-0028", "consumable", 2)] });
  });

  // ── job orders ──
  at("2026-07-15 10:00", "JO J1 final", async () => {
    const r = await api("prj01", "POST", "/job-orders", { projectId: S.prj.J1.id, itemIds: [itemIdx("J1", 0)] });
    const id = r.jobOrder.id;
    await api("prj01", "PATCH", `/job-orders/${enc(id)}`, { toSite: "Factory — ทีม FRP", startDate: "2026-07-16", requestedBy: S.name("prj01"), requestedAt: "2026-07-15" });
    await approve("job-orders", id, "ops01", "prj01");
    S.jo.final = id;
  });
  at("2026-09-29 15:20", "JO J1 draft", async () => {
    const r = await api("prj01", "POST", "/job-orders", { projectId: S.prj.J1.id });
    const id = r.jobOrder.id;
    await api("prj01", "PATCH", `/job-orders/${enc(id)}`, {
      toSite: "Factory — ทีมเหล็ก", customerName: "บริษัท ตัวอย่าง จำกัด", startDate: "2026-10-05", finishDate: "2026-10-16",
      requestedBy: S.name("prj01"), requestedAt: "2026-09-29", outOfScope: "งานไฟฟ้าควบคุมโดยผู้รับเหมาของลูกค้า",
      lines: [
        { description: "โครงเหล็กรองรับ Scrubber (Support Frame)", subDetails: ["เหล็กฉาก 50x50x5 mm ชุบกัลวาไนซ์", "ขนาด 2,400 x 2,400 x H 1,200 mm"], quantity: 1, unit: "ชุด", remark: "", isContinuation: false },
        { description: "บันไดและชานพักบำรุงรักษา", subDetails: ["ราวกันตก สูง 1,100 mm"], quantity: 1, unit: "ชุด", remark: "", isContinuation: false },
        { description: "พร้อมแผ่นพื้น FRP Grating 38 mm ปูชานพัก", subDetails: [], quantity: 6, unit: "ตร.ม.", remark: "ใช้ของจากสต๊อก", isContinuation: true },
      ],
      scopeChecklist: [{ key: "scopeOfWork", options: [
        { key: "fabricationDrawing", checked: true }, { key: "shopFabricationAndConsumable", checked: true }, { key: "hotDipGalvanized", checked: true },
        { key: "transportation", checked: true }, { key: "siteInstallation", checked: true },
        { key: "primerCoat", checked: true, value: "Epoxy Zinc Rich", value2: "75" }, { key: "finishedCoat", checked: true, value: "Polyurethane", value2: "50" },
      ] }],
    });
    await api("prj01", "POST", `/job-orders/${enc(id)}/attachments`, { fileName: "Shop-Drawing-Support-Frame.pdf", dataBase64: A.pdf("Shop Drawing - Scrubber Support Frame").toString("base64") });
    await api("prj01", "POST", `/job-orders/${enc(id)}/attachments`, { fileName: "รูปหน้างาน-ฐานราก.jpg", dataBase64: (await A.sitePhoto(2)).toString("base64") });
    S.jo.draft = id;
  });

  // ── production orders ──
  async function pdo(key, sowKey, when, itemIndexes, patch, final) {
    const r = await api("fac01", "POST", "/production-orders", { scopeOfWorkId: S.sow[sowKey].id, ...(itemIndexes ? { itemIds: itemIndexes.map((i) => itemIdx(sowKey, i)) } : {}) });
    const id = r.productionOrder.id;
    if (patch) await api("fac01", "PATCH", `/production-orders/${enc(id)}`, patch);
    S.pdo[key] = { id, ...r.productionOrder };
    return id;
  }
  at("2026-07-16 09:00", "PdO J1", async () => {
    const id = await pdo("J1", "J1", null, [0, 1], { productName: "Wet Scrubber FRP 5,000 CMH พร้อม Blower", supervisorName: S.name("fac02"), startDate: "2026-07-20", dueDate: "2026-10-05" });
    await approve("production-orders", id, "ops01", "fac01");
  });
  at("2026-09-30 17:10", "PdO J1 signatories", () => api("fac01", "POST", `/production-orders/${enc(S.pdo.J1.id)}/signatories`, { deliveredBy: { name: S.name("fac02"), date: "2026-09-30" }, receivedBy: { name: "", date: "" }, costDeptBy: { name: "", date: "" } }));
  at("2026-09-25 14:00", "PdO J2 draft (featured)", async () => {
    await pdo("J2", "J2", null, [0], {
      productName: "ถังเก็บสารเคมี 2,000 ลิตร", supervisorName: S.name("fac01"), startDate: "2026-10-05", dueDate: "2026-10-30",
      lines: [
        { description: "ตัวถัง (Shell)", isSectionHeader: true, isContinuation: false, subDetails: [], qty: null, unit: "", remark: "" },
        { description: "ถังเก็บสารเคมี FRP 2,000 ลิตร Ø 1,400 x H 1,500 mm", isSectionHeader: false, isContinuation: false, subDetails: ["Resin Vinyl Ester ทนกรดเกลือ 35%"], qty: 2, unit: "ใบ", remark: "" },
        { description: "หน้าแปลน FRP 2 นิ้ว (Inlet / Outlet / Drain)", isSectionHeader: false, isContinuation: false, subDetails: [], qty: 6, unit: "ชุด", remark: "" },
        { description: "พร้อมแผ่นเสริมแรงรอบหน้าแปลน", isSectionHeader: false, isContinuation: true, subDetails: [], qty: null, unit: "", remark: "" },
        { description: "ฝาถัง Manhole Ø 500 mm", isSectionHeader: false, isContinuation: false, subDetails: [], qty: 2, unit: "ชุด", remark: "ใช้ซีล EPDM" },
      ],
    });
  });
  at("2026-09-27 10:00", "PdO J10 pending", async () => {
    const id = await pdo("J10", "J10", null, [0], { productName: "Dust Collector (Bag Filter) 64 ถุง", supervisorName: S.name("fac02"), startDate: "2026-10-12", dueDate: "2026-11-20" });
    await api("fac01", "POST", `/production-orders/${enc(id)}/submit-approval`);
  });
  at("2026-09-30 11:10", "PdO J3 draft", () => pdo("J3", "J3", null, [0], { productName: "Wet Scrubber FRP 5,000 CMH", supervisorName: S.name("fac02"), startDate: "2026-10-19", dueDate: "2026-11-20" }));
  // production MRs (Final, outstanding)
  at("2026-09-24 09:40", "MR prod J1", async () => {
    const id = await createMr("PRODJ1", "fac01", { productionOrderId: S.pdo.J1.id }, [["MAT-0004", "other", 4], ["MAT-0003", "chemical", 40], ["SP-0006", "hardware", 12]], { responsibleEmployee: S.name("fac02") });
    await approve("material-requisitions", id, "ops01", "fac01");
  });
  at("2026-09-26 13:15", "MR prod blank", async () => {
    const id = await createMr("PRODB", "fac02", { ownerDepartment: "production" }, [["MAT-0006", "other", 20], ["PD-0032", "consumable", 30], ["PD-0110", "consumable", 20]], { responsibleEmployee: S.name("fac02"), productName: "โครงเหล็กรองรับ Scrubber", chargeDepartmentId: S.dept.Factory, chargeTeamId: S.team["ทีมเหล็ก"] });
    await approve("material-requisitions", id, "ops01", "fac02");
  });

  // ── purchase requests → purchase orders → receiving ──
  const prLine = (code, qty, needed, dept = "G143", cost = "5100-10", subs = []) => ({ productId: P(code), productCode: code, description: S.prod[code].name, unit: S.prod[code].unit, subDetails: subs, warehouseRemainingQty: "", qtyRequested: qty, neededByDate: needed, departmentCode: dept, costCode: cost });
  async function pr(key, user, body, lines, header = {}) {
    const r = await api(user, "POST", "/purchase-requests", body);
    const id = r.purchaseRequest.id;
    await api(user, "PATCH", `/purchase-requests/${enc(id)}`, { lines, deliveryLocation: "คลังสินค้า บางเสาธง", deliveryContact: S.name("store01"), deliveryPhone: "081-400-1051", ...header });
    S.pr[key] = { id };
    return id;
  }
  async function prToPurchasing(key, { stockCodes = [], approveBy = "pur02" } = {}) {
    const id = S.pr[key].id;
    await approve("purchase-requests", id, "ops01", Object.prototype.hasOwnProperty.call(S.pr[key], "owner") ? S.pr[key].owner : undefined);
    const doc = (await api("store01", "GET", `/purchase-requests/${enc(id)}`)).purchaseRequest;
    await api("store01", "POST", `/purchase-requests/${enc(id)}/store-review`, { lines: doc.lines.map((l) => ({ lineId: l.id, decision: stockCodes.includes(l.productCode) ? "stock" : "purchase" })), remark: stockCodes.length ? "บางรายการมีในสต๊อก จ่ายจากคลัง" : "ไม่มีของในคลัง ส่งต่อฝ่ายจัดซื้อ" });
    if (approveBy) await api(approveBy, "POST", `/purchase-requests/${enc(id)}/purchasing-approve`);
  }
  const submitPr = (key, user) => api(user, "POST", `/purchase-requests/${enc(S.pr[key].id)}/submit-approval`);
  async function po(key, prKey, vendorName, prices, header = {}, lineIds) {
    const r = await api("pur01", "POST", "/purchase-orders", prKey ? { purchaseRequestId: S.pr[prKey].id, ...(lineIds ? { lineIds } : {}) } : {});
    const doc = r.purchaseOrder;
    const v = S.vendor[vendorName];
    const lines = prKey
      ? doc.lines.map((l) => ({ ...l, unitPrice: prices[l.productCode] ?? prices["*"] ?? 100 }))
      : prices.map((l, i) => ({ id: `poline_new_${i}`, productId: l.code ? P(l.code) : undefined, productCode: l.code ?? "", description: l.description ?? S.prod[l.code].name, unit: l.unit ?? S.prod[l.code].unit, qty: l.qty, unitPrice: l.price, discount: null, discountMode: "percent", neededByDate: header.neededByDate ?? "", departmentCode: "G150", costCode: "5230-11", cancelled: false, remark: "" }));
    await api("pur01", "PATCH", `/purchase-orders/${enc(doc.id)}`, {
      vendorId: v.id, vendorName, vendorContact: v.contactName, vendorPhone: v.phone, vendorTaxId: v.taxId, vendorAddress: v.address,
      creditDays: 30, vatRate: 7, discount: 0, discountMode: "percent", shippingMethod: "ผู้ขายจัดส่ง", orderedBy: S.name("pur01"),
      intendedApproverUserId: S.user.ops01.id, ...header, lines,
    });
    S.po[key] = { id: doc.id };
    return doc.id;
  }
  const finalPo = (key) => approve("purchase-orders", S.po[key].id, "ops01", "pur01");
  async function rr(key, poKey, receiveCode) {
    const r = await api("store01", "POST", "/receiving-reports", poKey ? { purchaseOrderId: S.po[poKey].id, ...(receiveCode ? { receiveCode } : {}) } : { receiveCode: receiveCode ?? "RR" });
    S.rr[key] = r.receivingReport;
    return r.receivingReport;
  }
  async function receive(key, date, inv, qtyFn, extra = {}) {
    const doc = (await api("store01", "GET", `/receiving-reports/${enc(S.rr[key].id)}`)).receivingReport;
    const lines = doc.lines.map((l) => ({ lineId: l.id, qty: qtyFn(l), unitPrice: l.unitPriceOrdered ?? 0, ...(extra.lineDiscount?.[l.productCode] ? { discount: extra.lineDiscount[l.productCode], discountMode: "percent" } : {}) })).filter((l) => l.qty > 0);
    const r = await api("store01", "POST", `/receiving-reports/${enc(doc.id)}/receipts`, { invoiceNumber: inv, invoiceDate: date, receivedDate: date, vatRate: 7, priceType: "exclusive", creditDays: 30, receivedBy: S.name("store01"), remark: extra.remark ?? "", lines });
    S.rr[key] = r.receivingReport;
  }

  // PR1 (ED, J7) → PO-A สยามเคมีภัณฑ์ → RR closed
  at("2026-05-08 10:00", "PR1", async () => { await pr("PR1", "prj02", { projectId: S.prj.J7.id }, [prLine("MAT-0001", 400, "2026-05-15"), prLine("MAT-0002", 200, "2026-05-15")]); S.pr.PR1.owner = "prj02"; await prToPurchasing("PR1"); });
  at("2026-05-09 10:00", "PO-A", async () => { await po("A", "PR1", "บริษัท สยามเคมีภัณฑ์ จำกัด", { "MAT-0001": 150, "MAT-0002": 76 }, { vendorQuotationRef: "QT-SCC-6905-112", neededByDate: "2026-05-16" }); await finalPo("A"); });
  at("2026-05-16 13:00", "RR-A", async () => { await rr("A", "A"); await receive("A", "2026-05-16", "IV6905-0451", (l) => l.qtyOrdered); });
  // PR2 (FD, J7 production) → PO-B ไทยสตีลซัพพลาย → RR (สกรู receipt #1)
  at("2026-05-12 09:00", "PR2", async () => { await pr("PR2", "fac01", { requestCode: "FD" }, [prLine("SP-0001", 500, "2026-05-22", "G131", "5100-10"), prLine("SP-0003", 300, "2026-05-22", "G131", "5100-10")]); S.pr.PR2.owner = "fac01"; await prToPurchasing("PR2"); });
  at("2026-05-13 10:00", "PO-B", async () => { await po("B", "PR2", "บริษัท ไทยสตีลซัพพลาย จำกัด", { "SP-0001": 2.3, "SP-0003": 0.85 }, { vendorQuotationRef: "TSS-QT-26-0388", neededByDate: "2026-05-22" }); await finalPo("B"); });
  at("2026-05-21 14:00", "RR-B", async () => { await rr("B", "B"); await receive("B", "2026-05-21", "TSS-INV-26-1182", (l) => l.qtyOrdered); });
  at("2026-06-01 10:00", "BR ไทยสตีล", async () => {
    const r = await api("store01", "POST", "/vendor-bills", { vendorName: "บริษัท ไทยสตีลซัพพลาย จำกัด" });
    await api("store01", "PATCH", `/vendor-bills/${enc(r.vendorBill.id)}`, { paymentDate: "2026-06-30", remarks: "วางบิลรอบสิ้นเดือน" });
  });
  at("2026-06-30 15:00", "AP paid (May)", async () => {
    const { apEntries } = await api("acc01", "GET", "/ap-entries");
    for (const e of apEntries.filter((x) => ["บริษัท ไทยสตีลซัพพลาย จำกัด", "บริษัท สยามเคมีภัณฑ์ จำกัด"].includes(x.vendorName))) {
      await api("acc01", "PATCH", `/ap-entries/${e.id}`, { status: "Paid", paymentRef: e.vendorName.includes("ไทยสตีล") ? "CHQ-KTB-0012458" : "TRF-260630-07" });
    }
  });
  // PR3 (ED, J1) → PO-C ผู้ขายตัวอย่าง → RR-C two rounds
  at("2026-07-20 11:00", "PR3", async () => { await pr("PR3", "prj01", { projectId: S.prj.J1.id }, [prLine("EQ-0007", 2, "2026-08-10"), prLine("MAT-0005", 20, "2026-08-10"), prLine("SP-0004", 40, "2026-08-10")]); S.pr.PR3.owner = "prj01"; await prToPurchasing("PR3"); });
  at("2026-07-22 10:00", "PO-C", async () => { await po("C", "PR3", "บริษัท ผู้ขายตัวอย่าง จำกัด", { "EQ-0007": 24800, "MAT-0005": 470, "SP-0004": 56 }, { vendorQuotationRef: "QT-SMP-2607-019", neededByDate: "2026-08-10" }); await finalPo("C"); });
  at("2026-07-30 14:00", "RR-C round 1", async () => { await rr("C", "C"); await receive("C", "2026-07-30", "SMP-6907-0221", (l) => (l.productCode === "EQ-0007" ? 0 : l.qtyOrdered)); });
  at("2026-08-12 10:30", "RR-C round 2", () => receive("C", "2026-08-12", "SMP-6908-0074", (l) => (l.productCode === "EQ-0007" ? 2 : 0)));
  // PR4 (SD steel, general) → PO-D ไทยสตีลซัพพลาย → RR-D (RX) partial (สกรู receipt #2)
  at("2026-08-18 09:30", "PR4", async () => { await pr("PR4", "pur01", { requestCode: "SD" }, [prLine("MAT-0006", 60, "2026-09-01", "G132", "5100-10"), prLine("SP-0001", 300, "2026-09-01", "G132", "5100-10"), prLine("SP-0002", 400, "2026-09-01", "G132", "5100-10")], { headerRemark: "สต๊อกสำหรับงานโครงเหล็กไตรมาส 4" }); S.pr.PR4.owner = "pur01"; await prToPurchasing("PR4"); });
  at("2026-08-19 10:00", "PO-D", async () => { await po("D", "PR4", "บริษัท ไทยสตีลซัพพลาย จำกัด", { "MAT-0006": 395, "SP-0001": 2.3, "SP-0002": 0.55 }, { vendorQuotationRef: "TSS-QT-26-0612", neededByDate: "2026-10-05", remarks: "ผู้ขายทยอยส่งเหล็กฉากเป็น 3 งวด" }); await finalPo("D"); });
  at("2026-09-02 14:00", "RR-D round 1", async () => { await rr("D", "D", "RX"); await receive("D", "2026-09-02", "TSS-INV-26-1730", (l) => (l.productCode === "MAT-0006" ? 30 : l.qtyOrdered)); });
  at("2026-09-20 10:00", "RR-D round 2", () => receive("D", "2026-09-20", "TSS-INV-26-1802", (l) => (l.productCode === "MAT-0006" ? 15 : 0)));
  // PR5 (general) → PO-E ผู้ขายตัวอย่าง → RR-E one round (partial)
  at("2026-08-25 10:00", "PR5", async () => { await pr("PR5", "pur01", {}, [prLine("PD-0645", 100, "2026-09-05", "G150", "5230-11"), prLine("PD-0004", 120, "2026-09-05", "G150", "5230-11"), prLine("PD-0084", 40, "2026-09-05", "G150", "5230-11")]); S.pr.PR5.owner = "pur01"; await prToPurchasing("PR5"); });
  at("2026-08-26 10:00", "PO-E", async () => { await po("E", "PR5", "บริษัท ผู้ขายตัวอย่าง จำกัด", { "PD-0645": 32, "PD-0004": 14, "PD-0084": 28 }, { vendorQuotationRef: "QT-SMP-2608-044", neededByDate: "2026-09-05" }); await finalPo("E"); });
  at("2026-09-05 11:00", "RR-E", async () => { await rr("E", "E"); await receive("E", "2026-09-05", "SMP-6909-0012", (l) => l.qtyOrdered); });
  at("2026-09-10 09:30", "BR ผู้ขายตัวอย่าง", async () => {
    const r = await api("store01", "POST", "/vendor-bills", { vendorName: "บริษัท ผู้ขายตัวอย่าง จำกัด" });
    await api("store01", "PATCH", `/vendor-bills/${enc(r.vendorBill.id)}`, { creditDays: 30, paymentDate: "2026-10-10", remarks: "ผู้ขายนำส่งวางบิลพร้อมสำเนาใบกำกับภาษี 3 ฉบับ" });
  });
  // PO-K ศรีสุขการไฟฟ้า (no PR) → RI closed, paid
  at("2026-09-03 10:00", "PO-K", async () => {
    await po("K", null, "ร้าน ศรีสุขการไฟฟ้า", [{ description: "สายไฟ VCT 4x2.5 sq.mm", unit: "เมตร", qty: 100, price: 68 }, { description: "เบรกเกอร์ 3P 32A", unit: "ตัว", qty: 4, price: 1450 }, { description: "ท่อร้อยสาย EMT 3/4 นิ้ว", unit: "ท่อน", qty: 30, price: 115 }], { neededByDate: "2026-09-04", vendorQuotationRef: "ใบเสนอราคา 0349" });
    await finalPo("K");
  });
  at("2026-09-04 15:00", "RR-K (RI)", async () => { await rr("K", "K", "RI"); await receive("K", "2026-09-04", "SS-2569/0912", (l) => l.qtyOrdered); });
  at("2026-09-25 14:00", "AP paid ศรีสุข", async () => {
    const { apEntries } = await api("acc01", "GET", "/ap-entries");
    for (const e of apEntries.filter((x) => x.vendorName === "ร้าน ศรีสุขการไฟฟ้า")) await api("acc01", "PATCH", `/ap-entries/${e.id}`, { status: "Paid", paymentRef: "CHQ-KTB-0013377" });
  });
  // PR6 (FD, J1 production) + PR7 (ED, J2) → PO-F + PO-G สยามเคมีภัณฑ์ → one RR with both POs, round 1 partial
  at("2026-09-02 10:30", "PR6", async () => { await pr("PR6", "fac01", { productionOrderId: S.pdo.J1.id }, [prLine("MAT-0004", 6, "2026-09-15", "G131"), prLine("MAT-0003", 200, "2026-09-15", "G131"), prLine("MAT-0001", 300, "2026-09-15", "G131"), prLine("MAT-0009", 8, "2026-09-15", "G131", "5230-11")]); S.pr.PR6.owner = "fac01"; await prToPurchasing("PR6"); });
  at("2026-09-05 13:00", "PR7", async () => { await pr("PR7", "prj02", { projectId: S.prj.J2.id }, [prLine("MAT-0007", 600, "2026-09-18"), prLine("SP-0006", 24, "2026-09-18")]); S.pr.PR7.owner = "prj02"; await prToPurchasing("PR7"); });
  at("2026-09-08 10:00", "PO-F", async () => { await po("F", "PR6", "บริษัท สยามเคมีภัณฑ์ จำกัด", { "MAT-0004": 3380, "MAT-0003": 90, "MAT-0001": 149, "MAT-0009": 1290 }, { vendorQuotationRef: "QT-SCC-6909-031", neededByDate: "2026-10-06" }); await finalPo("F"); });
  at("2026-09-09 10:00", "PO-G", async () => { await po("G", "PR7", "บริษัท สยามเคมีภัณฑ์ จำกัด", { "MAT-0007": 104, "SP-0006": 190 }, { vendorQuotationRef: "QT-SCC-6909-036", neededByDate: "2026-10-06" }); await finalPo("G"); });
  at("2026-09-14 09:00", "RR-F (2 POs)", async () => {
    await rr("F", "F");
    await api("store01", "POST", `/receiving-reports/${enc(S.rr.F.id)}/purchase-orders`, { purchaseOrderId: S.po.G.id });
    await api("store01", "PATCH", `/receiving-reports/${enc(S.rr.F.id)}`, { priceType: "exclusive", orderVatRate: 7, creditDays: 30 });
  });
  at("2026-09-15 14:30", "RR-F round 1", () => receive("F", "2026-09-15", "SCC-IV-6909-1187", (l) => ({ "MAT-0004": 6, "MAT-0003": 100, "MAT-0001": 0, "MAT-0009": 0, "MAT-0007": 300, "SP-0006": 0 })[l.productCode] ?? 0));
  at("2026-09-20 11:00", "BR สยามเคมี", async () => {
    const r = await api("store01", "POST", "/vendor-bills", { vendorName: "บริษัท สยามเคมีภัณฑ์ จำกัด" });
    await api("store01", "PATCH", `/vendor-bills/${enc(r.vendorBill.id)}`, { paymentDate: "2026-10-20" });
  });
  at("2026-09-21 09:00", "RR-F line discount", async () => {
    const doc = (await api("store01", "GET", `/receiving-reports/${enc(S.rr.F.id)}`)).receivingReport;
    const sp = doc.lines.find((l) => l.productCode === "SP-0006");
    await api("store01", "PATCH", `/receiving-reports/${enc(doc.id)}`, { lineDiscounts: [{ lineId: sp.id, discount: 5, discountMode: "percent" }], remarks: "ผู้ขายให้ส่วนลดหัวสเปรย์ 5% สำหรับล็อตที่เหลือ" });
  });
  // PR16 (ED, J1) → PO-J สยามเคมีภัณฑ์ Final, no RR yet, needed-by in the past (overdue)
  at("2026-09-10 10:00", "PR16", async () => { await pr("PR16", "prj01", { projectId: S.prj.J1.id }, [prLine("MAT-0002", 150, "2026-09-25"), prLine("MAT-0001", 200, "2026-09-25"), prLine("PD-0062", 6, "2026-09-25", "G143", "5230-11")]); S.pr.PR16.owner = "prj01"; await prToPurchasing("PR16"); });
  at("2026-09-14 10:00", "PO-J", async () => { await po("J", "PR16", "บริษัท สยามเคมีภัณฑ์ จำกัด", { "MAT-0002": 77, "MAT-0001": 150, "PD-0062": 420 }, { vendorQuotationRef: "QT-SCC-6909-052", neededByDate: "2026-09-25" }); await finalPo("J"); });
  // blank RR (no PO), partly received
  at("2026-09-18 15:00", "RR blank", async () => {
    const d = await rr("BL", null, "RR");
    await api("store01", "PATCH", `/receiving-reports/${enc(d.id)}`, {
      vendorName: "บริษัท เอเชียวาล์วแอนด์ฟิตติ้ง จำกัด", vendorTaxId: "0105556071882", vendorAddress: "88/9 ถนนพระราม 2 แขวงแสมดำ เขตบางขุนเทียน กรุงเทพฯ 10150", jobCode: "PQ202608-121-SC-OR",
      lines: [{ productId: P("PD-0028"), productCode: "PD-0028", description: S.prod["PD-0028"].name, unit: S.prod["PD-0028"].unit, qtyOrdered: 40, unitPriceOrdered: 22 }, { description: "บอลวาล์ว PVC 2 นิ้ว", unit: "ตัว", qtyOrdered: 6, unitPriceOrdered: 380 }, { description: "ข้อต่อ PVC 2 นิ้ว", unit: "ตัว", qtyOrdered: 20, unitPriceOrdered: 35 }],
      priceType: "exclusive", orderVatRate: 7, creditDays: 30,
    });
    await receive("BL", "2026-09-18", "AVF-26-09981", (l) => (l.description.startsWith("บอลวาล์ว") ? 0 : l.qtyOrdered));
  });
  // PR8 (ED, J10) → PO-H Draft (featured) ไทยสตีลซัพพลาย
  at("2026-09-14 13:00", "PR8", async () => { await pr("PR8", "prj02", { projectId: S.prj.J10.id }, [prLine("MAT-0006", 40, "2026-10-12", "G143", "5100-10", ["ชุบกัลวาไนซ์"]), prLine("SP-0004", 24, "2026-10-12"), prLine("SP-0001", 200, "2026-10-12")]); S.pr.PR8.owner = "prj02"; await prToPurchasing("PR8"); });
  at("2026-09-30 14:20", "PO-H draft", () => po("H", "PR8", "บริษัท ไทยสตีลซัพพลาย จำกัด", { "MAT-0006": 410, "SP-0004": 57, "SP-0001": 2.4 }, { vendorQuotationRef: "TSS-QT-26-0745", neededByDate: "2026-10-12", remarks: "ส่งของที่หน้างานนิคมนวนคร โทรแจ้งก่อนเข้า 1 วัน", deliveryLocation: "นิคมอุตสาหกรรมนวนคร ปทุมธานี" }));
  // PR10 (general) → PO-I เอเชียวาล์ว pending approval
  at("2026-09-26 10:00", "PR10", async () => { await pr("PR10", "pur01", {}, [prLine("PD-0028", 60, "2026-10-08", "G150", "5230-15"), prLine("PD-0161", 30, "2026-10-08", "G150", "5230-15")]); S.pr.PR10.owner = "pur01"; await prToPurchasing("PR10"); });
  at("2026-09-29 11:00", "PO-I pending", async () => { await po("I", "PR10", "บริษัท เอเชียวาล์วแอนด์ฟิตติ้ง จำกัด", { "PD-0028": 21, "PD-0161": 38 }, { vendorQuotationRef: "AVF-QT-2609-118", neededByDate: "2026-10-08" }); await api("pur01", "POST", `/purchase-orders/${enc(S.po.I.id)}/submit-approval`); });
  // PR9 (FD) forwarded, still in purchasing review
  at("2026-09-25 09:30", "PR9", async () => { await pr("PR9", "fac01", { productionOrderId: S.pdo.J1.id }, [prLine("MAT-0008", 64, "2026-10-10", "G131"), prLine("SP-0007", 4, "2026-10-10", "G131", "5230-15")]); S.pr.PR9.owner = "fac01"; await prToPurchasing("PR9", { approveBy: null }); });
  // PR11 (SD) + PR12 (ED J2) still at the store
  at("2026-09-28 10:00", "PR11", async () => { await pr("PR11", "pur01", { requestCode: "SD" }, [prLine("MAT-0006", 30, "2026-10-15", "G132"), prLine("SP-0004", 20, "2026-10-15", "G132")]); await approve("purchase-requests", S.pr.PR11.id, "ops01", "pur01"); });
  at("2026-09-29 09:45", "PR12", async () => { await pr("PR12", "prj02", { projectId: S.prj.J2.id }, [prLine("EQ-0008", 24, "2026-10-14"), prLine("MAT-0005", 10, "2026-10-14")]); await approve("purchase-requests", S.pr.PR12.id, "ops01", "prj02"); });
  // PR13 (general) closed from stock
  at("2026-09-15 10:00", "PR13 stock", async () => {
    await pr("PR13", "pur01", {}, [prLine("PD-0004", 24, "2026-09-17", "G120", "5230-11"), prLine("PD-0645", 20, "2026-09-17", "G120", "5230-11")]);
    await approve("purchase-requests", S.pr.PR13.id, "ops01", "pur01");
    const doc = (await api("store01", "GET", `/purchase-requests/${enc(S.pr.PR13.id)}`)).purchaseRequest;
    await api("store01", "POST", `/purchase-requests/${enc(S.pr.PR13.id)}/store-review`, { lines: doc.lines.map((l) => ({ lineId: l.id, decision: "stock" })), remark: "มีในคลังครบ" });
    await api("store01", "POST", `/purchase-requests/${enc(S.pr.PR13.id)}/store-issues`, { lines: doc.lines.map((l) => ({ lineId: l.id, qty: l.qtyRequested })), issuedDate: "2026-09-16", issuedBy: S.name("store01") });
  });
  // pending + drafts
  at("2026-09-27 14:10", "PR15 pending", async () => { await pr("PR15", "pur01", {}, [prLine("PD-0062", 4, "2026-10-09", "G131", "5230-11"), prLine("PD-0036", 200, "2026-10-09", "G131", "5230-11")]); await submitPr("PR15", "pur01"); });
  at("2026-09-30 15:30", "PR draft J1 (Blower)", () => pr("PRA", "prj01", { projectId: S.prj.J1.id, itemIds: [itemIdx("J1", 1)] }, [prLine("EQ-0005", 1, "2026-10-20", "G143", "5100-10", ["Blower FRP 7.5 kW สำรอง"])]));
  at("2026-09-30 16:05", "PR14 draft", () => pr("PR14", "fac02", { requestCode: "FD" }, [prLine("TO-0005", 1, "2026-10-15", "G131", "5230-31")]));

  // ── store receipts ──
  async function receipt(code, src, patch, flow) {
    const r = await api("store01", "POST", "/store-receipts", { receiptCode: code });
    const id = r.storeReceipt.id;
    let doc = r.storeReceipt;
    if (src) { const p = await api("store01", "PATCH", `/store-receipts/${enc(id)}`, { sourceRequisitionId: S.mr[src].id }); doc = p.storeReceipt; }
    if (patch) { const p = await api("store01", "PATCH", `/store-receipts/${enc(id)}`, typeof patch === "function" ? patch(doc) : patch); doc = p.storeReceipt; }
    if (flow === "submit" || flow === "final" || flow === "posted") await api("store01", "POST", `/store-receipts/${enc(id)}/submit-approval`);
    if (flow === "final" || flow === "posted") await api("ops01", "POST", `/store-receipts/${enc(id)}/approve`);
    if (flow === "posted") await api("store01", "POST", `/store-receipts/${enc(id)}/post`);
    return id;
  }
  const retLines = (want) => (doc) => ({ returnedBy: S.name("prj01"), receivedBy: S.name("store01"), lines: doc.lines.map((l) => ({ ...l, qty: want[l.productCode] ?? 0 })).filter((l) => l.qty > 0) });
  at("2026-08-14 10:00", "JP-1 posted (MR J1-A)", () => receipt("JP", "J1A", retLines({ "MAT-0001": 10, "SP-0001": 8, "PD-0034": 5 }), "posted"));
  at("2026-09-30 13:40", "JP-2 final not posted", async () => { S.jp2 = await receipt("JP", "J1A", retLines({ "MAT-0001": 6, "MAT-0003": 4, "SP-0001": 6 }), "final"); });
  at("2026-09-08 10:00", "FG posted", () => receipt("FG", null, { reference: "PdO J7 — ถังสำรองขายหน้าร้าน", lines: [{ id: "srline_fg_1", productId: P("EQ-0001"), qty: 1, unitCost: 54000 }] }, "posted"));
  at("2026-09-26 16:00", "FG final (รอรับเข้าคลัง)", () => receipt("FG", null, { reference: "ชิ้นงานคืนจากหน้างาน PQ202604-071-TA-PN", lines: [{ id: "srline_fg_2", productId: P("EQ-0008"), qty: 6, unitCost: 1650 }] }, "final"));
  at("2026-09-30 17:00", "JU draft", () => receipt("JU", null, { reason: "ปรับยอดหลังตรวจนับประจำเดือนกันยายน", lines: [{ id: "srline_ju_1", productId: P("SP-0002"), qty: 640 }] }, null));
  // direct issue slips: OU draft, PM pending
  at("2026-09-29 10:30", "OU draft", async () => {
    const r = await api("store01", "POST", "/material-requisitions", { ownerDepartment: "store", issueCode: "OU" });
    await api("store01", "PATCH", `/material-requisitions/${enc(r.materialRequisition.id)}`, { lines: mrLines([["PD-0645", "consumable", 10], ["PD-0004", "consumable", 10]]), customerName: "ใช้ภายในสำนักงาน", productName: "เบิกใช้ทั่วไป" });
  });
  at("2026-09-30 09:20", "PM pending", async () => {
    const r = await api("store01", "POST", "/material-requisitions", { ownerDepartment: "store", issueCode: "PM" });
    const id = r.materialRequisition.id;
    await api("store01", "PATCH", `/material-requisitions/${enc(id)}`, { lines: mrLines([["SP-0007", "other", 2], ["SP-0005", "other", 1]]), customerName: "ซ่อมบำรุงเครื่องจักรโรงงาน", productName: "เปลี่ยนสายพานและซีลปั๊มหมุนเวียน" });
    await api("store01", "POST", `/material-requisitions/${enc(id)}/submit-approval`, undefined, { allow: [400] });
  });

  // ── stock: manual adjustment + low stock crossing ──
  at("2026-09-23 16:30", "manual adjust สกรู", () => api("store01", "POST", "/stock-movements", { productId: P("SP-0001"), kind: "adjust", delta: -3, reason: "ตรวจนับพบเกลียวเสีย 3 ตัว ตัดออกจากยอด" }));

  // ── tools ──
  at("2026-08-03 09:00", "common tools", async () => {
    S.ct1 = (await api("store01", "POST", "/tool-holdings/tools", { name: "บันไดอะลูมิเนียม 6 ขั้น", unit: "ตัว", qty: 4 })).product;
    S.ct2 = (await api("store01", "POST", "/tool-holdings/tools", { name: "ตลับเมตร 5 เมตร", unit: "อัน", qty: 10 })).product;
  });
  const tl = (when, mode, dept, team, lines, note = "") => at(when, `TL ${mode} ${team}`, () => api("store01", "POST", "/tool-holdings/issue", {
    mode, departmentId: S.dept[dept], teamId: S.team[team], note,
    lines: lines.map(([code, qty]) => ({ productId: code === "CT1" ? (S.ct1.id ?? S.ct1._id) : code === "CT2" ? (S.ct2.id ?? S.ct2._id) : P(code), qty })),
  }));
  tl("2026-08-04 08:30", "issue", "Factory", "ทีม FRP", [["TO-0001", 2], ["TO-0002", 3], ["TO-0004", 1], ["CT1", 1], ["CT2", 3]], "เบิกประจำทีมผลิต FRP");
  tl("2026-08-04 08:45", "issue", "Factory", "ทีมเหล็ก", [["TO-0002", 2], ["TO-0006", 1], ["CT2", 2]]);
  tl("2026-08-05 08:30", "issue", "Project", "ทีมติดตั้ง A", [["TO-0003", 1], ["TO-0006", 1], ["TO-0001", 1], ["CT1", 1]], "งานติดตั้ง PQ202607-112-SC-OR");
  tl("2026-09-15 16:00", "return", "Factory", "ทีม FRP", [["TO-0002", 1]], "คืนเครื่องเจียรชำรุด 1 เครื่อง");
  tl("2026-09-16 08:30", "issue", "Project", "ทีมติดตั้ง B", [["TO-0001", 1], ["TO-0002", 1]]);

  // ── product requests ──
  at("2026-08-05 10:00", "PRQ approved 1", async () => {
    const r = await api("fac01", "POST", "/product-requests", { name: "ผ้าใยแก้ว Surface Veil 30 g", unit: "ม้วน", categoryId: S.cat["วัตถุดิบ"], specifications: "หน้ากว้าง 1 m ยาว 200 m", reason: "ใช้ทำผิวชั้นในถังเก็บกรด ลูกค้าเริ่มกำหนดในสเปก" });
    C.setClock("2026-08-05 14:30");
    await api("store01", "POST", `/product-requests/${r.productRequest.id}/approve`, { code: "MAT-0011", categoryId: S.cat["วัตถุดิบ"] });
  });
  at("2026-08-20 11:00", "PRQ approved 2", async () => {
    const r = await api("prj01", "POST", "/product-requests", { name: "แคลมป์รัดท่อ SUS304 Ø 4 นิ้ว", unit: "ตัว", categoryId: S.cat["อะไหล่"], specifications: "หนา 2 mm พร้อมยางรอง", reason: "ใช้ยึดท่อ PVC หน้างานแทนการเชื่อม" });
    C.setClock("2026-08-21 09:10");
    await api("store01", "POST", `/product-requests/${r.productRequest.id}/approve`, { code: "SP-0008", categoryId: S.cat["อะไหล่"] });
  });
  at("2026-09-10 13:00", "PRQ rejected", async () => {
    const r = await api("pur01", "POST", "/product-requests", { name: "ถุงมือกันสารเคมี ไนไตรล์ (ยาว)", unit: "คู่", categoryId: S.cat["อะไหล่"], specifications: "ยาว 33 cm", reason: "ฝ่ายผลิตขอใช้งานผสมเรซิ่น" });
    C.setClock("2026-09-10 16:20");
    await api("store01", "POST", `/product-requests/${r.productRequest.id}/reject`, { comment: "มีรหัสเดิมแล้ว PD-0645 ถุงมือยาง (ไนไตรบาง) ใช้แทนได้" });
  });
  at("2026-09-29 16:10", "PRQ pending (from PR)", () => api("prj01", "POST", "/product-requests", { name: "Expansion Joint PTFE Ø 300 mm", unit: "ตัว", categoryId: S.cat["อุปกรณ์ระบบ"], specifications: "PN10 ยาว 150 mm หน้าแปลน FRP", reason: "ใช้ต่อท่อดูดเข้า Scrubber ลดแรงสั่นจาก Blower", sourcePurchaseRequestId: S.pr.PR16.id }));
  at("2026-09-30 10:15", "PRQ pending 2", () => api("fac02", "POST", "/product-requests", { name: "ใบตัดไฟเบอร์ 14 นิ้ว", unit: "ใบ", categoryId: S.cat["อะไหล่"], specifications: "สำหรับเครื่องตัดไฟเบอร์ TO-0004", reason: "ใช้ตัดเหล็กฉากในงานโครงสร้าง" }));
  at("2026-10-01 10:30", "PRQ pending 3", () => api("pur01", "POST", "/product-requests", { name: "วาล์วกันกลับ PVC 2 นิ้ว", unit: "ตัว", categoryId: S.cat["อะไหล่"], specifications: "Swing check ทนกรด", reason: "ลูกค้าหลายรายสั่งพร้อมปั๊ม" }));

  // ── Cost Control ──
  const ccLines = (rows) => rows.map(([kind, seq, description, model, supplierName, qty, unit, unitCost]) => ({ kind, seq, description, model: model ?? "", supplierName: supplierName ?? "", qty: qty ?? null, unit: unit ?? "", unitCost: unitCost ?? null }));
  const CC_BIG = ccLines([
    ["group", "1", "งานตัวถัง Wet Scrubber"],
    ["item", "1.1", "เรซิ่น Vinyl Ester", "Derakane 411", "บริษัท สยามเคมีภัณฑ์ จำกัด", 650, "kg", 149],
    ["item", "1.2", "ใยแก้ว CSM 450", "", "บริษัท สยามเคมีภัณฑ์ จำกัด", 380, "kg", 77],
    ["item", "1.3", "ใยแก้วทอ WR 600", "", "บริษัท สยามเคมีภัณฑ์ จำกัด", 220, "kg", 90],
    ["sub", "", "รวมค่าเสื่อมแม่พิมพ์ทรงกระบอก Ø 1,800"],
    ["item", "1.4", "Packing PP Pall Ring 2 นิ้ว", "Pall Ring", "บริษัท ผู้ขายตัวอย่าง จำกัด", 3.2, "m³", 18500],
    ["group", "2", "งาน Blower และท่อ"],
    ["item", "2.1", "Blower FRP 7.5 kW", "CF-750", "บริษัท ผู้ขายตัวอย่าง จำกัด", 1, "ชุด", 81000],
    ["item", "2.2", "ท่อ FRP Ø 300 mm", "", "ผลิตเอง", 36, "เมตร", 1650],
    ["sub", "", "รวมข้องอ 90° 4 ตัว และหน้าแปลน"],
    ["item", "2.3", "ปั๊มสารเคมี Magnetic Drive 1.5 kW", "MD-150", "บริษัท ผู้ขายตัวอย่าง จำกัด", 2, "ชุด", 24800],
    ["group", "3", "งานติดตั้ง"],
    ["item", "3.1", "ค่าแรงติดตั้ง (ทีม 5 คน x 6 วัน)", "", "", 30, "แรง", 650],
    ["item", "3.2", "ค่าเครน 25 ตัน", "", "บริษัท ไทยสตีลซัพพลาย จำกัด", 1, "เที่ยว", 12000],
    ["sub", "", "รวมค่าขนส่งชิ้นงานไปหน้างาน 2 เที่ยว"],
  ]);
  async function cc(key, when, body, flow) {
    at(when, `CC ${key}`, async () => {
      const r = await api("bd01", "POST", "/cost-controls", { ...body, ...(body.sow ? { scopeOfWorkId: S.sow[body.sow].id } : {}), sow: undefined });
      S.cc[key] = r.costControl;
      if (flow === "submit" || flow === "final") await api("bd01", "POST", `/cost-controls/${enc(r.costControl.id)}/submit-approval`);
      if (flow === "final") await api("ops01", "POST", `/cost-controls/${enc(r.costControl.id)}/approve`);
    });
  }
  cc("J7", "2026-04-29 14:00", { sow: "J7", jobName: "ถังเก็บโซดาไฟ 10,000 ลิตร 2 ใบ", workType: "TA", lines: CC_BIG.slice(0, 6) }, "final");
  cc("J8", "2026-05-27 15:00", { sow: "J8", jobName: "ถังเก็บโซดาไฟ อาคาร 1", workType: "TA", lines: CC_BIG.slice(0, 5) }, "final");
  cc("J6", "2026-06-24 14:00", { sow: "J6", jobName: "ตะแกรง FRP ทางเดินบ่อบำบัด", workType: "GA", lines: CC_BIG.slice(6, 11) }, "final");
  cc("J1", "2026-07-10 14:00", { sow: "J1", jobName: "ระบบบำบัดอากาศ Wet Scrubber อาคารผลิต 2", workType: "SC", lines: CC_BIG }, "final");
  cc("J10", "2026-09-07 15:00", { sow: "J10", jobName: "ระบบดักฝุ่นห้องบด เฟส 2", workType: "BF", lines: CC_BIG.slice(6) }, "final");
  cc("J5", "2026-09-25 09:30", { sow: "J5", jobName: "ระบบ Activated Carbon หอกลั่นที่ 3", workType: "SC", lines: CC_BIG.slice(0, 8) }, "submit");
  cc("blank", "2026-09-30 13:00", { jobName: "ประมาณราคา ถัง FRP 5,000 ลิตร (ลูกค้าใหม่)", workType: "TA", lines: [] }, null);
  cc("J3", "2026-09-30 16:20", { sow: "J3", jobName: "ระบบดูดไอกรด ห้องชุบ — Manhole 5 mm.", workType: "SC", docDate: "2026-09-30", sourceFileName: "PQ202609-131-SC-OR Cost Control.xlsx — Manhole 5 mm., SC", lines: CC_BIG }, null);
  at("2026-09-30 16:25", "CC J3 submittedBy", () => api("bd01", "PATCH", `/cost-controls/${enc(S.cc.J3.id)}`, { submittedBy: S.name("bd01"), remarks: "ราคาวัสดุอ้างอิงใบเสนอราคาผู้ขายเดือนกันยายน" }));

  // ── password-reset requests ──
  const forgot = (when, identifier, note) => at(when, `forgot ${identifier}`, () => C.raw("POST", "/auth/forgot-password", { identifier, note }));
  forgot("2026-09-12 08:10", "prj02", "");
  at("2026-09-12 09:00", "dismiss prj02", async () => {
    const { requests } = await api("admin", "GET", "/users/password-resets");
    const r = requests.find((x) => x.username === "prj02" && x.status === "pending");
    await api("admin", "POST", `/users/password-resets/${r.id}/dismiss`);
  });
  forgot("2026-09-30 08:05", "store02", "ลืมรหัสหลังกลับจากลาพักร้อน");
  at("2026-09-30 08:30", "issue store02", async () => {
    const { requests } = await api("admin", "GET", "/users/password-resets");
    const r = requests.find((x) => x.username === "store02" && x.status === "pending");
    const out = await api("admin", "POST", `/users/password-resets/${r.id}/issue`);
    S.tempPassword = { username: "store02", password: out.temporaryPassword };
  });
  forgot("2026-09-29 17:40", "fac02", "");
  forgot("2026-09-30 07:55", "fac02", "เข้าระบบไม่ได้ครับ");
  forgot("2026-10-01 08:20", "acc01", "รบกวนโทรกลับ 081-400-1021 ช่วงบ่าย");
}

function readNotifications(C, S) {
  // people read their bell regularly — leave only the last few days unread
  C.at("2026-09-28 18:00", "mark notifications read", async () => {
    for (const [u] of S.people) {
      if (u === "sales04" || u === "store02") continue;
      await C.api(u, "POST", "/notifications/mark-all-read");
    }
  });
}

// ── main ──

const REPO = process.env.ERP_REPO || path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dbName = C.assertDemoTarget();
const require = createRequire(path.join(REPO, "package.json"));
const { MongoClient } = require("mongodb");

const mongo = await new MongoClient(process.env.MONGODB_URI).connect();
console.log(`Dropping and re-seeding ${dbName} …`);
await mongo.db(dbName).dropDatabase();

await C.startApp(REPO);
const assets = makeAssets(REPO);
const S = {}; // shared state between parts (ids, numbers)
await masterData(C, assets, S);
await salesData(C, assets, S);
await opsData(C, assets, S);
readNotifications(C, S);
const t0 = Date.now();
await C.runSchedule();
console.log(`schedule done in ${Math.round((Date.now() - t0) / 1000)}s`);

const db = mongo.db(dbName);
const cols = await db.listCollections().toArray();
const counts = {};
for (const c of cols.map((x) => x.name).sort()) counts[c] = await db.collection(c).countDocuments();
console.log(JSON.stringify(counts));
console.log("temporary password:", JSON.stringify(S.tempPassword));
if (process.env.SEED_OUT) (await import("node:fs")).writeFileSync(process.env.SEED_OUT, JSON.stringify({ tempPassword: S.tempPassword, srApprovalUrl: S.srApprovalUrl, srDraftId: S.srDraftId, quotes: S.q, jp2: S.jp2 }, null, 1));
await mongo.close();
process.exit(0);
