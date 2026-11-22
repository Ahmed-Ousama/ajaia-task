/**
 * End-to-end check of the real-time collaboration features in two real browsers (Alice + Bob).
 *   BASE_URL=http://localhost:3100 node e2e/realtime.e2e.mjs        (defaults to local dev)
 *   CHROME=/usr/bin/google-chrome  SHOTS=./e2e/shots                 (optional)
 *   PROXY=socks5://127.0.0.1:18080   (optional, e.g. an `ssh -D` tunnel when the local network meddles with HTTP)
 * Creates its own document (shared Alice → Bob) and deletes it at the end.
 */
import { chromium } from "playwright-core";
import { mkdirSync } from "node:fs";

const BASE = process.env.BASE_URL ?? "http://localhost:3100";
const SHOTS = process.env.SHOTS ?? "";
const PASSWORD = "password123";
const results = [];
let failed = false;

async function step(name, fn) {
  const t0 = Date.now();
  try {
    await fn();
    results.push(`✅ ${name} (${Date.now() - t0} ms)`);
  } catch (err) {
    failed = true;
    results.push(`❌ ${name}: ${err.message.split("\n")[0]}`);
  }
}

async function login(browser, email) {
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/login`);
  await page.fill("#email", email);
  await page.fill("#password", PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL(`${BASE}/`, { timeout: 15000 });
  return { ctx, page };
}

const shot = async (page, name) => SHOTS && page.screenshot({ path: `${SHOTS}/${name}.png` });

const browser = await chromium.launch({
  executablePath: process.env.CHROME ?? "/usr/bin/google-chrome",
  headless: true,
  ...(process.env.PROXY ? { proxy: { server: process.env.PROXY } } : {}),
});
if (SHOTS) mkdirSync(SHOTS, { recursive: true });
const stamp = Date.now().toString(36);
let alice, bob, docId;

try {
  await step("Alice and Bob sign in through the app's login page (Keycloak behind it)", async () => {
    alice = await login(browser, "alice@ajaia.test");
    bob = await login(browser, "bob@ajaia.test");
  });

  await step("Alice creates a document and shares it with Bob (editor)", async () => {
    const res = await alice.page.request.post(`${BASE}/api/documents`, { data: { title: `Realtime check ${stamp}` } });
    docId = (await res.json()).id;
    const share = await alice.page.request.post(`${BASE}/api/documents/${docId}/shares`, {
      data: { email: "bob@ajaia.test", role: "EDITOR" },
    });
    if (share.status() !== 201) throw new Error(`share failed: ${share.status()}`);
  });

  await step("Dashboard search is instant (results update on each keystroke, no server round trip)", async () => {
    await alice.page.goto(`${BASE}/`);
    const box = alice.page.getByLabel("Search documents");
    await box.click();
    const t0 = Date.now();
    await box.pressSequentially(`realtime check ${stamp}`, { delay: 0 });
    await alice.page.locator("main ul li", { hasText: `Realtime check ${stamp}` }).waitFor({ timeout: 2000 });
    const rows = await alice.page.locator("main ul li").count();
    const ms = Date.now() - t0;
    if (rows !== 1) throw new Error(`expected 1 matching row, got ${rows}`);
    if (ms > 1500) throw new Error(`search took ${ms} ms`);
    results.push(`   ↳ typed ${`realtime check ${stamp}`.length} chars and got the filtered list in ${ms} ms`);
  });

  await step("Both open it and the live stream connects", async () => {
    await alice.page.goto(`${BASE}/documents/${docId}`);
    await bob.page.goto(`${BASE}/documents/${docId}`);
    for (const p of [alice.page, bob.page]) await p.getByTestId("live-status").getByText("Live").waitFor({ timeout: 8000 });
  });

  await step("Share dialog lists workspace people (without those who already have access) and filters as you type", async () => {
    await alice.page.getByRole("button", { name: /^Share/ }).click();
    const box = alice.page.getByLabel("Person to share with");
    await box.click();
    const list = alice.page.locator("#share-people");
    await list.getByText("Carol Chen").waitFor({ timeout: 3000 });
    if (await list.getByText("Bob Builder").count()) throw new Error("Bob already has access but is suggested");
    await box.fill("car");
    if ((await list.getByRole("option").count()) !== 1) throw new Error("filter did not narrow to Carol");
    await list.getByText("Carol Chen").click();
    if ((await box.inputValue()) !== "carol@ajaia.test") throw new Error(`picked ${await box.inputValue()}`);
    await shot(alice.page, "share-picker");
    await alice.page.getByRole("button", { name: "Close" }).click();
  });

  await step("Presence: Alice sees Bob's avatar", async () => {
    await alice.page.locator('[title^="Bob Builder is"]').waitFor({ timeout: 5000 });
  });

  const typed = `Hello from Bob ${stamp}`;
  await step("Bob types → Alice sees 'Bob Builder is editing…' while he types", async () => {
    await bob.page.locator(".ProseMirror").click();
    await bob.page.keyboard.type(typed, { delay: 40 });
    await alice.page.getByTestId("live-editor").getByText("Bob Builder is editing").waitFor({ timeout: 4000 });
    await shot(alice.page, "alice-sees-bob-typing");
  });

  await step("Bob's text appears in Alice's editor without a refresh", async () => {
    await alice.page.locator(".ProseMirror").getByText(typed).waitFor({ timeout: 6000 });
  });

  await step("Alice sees Bob's caret with his name, in the same colour as his avatar", async () => {
    const label = alice.page.locator(".remote-caret-label", { hasText: "Bob Builder" });
    await label.waitFor({ timeout: 4000 });
    const caretColor = await label.evaluate((el) => getComputedStyle(el).backgroundColor);
    const avatarColor = await alice.page
      .locator('[data-testid="presence-avatar"][title^="Bob Builder"]')
      .evaluate((el) => getComputedStyle(el).backgroundColor);
    if (caretColor !== avatarColor) throw new Error(`caret ${caretColor} vs avatar ${avatarColor}`);
    // Bob moves to the start of the line → his caret follows on Alice's screen.
    const before = await label.boundingBox();
    await bob.page.keyboard.press("Home");
    await alice.page.waitForFunction(
      (x) => {
        const el = document.querySelector(".remote-caret-label");
        return el && Math.abs(el.getBoundingClientRect().x - x) > 20;
      },
      before.x,
      { timeout: 4000 },
    );
    await shot(alice.page, "alice-sees-bob-caret");
  });

  await step("Alice's caret stays put on Bob's screen while Bob types right next to it", async () => {
    // Both carets at the end of the same line — exactly where Bob keeps typing.
    await bob.page.keyboard.press("End");
    await alice.page.bringToFront();
    await alice.page.locator(".ProseMirror").click();
    await alice.page.keyboard.press("Control+End");
    const aliceLabel = bob.page.locator(".remote-caret-label", { hasText: "Alice Admin" });
    await aliceLabel.waitFor({ timeout: 4000 });
    await bob.page.waitForTimeout(400);
    const before = await aliceLabel.boundingBox();
    await bob.page.bringToFront();
    await bob.page.locator(".ProseMirror").click();
    await bob.page.keyboard.press("Control+End");
    await bob.page.keyboard.type(" and more from Bob", { delay: 40 });
    await bob.page.waitForTimeout(3000); // let saves + syncs + cursor broadcasts settle
    const after = await aliceLabel.boundingBox();
    if (Math.abs(after.x - before.x) > 4 || Math.abs(after.y - before.y) > 4) {
      throw new Error(`Alice's caret moved on Bob's screen: ${JSON.stringify(before)} -> ${JSON.stringify(after)}`);
    }
    // ...while Bob's own caret moved on Alice's screen with his typing.
    await alice.page.locator(".ProseMirror").getByText("and more from Bob").waitFor({ timeout: 4000 });
    await shot(bob.page, "bob-sees-alice-caret-still");
  });

  await step("Bob types new bullet items → his caret stays on the line being typed on Alice's screen (never a line below)", async () => {
    await bob.page.bringToFront();
    await bob.page.locator(".ProseMirror").click();
    await bob.page.keyboard.press("Control+End");
    await bob.page.keyboard.press("Enter");
    await bob.page.keyboard.type("- first item", { delay: 40 }); // "- " turns the line into a bullet list
    await bob.page.waitForTimeout(2500);
    await bob.page.keyboard.press("Enter");
    const typing = bob.page.keyboard.type("tt second item typed by bob", { delay: 70 });
    const samples = [];
    for (let i = 0; i < 14; i++) {
      await alice.page.waitForTimeout(140);
      const r = await alice.page.evaluate(() => {
        const caret = document.querySelector('.remote-caret[data-user="Bob Builder"]');
        if (!caret) return null;
        const c = caret.getBoundingClientRect();
        const line = caret.closest("p, h1, h2, h3"); // must sit inside a line of text, not between blocks
        if (!line) return { ok: false, why: `caret in <${caret.parentElement?.tagName.toLowerCase()}>` };
        const b = line.getBoundingClientRect();
        return { ok: c.y >= b.y - 2 && c.y + 4 <= b.y + b.height + 2, why: "caret outside its line box" };
      });
      if (r) samples.push(r);
    }
    await typing;
    const bad = samples.filter((r) => !r.ok);
    if (!samples.length) throw new Error("caret never seen");
    if (bad.length) throw new Error(`${bad.length}/${samples.length} samples wrong (${bad[0].why})`);
    await shot(alice.page, "alice-sees-bob-new-line");
  });

  const comment = `Live comment ${stamp}`;
  await step("Bob comments → it appears in Alice's panel without a refresh", async () => {
    await bob.page.getByPlaceholder("Add a comment…").fill(comment);
    await bob.page.getByRole("button", { name: "Comment", exact: true }).click();
    await alice.page.getByText(comment).waitFor({ timeout: 4000 });
  });

  await step("Alice drops offline, Bob comments meanwhile → back online, Alice gets it (no refresh)", async () => {
    const missed = `Sent while Alice was offline ${stamp}`;
    await alice.ctx.setOffline(true);
    try {
      await bob.page.getByPlaceholder("Add a comment…").fill(missed);
      await bob.page.getByRole("button", { name: "Comment", exact: true }).click();
      await bob.page.getByText(missed).waitFor({ timeout: 4000 });
      await alice.page.waitForTimeout(1500);
    } finally {
      await alice.ctx.setOffline(false);
    }
    await alice.page.getByText(missed).waitFor({ timeout: 8000 });
  });

  await step("Alice's bell shows the new notification instantly", async () => {
    await alice.page.getByTestId("notification-count").waitFor({ timeout: 4000 });
    await shot(alice.page, "alice-bell-badge");
  });

  await step("Opening the bell marks notifications as read (badge clears, item shows NEW)", async () => {
    await alice.page.getByTestId("notification-bell").click();
    await alice.page.getByTestId("notification-list").getByText(`Bob Builder commented on`).first().waitFor({ timeout: 3000 });
    await alice.page.getByTestId("notification-list").getByText("NEW").first().waitFor({ timeout: 3000 });
    if (await alice.page.getByTestId("notification-count").isVisible()) throw new Error("badge still visible");
    await shot(alice.page, "alice-bell-open");
    await alice.page.keyboard.press("Escape");
  });

  await step("Bob leaves → his avatar disappears for Alice", async () => {
    await bob.page.goto(`${BASE}/`);
    await alice.page.locator('[title^="Bob Builder is"]').waitFor({ state: "detached", timeout: 6000 });
  });
} finally {
  if (alice && docId) await alice.page.request.delete(`${BASE}/api/documents/${docId}`).catch(() => {});
  await browser.close();
  console.log(results.join("\n"));
  process.exitCode = failed ? 1 : 0;
}
