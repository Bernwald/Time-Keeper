// Adds localhost redirect URLs to the Supabase project's auth allow list.
//
// Why this is necessary: Supabase only honors `redirectTo` from the SDK if the
// URL appears in the project's "Redirect URLs" allow list. Otherwise it
// silently falls back to the Site URL (production), so localhost magic-link /
// password-reset flows bounce users to prod.
//
// Two phases:
//   1. discover — open browser, wait for actual login (detect a real element
//      on the URL Configuration page), then dump page structure + screenshot
//      so we can verify selectors before touching anything.
//   2. edit — using selectors confirmed in phase 1, add the missing URLs.
//
// Run modes:
//   node scripts/supabase-redirect-urls.mjs discover
//   node scripts/supabase-redirect-urls.mjs edit

import { chromium } from "playwright";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const profileDir = path.join(repoRoot, ".playwright-supabase");
const screenshotsDir = path.join(profileDir, "screenshots");
const dumpDir = path.join(profileDir, "dumps");
fs.mkdirSync(screenshotsDir, { recursive: true });
fs.mkdirSync(dumpDir, { recursive: true });

const PROJECT_REF = "atguaothhmndqofrlaux";
const TARGET_URL = `https://supabase.com/dashboard/project/${PROJECT_REF}/auth/url-configuration`;
const URLS_TO_ADD = [
  "http://localhost:3000",
  "http://localhost:3000/**",
  "http://localhost:3000/auth/callback",
  "http://localhost:3000/auth/confirm",
];

const LOGIN_TIMEOUT_MS = 5 * 60 * 1000;
const mode = process.argv[2] ?? "discover";

const log = (msg) => {
  const ts = new Date().toISOString().slice(11, 19);
  console.log(`[${ts}] ${msg}`);
};

const shot = async (page, name) => {
  const file = path.join(screenshotsDir, `${name}.png`);
  await page.screenshot({ path: file, fullPage: true });
  log(`screenshot → ${path.relative(repoRoot, file)}`);
};

async function openLoggedInPage() {
  log("launching Chromium with persistent profile…");
  const ctx = await chromium.launchPersistentContext(profileDir, {
    headless: false,
    viewport: { width: 1400, height: 900 },
    args: ["--disable-blink-features=AutomationControlled"],
  });
  const page = ctx.pages()[0] ?? (await ctx.newPage());

  log(`navigating to ${TARGET_URL}`);
  await page.goto(TARGET_URL, { waitUntil: "domcontentloaded" });

  log("waiting for the URL Configuration page to actually render (max 5min)…");
  // Two-step detector: first the pathname must match exactly (i.e. NOT
  // /dashboard/sign-in?returnTo=...), then a real heading must be visible.
  // The pathname check via URL parsing is required because `includes()` also
  // matches the returnTo query param on the sign-in page.
  const expectedPath = `/dashboard/project/${PROJECT_REF}/auth/url-configuration`;
  try {
    await page.waitForURL(
      (u) => new URL(u.toString()).pathname === expectedPath,
      { timeout: LOGIN_TIMEOUT_MS },
    );
    await page
      .getByRole("heading", { name: /url configuration/i })
      .first()
      .waitFor({ state: "visible", timeout: 30_000 });
  } catch {
    log("timed out / wrong page. Aborting.");
    await shot(page, "timeout");
    await ctx.close();
    process.exit(1);
  }

  // Let the page settle.
  await page.waitForLoadState("networkidle").catch(() => {});
  await page.waitForTimeout(1500);
  return { ctx, page };
}

