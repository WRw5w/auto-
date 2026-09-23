import { chromium } from "playwright";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const root = path.resolve(process.env.AIC_LEADERBOARD_ROOT || process.cwd());
const profile = path.resolve(process.env.AIC_LEADERBOARD_PIPE_PROFILE ||
  path.join(os.tmpdir(), "aic_leaderboard_pipe_profile"));
const chrome = process.env.AIC_LEADERBOARD_CHROME_PATH || "";
const submitUrl = process.env.AIC_LEADERBOARD_SUBMIT_URL || "";
const leaderboardUrl = process.env.AIC_LEADERBOARD_LEADERBOARD_URL || "";
const command = process.argv[2] || "probe";
const candidate = process.argv[3] || "";
const timeoutMs = Math.min(Number(process.env.AIC_LEADERBOARD_BROWSER_TIMEOUT_MS || 60000), 600000);

const print = (value) => console.log(JSON.stringify(value, null, 2));
const digest = (file) => createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const body = async (page) => (await page.locator("body").innerText({timeout: 10000}).catch(() => "")).slice(0, 12000);
async function tableRows(page) {
  return page.locator("table tbody tr").evaluateAll(rows => rows.map(row =>
    [...row.querySelectorAll("td")].map(cell => cell.innerText.trim()).join(" | "))
    .filter(Boolean).join("\n")).catch(() => "");
}
async function visibleBody(page, timeout = 15000) {
  const deadline = Date.now() + timeout;
  let text = "";
  do {
    text = await body(page);
    if (text.trim()) return text;
    await page.waitForTimeout(500);
  } while (Date.now() < deadline);
  return text;
}
const loginRequired = (url, text) => /passport|cas\b|\/login\b/i.test(url) ||
  /统一身份认证|扫码登录|账号登录|请登录/i.test(text.slice(0, 700));
const allowed = (url, purpose) => url.startsWith("https://reg.aicomp.cn/") ||
  (purpose !== "submit-one" && process.env.AIC_LEADERBOARD_TEST_URLS === "1" && url.startsWith("file:///"));

async function openContext() {
  if (chrome && !fs.existsSync(chrome)) throw new Error(`CHROME_NOT_FOUND:${chrome}`);
  return chromium.launchPersistentContext(profile, {
    ...(chrome ? {executablePath: chrome} : {channel: "chrome"}),
    headless: process.env.AIC_LEADERBOARD_HEADLESS === "true",
    timeout: 20000,
    viewport: null,
  });
}

async function pageAt(context, url) {
  const page = context.pages().find(p => p.url().startsWith(url)) ||
    context.pages().find(p => p.url() === "about:blank") || await context.newPage();
  await page.goto(url, {waitUntil: "domcontentloaded", timeout: timeoutMs});
  await page.bringToFront();
  return page;
}

