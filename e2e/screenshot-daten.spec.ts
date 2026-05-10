import { test } from "@playwright/test";

// Screenshot der neuen Berater-Datenpool-Page
test("berater datenpool screenshot — admin persona", async ({ page }) => {
  await page.goto("/api/dev/test-login?user=claude-tester&next=/admin/daten", { waitUntil: "networkidle" });
  await page.waitForLoadState("networkidle");
  await page.screenshot({ path: "test-results/berater-daten.png", fullPage: true });
});
