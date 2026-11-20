import { mkdirSync, writeFileSync } from "node:fs";
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import {
  ensurePlans,
  person,
  publicProject,
  type Person,
} from "./support/people";
import { cleanupE2eUsers, loginThroughUi } from "./support/test-user";

interface Finding {
  page: string;
  rule: string;
  impact: string;
  selector: string;
}

const findings: Finding[] = [];
const counts: Record<string, Record<string, number>> = {};
let owner: Person;
let adminUser: Person;
let projectId = "";

test.beforeAll(async () => {
  await ensurePlans();
  owner = await person("a11y");
  adminUser = await person("a11yadmin", "admin");
  projectId = (await publicProject(owner, "A11y Song")).id;
});

test.afterAll(async () => {
  await cleanupE2eUsers();
});

async function scan(page: Page, name: string): Promise<void> {
  await page.waitForLoadState("networkidle");
  const result = await new AxeBuilder({ page }).analyze();
  counts[name] = {};
  const blocking: string[] = [];
  for (const v of result.violations) {
    const impact = v.impact ?? "unknown";
    counts[name][impact] = (counts[name][impact] ?? 0) + v.nodes.length;
    for (const node of v.nodes) {
      findings.push({
        page: name,
        rule: v.id,
        impact,
        selector: node.target.join(" "),
      });
      if (impact === "critical" || impact === "serious") {
        blocking.push(`${v.id} (${impact}) ${node.target.join(" ")}`);
      }
    }
  }
  mkdirSync("e2e-results/a11y", { recursive: true });
  writeFileSync(
    `e2e-results/a11y/${name.replace(/\W+/g, "_")}.json`,
    JSON.stringify(
      { page: name, counts: counts[name], findings: findings.filter((f) => f.page === name) },
      null,
      2,
    ),
  );
  expect(blocking).toEqual([]);
}

test("A11Y-01 landing page", async ({ page }) => {
  await page.goto("/");
  await scan(page, "/");
});

test("A11Y-02 login page", async ({ page }) => {
  await page.goto("/login");
  await scan(page, "/login");
});

test("A11Y-03 register page", async ({ page }) => {
  await page.goto("/register");
  await scan(page, "/register");
});

test("A11Y-04 explore page", async ({ page }) => {
  await page.goto("/explore");
  await expect(page.getByText("A11y Song").first()).toBeVisible();
  await scan(page, "/explore");
});

test("A11Y-05 rankings page", async ({ page }) => {
  await page.goto("/rankings");
  await scan(page, "/rankings");
});

test("A11Y-06 plans page", async ({ page }) => {
  await page.goto("/plans");
  await scan(page, "/plans");
});

test.describe("signed in", () => {
  test.beforeEach(async ({ page }) => {
    await loginThroughUi(page, owner.user);
  });

  test("A11Y-07 my projects page", async ({ page }) => {
    await page.goto("/projects");
    await expect(page.getByText("A11y Song").first()).toBeVisible();
    await scan(page, "/projects");
  });

  test("A11Y-08 project detail page", async ({ page }) => {
    await page.goto(`/projects/${projectId}`);
    await expect(page.getByText("A11y Song").first()).toBeVisible();
    await scan(page, "/projects/:id");
  });

  test("A11Y-09 profile page", async ({ page }) => {
    await page.goto("/profile");
    await scan(page, "/profile");
  });

  test("A11Y-10 midi editor", async ({ page }) => {
    await page.goto(`/projects/${projectId}/edit`);
    await page.getByRole("button", { name: /^File$/ }).waitFor();
    await scan(page, "/projects/:id/edit");
  });
});

test("A11Y-11 admin users page", async ({ page }) => {
  await loginThroughUi(page, adminUser.user);
  await page.goto("/admin/users");
  await page.locator('input[name="q"]').waitFor();
  await scan(page, "/admin/users");
});