async function run() {
  if (command === "probe") {
    const context = await openContext();
    try {
      const page = await pageAt(context, "about:blank");
      await page.setContent("<title>aic-pipe-ready</title>");
      const title = await page.title();
      print({ok: title === "aic-pipe-ready", reason: "pipe-ready", title,
        transport: "Chrome debugging pipe", profile});
      return title === "aic-pipe-ready" ? 0 : 3;
    } finally { await context.close(); }
  }
  if (command === "heartbeat" || command === "wait-login" || command === "submit-one") {
    if (!allowed(submitUrl, command)) throw new Error("AIC_LEADERBOARD_SUBMIT_URL must be a full AIC submit URL");
  }
  if (command === "leaderboard" && !allowed(leaderboardUrl, command)) {
    throw new Error("AIC_LEADERBOARD_LEADERBOARD_URL must be a full AIC leaderboard URL");
  }
  if (command === "submit-one") {
    const expected = String(process.env.AIC_LEADERBOARD_EXPECTED_SHA256 || "").toLowerCase();
    const queueId = String(process.env.AIC_LEADERBOARD_QUEUE_ID || "");
    const team = String(process.env.AIC_LEADERBOARD_TEAM_ID || "");
    if (process.env.AIC_LEADERBOARD_CONFIRM !== "true" || !expected || !queueId || !team) return 77;
    if (!fs.existsSync(candidate) || digest(candidate) !== expected) return 77;
    const queue = JSON.parse(fs.readFileSync(path.join(root, "aic_leaderboard_state.json"), "utf8"));
    const matches = queue.queue.filter(x => x.id === queueId && x.status === "submitting" &&
      x.sha256 === expected && x.team === team && path.resolve(x.path) === path.resolve(candidate));
    if (matches.length !== 1) return 77;
  }

  const context = await openContext();
  try {
    const page = await pageAt(context, command === "leaderboard" ? leaderboardUrl : submitUrl);
    if (command === "heartbeat") {
      const text = await visibleBody(page);
      if (!text.trim()) {
        print({ok: false, reason: "empty-page", url: page.url(), title: await page.title()});
        return 3;
      }
      const login = loginRequired(page.url(), text);
      if (!login && process.env.AIC_LEADERBOARD_TEAM_ID) {
        const row = page.locator("tr").filter({hasText: process.env.AIC_LEADERBOARD_TEAM_ID});
        await row.first().waitFor({timeout: 30000}).catch(() => {});
        if (await row.count() !== 1) {
          print({ok: false, reason: "team-row-unavailable", url: page.url()});
          return 3;
        }
      }
      print({ok: !login, reason: login ? "login" : "ready", url: page.url(), text: text.slice(0, 1000)});
      return login ? 2 : 0;
    }
    if (command === "wait-login") {
      const end = Date.now() + Math.min(Number(process.argv[3] || 600000), 600000);
      while (Date.now() < end) {
        const text = await visibleBody(page, 3000);
        if (!text.trim()) { await page.waitForTimeout(3000); continue; }
        if (!loginRequired(page.url(), text)) {
          print({ok: true, reason: "logged-in", url: page.url()});
          return 0;
        }
        await page.waitForTimeout(3000);
      }
      print({ok: false, reason: "login-timeout", url: page.url()});
      return 2;
    }
    if (command === "leaderboard") {
      await page.waitForTimeout(2000);
      let text = await visibleBody(page);
      if (!text.trim()) { print({ok: false, reason: "empty-page", url: page.url()}); return 3; }
      text = [await tableRows(page), text].filter(Boolean).join("\n");
      const team = process.env.AIC_LEADERBOARD_TEAM_ID || "";
      if (team && !text.includes(team)) {
        const second = page.locator(".ant-pagination-item-2").first();
        if (await second.count()) {
          await second.click({timeout: 3000}).catch(() => {});
          await page.waitForTimeout(1000);
          text += "\n--- page 2 ---\n" + [await tableRows(page), await body(page)].filter(Boolean).join("\n");
        }
      }
      print({time: new Date().toISOString(), url: page.url(), text});
      return 0;
    }
    if (command === "submit-one") {
      const initialText = await visibleBody(page);
      if (!initialText.trim() || loginRequired(page.url(), initialText)) {
        print({ok: false, reason: initialText.trim() ? "login" : "empty-page", url: page.url()});
        return 3;
      }
      const row = page.locator("tr").filter({hasText: process.env.AIC_LEADERBOARD_TEAM_ID});
      await row.first().waitFor({timeout: 30000}).catch(() => {});
      if (await row.count() !== 1) { print({ok: false, reason: "TEAM_ROW_NOT_UNIQUE"}); return 3; }
      let input = page.locator('input[type="file"][accept*=".zip"]').first();
      if (!(await input.count())) {
        const button = row.first().getByText("提交作品", {exact: true});
        if (await button.count() === 1) await button.click({timeout: 5000});
        input = page.locator('input[type="file"][accept*=".zip"]').first();
        await input.waitFor({timeout: 10000}).catch(() => {});
      }
      if (!(await input.count())) { print({ok: false, reason: "NO_FILE_INPUT"}); return 3; }
      await input.setInputFiles(candidate);
      // The AIC upload service displays underscores as hyphens in the stored filename.
      const displayName = path.basename(candidate).replaceAll("_", "-");
      const uploadReady = await page.waitForFunction(name => {
        const input = document.querySelector('input[type="file"][accept*=".zip"]');
        const widget = input?.closest(".ant-upload");
        const text = widget?.innerText || widget?.textContent || "";
        const removable = !!widget?.querySelector('.anticon-close-circle,[aria-label="close-circle"],[data-icon="close-circle"]');
        return text.includes(name) && removable;
      }, displayName, {timeout: 90000}).then(() => true).catch(() => false);
      if (!uploadReady) { print({ok: false, reason: "UPLOAD_NOT_READY", displayName}); return 4; }
      const buttons = page.locator(".ant-modal:visible").getByRole("button", {name: /^\s*提\s*交\s*$/});
      if (await buttons.count() !== 1 || !(await buttons.first().isEnabled())) {
        print({ok: false, reason: "NO_SUBMIT_BUTTON"}); return 5;
      }
      const attemptedAt = new Date().toISOString();
      const attemptDir = path.join(root, "submissions");
      fs.mkdirSync(attemptDir, {recursive: true});
      fs.writeFileSync(path.join(attemptDir, `${process.env.AIC_LEADERBOARD_QUEUE_ID}.attempt.json`),
        JSON.stringify({attemptedAt, sha256: process.env.AIC_LEADERBOARD_EXPECTED_SHA256,
          candidateId: process.env.AIC_LEADERBOARD_QUEUE_ID}) + "\n", {flag: "wx"});
      console.log(`SUBMIT_CLICK_ATTEMPTED_AT=${attemptedAt}`);
      await buttons.first().click({timeout: 5000});
      const clickedAt = new Date().toISOString();
      console.log(`SUBMIT_CLICKED_AT=${clickedAt}`);
      let feedback = "";
      const end = Date.now() + 20000;
      while (Date.now() < end) {
        feedback = await page.locator(".ant-message,.ant-notification,.ant-modal,.ant-alert")
          .allInnerTexts().then(x => x.join(" ")).catch(() => "");
        if (/提交成功|作品提交成功|提交失败|上传失败|操作失败/.test(feedback)) break;
        await page.waitForTimeout(500);
      }
      if (/提交失败|上传失败|操作失败/.test(feedback)) { print({ok:false,reason:"rejected",feedback}); return 6; }
      if (/提交成功|作品提交成功/.test(feedback)) {
        console.log(`SUBMIT_ACCEPTED_AT=${new Date().toISOString()}`);
        print({ok:true,reason:"accepted",feedback});
        return 0;
      }
      print({ok:false,reason:"outcome_unknown_after_click",feedback,clickedAt});
      return 7;
    }
    throw new Error(`UNKNOWN_COMMAND:${command}`);
  } finally { await context.close(); }
}

try { process.exitCode = await run(); }
catch (error) { console.error(String(error?.stack || error)); process.exitCode = 3; }
