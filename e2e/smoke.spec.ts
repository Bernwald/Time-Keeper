import { test, expect } from "@playwright/test";

// Baseline smoke that proves the autonomous dev loop is wired up:
// 1. Dev-only test-login endpoint accepts the claude-tester credential
// 2. After login the middleware does not bounce us back to /auth/anmelden
// Per-feature specs should live next to this file (e.g. chat.spec.ts) and
// extend the flow with feature-specific assertions.

test("test-login endpoint logs in claude-tester and lands on /", async ({ page }) => {
  const response = await page.goto("/api/dev/test-login?user=claude-tester&next=/", {
    waitUntil: "domcontentloaded",
  });
  expect(response?.status(), "test-login must succeed (404 means NODE_ENV != development)").toBeLessThan(400);
  await expect(page).toHaveURL(/\/$/);
  // Middleware would redirect anonymous users to /auth/anmelden — assert we did
  // not land there.
  await expect(page).not.toHaveURL(/\/auth\/anmelden/);
});
