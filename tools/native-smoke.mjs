import { chromium } from "@playwright/test";
import { spawn, spawnSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";

const project = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const binary = path.join(
  project,
  "src-tauri/target/release/world-review-assistant.exe",
);
const dataRoot = path.join(project, ".test-workspace", `native-${Date.now()}`);
await mkdir(dataRoot, { recursive: true });
const debugPort = 9436;
const app = spawn(binary, [], {
  cwd: project,
  windowsHide: true,
  stdio: "ignore",
  env: {
    ...process.env,
    WORLD_REVIEW_HOME: dataRoot,
    WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${debugPort}`,
  },
});
app.on("error", (e) => {
  throw e;
});
let browser;
try {
  let endpoint;
  for (let i = 0; i < 80; i++) {
    if (app.exitCode !== null)
      throw new Error(`App exited with ${app.exitCode}`);
    try {
      const r = await fetch(`http://127.0.0.1:${debugPort}/json/version`);
      endpoint = (await r.json()).webSocketDebuggerUrl;
      if (endpoint) break;
    } catch {}
    await new Promise((r) => setTimeout(r, 250));
  }
  assert(endpoint, "WebView2 debugging endpoint did not appear");
  browser = await chromium.connectOverCDP(endpoint);
  const pages = browser.contexts().flatMap((c) => c.pages());
  const page = pages.find((p) => !p.url().startsWith("devtools:")) || pages[0];
  assert(page, "App webview was not found");
  await page.getByRole("heading", { name: "今日の体験を、記事に。" }).waitFor();
  assert.equal(
    await page.locator(".preview-banner").count(),
    0,
    "Native bridge must be active",
  );
  const invoke = (action, payload = {}) =>
    page.evaluate(
      ({ action, payload }) =>
        window.__TAURI_INTERNALS__.invoke("command", { action, payload }),
      { action, payload },
    );
  const boot = await invoke("bootstrap");
  assert.equal(boot.workspace, dataRoot);
  assert.equal(boot.settings.blogId, "");
  assert.equal(boot.settings.hasBlogKey, false);
  let liveMetadata = null;
  if (process.env.WORLD_REVIEW_LIVE_CHECKS === "1") {
    try {
      const world = await invoke("fetch-world", {
        url: "https://vrchat.com/home/world/wrld_736bad27-4663-4346-a345-26e1e859d94e",
      });
      assert.equal(world.id, "wrld_736bad27-4663-4346-a345-26e1e859d94e");
      assert(world.name.length > 0);
      liveMetadata = { ok: true, name: world.name, author: world.author };
    } catch (error) {
      liveMetadata = { ok: false, message: String(error) };
    }
  }
  await page
    .getByLabel("ワールドURL", { exact: true })
    .fill(
      "https://vrchat.com/home/world/wrld_2f16901a-457b-4312-b745-6582dfe4700e",
    );
  await page.getByRole("button", { name: "手入力する", exact: true }).click();
  await page
    .getByLabel("ワールド名", { exact: true })
    .fill("実アプリの保存検証用ワールド");
  await page.getByLabel("作者", { exact: true }).fill("検証用");
  await page
    .getByLabel("Scene どんな場所？")
    .fill("入力と保存を確かめる検証用の空間");
  await page.getByLabel("Action そこで何をする？").fill("部屋の中を歩く");
  await page
    .getByLabel("Result すると何を体験できる？")
    .fill("配置した目印を見られる");
  await page
    .getByLabel("ひとことでいうと")
    .fill("これは実際の訪問記録ではなく、保存と取り込みの動作確認用です。");
  await page
    .locator("input[type=file]")
    .setInputFiles(path.join(project, "src-tauri/icons/icon.png"));
  await page.getByRole("img", { name: "撮影写真 1", exact: true }).waitFor();
  await page.getByRole("button", { name: "Codexに渡す", exact: true }).click();
  await page.getByLabel("Codexへの依頼文").waitFor();
  let list = await invoke("list");
  assert.equal(list.length, 1);
  const id = list[0].id;
  const packet = JSON.parse(
    await readFile(path.join(dataRoot, "reviews", id, "input.json"), "utf8"),
  );
  assert.equal(packet.photos.length, 1);
  assert.equal(
    packet.review.experience.scene,
    "入力と保存を確かめる検証用の空間",
  );
  const article = `# WebView2実機検証の記事\n\n## 動作確認\n\nこれはテスト用の記事です。\n\n${packet.photos[0].marker}\n\nあとで削る一文。\n`;
  await writeFile(
    path.join(dataRoot, "reviews", id, "article.md"),
    article,
    "utf8",
  );
  await writeFile(
    path.join(dataRoot, "reviews", id, "sharing.json"),
    JSON.stringify({
      opening: "実アプリの冒頭文を確認しています。",
      tweet: "検証用の部屋。\n部屋の中を歩く。\n配置した目印を見られる。",
    }),
    "utf8",
  );
  await page
    .getByRole("button", { name: "記事を取り込む", exact: true })
    .click();
  await page.getByLabel("記事タイトル", { exact: true }).waitFor();
  assert.equal(
    await page.getByLabel("記事タイトル", { exact: true }).inputValue(),
    "WebView2実機検証の記事",
  );
  assert.equal(
    await page.getByLabel("記事の冒頭文", { exact: true }).inputValue(),
    "実アプリの冒頭文を確認しています。",
  );
  const tweetText = await page
    .getByLabel("URL・タグ付きの完成文", { exact: true })
    .inputValue();
  assert(
    tweetText.includes(
      "https://vrchat.com/home/world/wrld_2f16901a-457b-4312-b745-6582dfe4700e",
    ),
  );
  assert.equal((tweetText.match(/#/g) || []).length, 2);
  assert(tweetText.endsWith("#VRchat #VRChatワールド紹介"));
  assert(tweetText.includes("World：実アプリの保存検証用ワールド"));
  const body = await page.getByLabel("記事本文", { exact: true }).inputValue();
  await page
    .getByLabel("記事本文", { exact: true })
    .fill(body.replace("あとで削る一文。", "本人が添削した内容。"));
  await page.getByRole("button", { name: "保存", exact: true }).click();
  await page.getByText("記録を保存しました。", { exact: true }).waitFor();
  const saved = await invoke("read", { id });
  assert(saved.review.body.includes("本人が添削した内容。"));
  assert(!saved.review.body.includes("あとで削る一文。"));
  assert.equal(saved.photos.length, 1);
  await page.screenshot({
    path: path.join(project, "artifacts/native-editor.png"),
    fullPage: true,
  });
  const backup = await invoke("backup");
  assert(
    (await readFile(backup.path)).subarray(0, 15).toString() ===
      "SQLite format 3",
  );
  await page.getByRole("tab", { name: "メモと写真", exact: true }).click();
  await page.screenshot({
    path: path.join(project, "artifacts/native-notes.png"),
    fullPage: true,
  });
  const closeNote = "閉じる直前のメモも保存されることを確認しました。";
  await page.getByLabel("ひとことでいうと").fill(closeNote);
  const exited = new Promise((resolve) => app.once("exit", resolve));
  const closing = spawnSync(
    "powershell.exe",
    [
      "-NoProfile",
      "-Command",
      `(Get-Process -Id ${app.pid}).CloseMainWindow()`,
    ],
    { windowsHide: true, encoding: "utf8" },
  );
  assert(
    closing.stdout.includes("True"),
    "The test app did not accept the native close request",
  );
  await Promise.race([
    exited,
    new Promise((_, reject) =>
      setTimeout(
        () => reject(new Error("App did not close after saving")),
        12_000,
      ),
    ),
  ]);
  const reopened = spawnSync(binary, ["--cli", "read", id], {
    cwd: project,
    windowsHide: true,
    encoding: "utf8",
    env: { ...process.env, WORLD_REVIEW_HOME: dataRoot },
  });
  assert.equal(reopened.status, 0, reopened.stderr);
  assert.equal(JSON.parse(reopened.stdout).review.notes.summary, closeNote);
  const report = {
    nativeWebView2: true,
    sqlitePersistence: true,
    codexPhotoExport: true,
    codexArticleImport: true,
    sarExperienceExport: true,
    openingAndTweetImport: true,
    tweetIncludesWorldNameUrlAndTwoTags: true,
    editedArticleSaved: true,
    backupCreated: true,
    nativeCloseSavedDraft: true,
    liveMetadata,
    externalPublicationPerformed: false,
    workspace: dataRoot,
  };
  await writeFile(
    path.join(project, "artifacts/native-validation.json"),
    JSON.stringify(report, null, 2),
    "utf8",
  );
  console.log(JSON.stringify(report, null, 2));
} finally {
  if (browser) await browser.close().catch(() => {});
  app.kill();
}