async function discover() {
  const { ctx, page } = await openLoggedInPage();

  await shot(page, "discover-loaded");

  // Dump all buttons (text + role name) and all text inputs with placeholders.
  const data = await page.evaluate(() => {
    const buttons = Array.from(document.querySelectorAll("button")).map((b) => ({
      text: (b.innerText || "").trim().slice(0, 80),
      ariaLabel: b.getAttribute("aria-label"),
      type: b.getAttribute("type"),
      disabled: b.disabled,
    }));
    const inputs = Array.from(document.querySelectorAll("input, textarea")).map(
      (el) => ({
        tag: el.tagName.toLowerCase(),
        type: el.getAttribute("type"),
        placeholder: el.getAttribute("placeholder"),
        ariaLabel: el.getAttribute("aria-label"),
        name: el.getAttribute("name"),
        value: (el.value || "").slice(0, 200),
      }),
    );
    // Find sections by heading text proximity.
    const headings = Array.from(
      document.querySelectorAll("h1,h2,h3,h4,h5,h6,[role='heading']"),
    ).map((h) => (h.innerText || "").trim().slice(0, 120));
    return { buttons, inputs, headings, url: location.href };
  });

  const dumpFile = path.join(dumpDir, "page-structure.json");
  fs.writeFileSync(dumpFile, JSON.stringify(data, null, 2));
  log(`dumped page structure → ${path.relative(repoRoot, dumpFile)}`);
  log(`current URL: ${data.url}`);
  log(`headings: ${data.headings.join(" | ")}`);
  log(`buttons (${data.buttons.length}): ${data.buttons
    .filter((b) => b.text)
    .map((b) => b.text)
    .join(" | ")}`);
  log(
    `inputs (${data.inputs.length}): ${data.inputs
      .map((i) => `${i.tag}[${i.type ?? ""}]${i.placeholder ? ` ph="${i.placeholder}"` : ""}${i.value ? ` val="${i.value.slice(0, 40)}"` : ""}`)
      .join(" || ")}`,
  );

  log("leaving browser open 30s. Close it or wait.");
  await page.waitForTimeout(30000);
  await ctx.close();
}

async function readExistingRedirectUrls(page) {
  // The Redirect URLs are rendered as text rows under the "Redirect URLs"
  // section. We extract everything that looks like a URL on the page; the
  // Site URL input is excluded because we read it from the input value
  // separately. Imperfect but good enough to detect duplicates.
  return page.evaluate(() => {
    const all = new Set();
    document.querySelectorAll("*").forEach((el) => {
      if (el.children.length > 0) return; // leaf nodes only
      const t = (el.textContent || "").trim();
      if (/^https?:\/\/\S+$/.test(t)) all.add(t);
    });
    return [...all];
  });
}

async function edit() {
  const { ctx, page } = await openLoggedInPage();
  await shot(page, "edit-01-loaded");

  const existing = await readExistingRedirectUrls(page);
  log(`existing redirect URLs (${existing.length}):`);
  existing.forEach((u) => log(`  - ${u}`));

  for (const url of URLS_TO_ADD) {
    if (existing.includes(url)) {
      log(`skip (already present): ${url}`);
      continue;
    }

    log(`adding: ${url}`);

    // 1. Click the page-level "Add URL" button.
    await page.getByRole("button", { name: /^add url$/i }).first().click();

    // 2. Wait for the dialog. Supabase uses a modal; the input inside it is
    // the only freshly-rendered text input.
    const dialog = page.getByRole("dialog");
    await dialog.waitFor({ state: "visible", timeout: 5000 });

    // 3. Fill the URL into the dialog input. Try a textbox role first; fall
    // back to the first <input> inside the dialog.
    const input = dialog
      .getByRole("textbox")
      .or(dialog.locator("input"))
      .first();
    await input.waitFor({ state: "visible", timeout: 5000 });
    await input.fill(url);

    await shot(page, `edit-modal-filled-${URLS_TO_ADD.indexOf(url)}`);

    // 4. Submit. The modal's confirm button reads "Save URLs" (the modal
    // also contains an "Add URL" button for batch-adding more fields, which
    // we explicitly do NOT want to click here).
    await dialog
      .getByRole("button", { name: /^save urls?$/i })
      .first()
      .click();

    // 5. Wait for the dialog to close and the new URL to appear in the list.
    await dialog.waitFor({ state: "hidden", timeout: 10_000 });
    await page
      .getByText(url, { exact: true })
      .first()
      .waitFor({ state: "visible", timeout: 10_000 });

    log(`✅ added: ${url}`);
  }

  await shot(page, "edit-99-final");

  // Verify
  const finalList = await readExistingRedirectUrls(page);
  const missing = URLS_TO_ADD.filter((u) => !finalList.includes(u));
  if (missing.length === 0) {
    log("✅ all target URLs are now in the allow list.");
  } else {
    log(`⚠️ still missing: ${missing.join(", ")}`);
  }

  log("leaving browser open 10s.");
  await page.waitForTimeout(10000);
  await ctx.close();
  process.exit(missing.length === 0 ? 0 : 2);
}

if (mode === "discover") {
  discover().catch((err) => {
    console.error("FATAL:", err);
    process.exit(99);
  });
} else if (mode === "edit") {
  edit().catch((err) => {
    console.error("FATAL:", err);
    process.exit(99);
  });
} else {
  console.error(`unknown mode: ${mode}`);
  process.exit(1);
}
