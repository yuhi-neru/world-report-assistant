import { platformLine, tweetResult, tweetTemplate } from "../src/communication";
import { newReview } from "../src/types";
import { test, expect, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
const world = {
  id: "wrld_2f16901a-457b-4312-b745-6582dfe4700e",
  url: "https://vrchat.com/home/world/wrld_2f16901a-457b-4312-b745-6582dfe4700e",
  name: "雨の図書室（検証用）",
  author: "検証用の作者",
  description: "これは画面検証用のワールド情報です。",
  platforms: [],
  capacity: null,
  tags: ["chill", "library"],
  fetchedAt: 1234,
  source: "検証用データ",
};
async function setup(page: Page, delay = 0, platforms: string[] = []) {
  await page.addInitScript(
    ({ world, delay }) => {
      const w = window as any;
      w.isTauri = true;
      w.__calls = [];
      const records = new Map<string, any>(),
        photos = new Map<string, any[]>();
      let settings = {
        hatenaId: "test",
        blogId: "example.hatenablog.com",
        hasBlogKey: true,
        hasPhotoKey: true,
        markdownConfirmed: true,
        apiContact: "",
        vrchatSaved: false,
      };
      const list = () =>
        [...records.values()].map((r) => ({
          id: r.id,
          title: r.title,
          worldName: r.world.name,
          visitedAt: r.visitedAt,
          status: r.status,
          updatedAt: r.updatedAt,
          photoCount: photos.get(r.id)?.length || 0,
        }));
      w.__TAURI_EVENT_PLUGIN_INTERNALS__ = { unregisterListener: () => {} };
      w.__TAURI_INTERNALS__ = {
        metadata: { currentWindow: { label: "main" } },
        transformCallback: () => 1,
        invoke: async (cmd: string, args: any) => {
          if (cmd !== "command") return 1;
          const { action, payload: p } = args;
          w.__calls.push({ action, payload: JSON.parse(JSON.stringify(p)) });
          if (action === "bootstrap")
            return {
              settings,
              workspace: "C:\\Code\\world-review-assistant\\workspace",
              reviews: list(),
              version: "0.1.0",
            };
          if (action === "list")
            return list().filter(
              (r) => !p.query || JSON.stringify(r).includes(p.query),
            );
          if (action === "save") {
            if (delay) await new Promise((r) => setTimeout(r, delay));
            const old = records.get(p.review.id);
            if (old && old.revision !== p.review.revision)
              throw "版が競合しました";
            const r = {
              ...p.review,
              revision: (old?.revision || 0) + 1,
              updatedAt: Date.now(),
            };
            records.set(r.id, r);
            return r;
          }
          if (action === "read")
            return {
              review: records.get(p.id),
              photos: photos.get(p.id) || [],
            };
          if (action === "fetch-world") {
            if (!p.url.startsWith("https://vrchat.com/"))
              throw "VRChat公式のワールドURLを入力してください";
            return world;
          }
          if (action === "identify-world")
            return { ...world, name: "", author: "", source: "手入力" };
          if (action === "add-photo") {
            const photo = {
              id: crypto.randomUUID(),
              reviewId: p.id,
              name: p.name,
              caption: "",
              mime: "image/jpeg",
              dataUrl: p.dataUrl,
              position: 0,
              bytes: 512,
            };
            photos.set(p.id, [...(photos.get(p.id) || []), photo]);
            return photo;
          }
          if (action === "caption") {
            for (const x of photos.get(p.reviewId) || [])
              if (x.id === p.id) x.caption = p.caption;
            return {};
          }
          if (action === "remove-photo") {
            photos.set(
              p.reviewId,
              (photos.get(p.reviewId) || []).filter((x) => x.id !== p.id),
            );
            return {};
          }
          if (action === "prepare-codex")
            return {
              path: `C:\\Code\\world-review-assistant\\workspace\\reviews\\${p.id}`,
              prompt: `workspace/reviews/${p.id}/request.md を読んで記事を作成してください。`,
            };
          if (action === "import-article") {
            const r = records.get(p.id);
            const photo = (photos.get(p.id) || [])[0];
            const next = {
              ...r,
              title: "雨音を聞きながら過ごす図書室",
              body: `## 窓際でひと休み\n\n雨音を聞きながら、静かな時間を過ごしました。\n\n${photo ? "{{photo:" + photo.id + "}}" : ""}\n\nこの一文は添削で削ります。`,
              revision: r.revision + 1,
            };
            records.set(p.id, next);
            return next;
          }
          if (action === "publish") {
            const r = records.get(p.id);
            if (w.__failPublish) {
              const next = { ...r, status: "publish-unknown" };
              records.set(p.id, next);
              throw "投稿結果を確認できませんでした";
            }
            const next = {
              ...r,
              status: p.draft ? "remote-draft" : "published",
              editUrl:
                "https://blog.hatena.ne.jp/test/example.hatenablog.com/atom/entry/123",
              publicUrl: "https://example.hatenablog.com/entry/test",
              targetBlog:
                "https://blog.hatena.ne.jp/test/example.hatenablog.com/atom/entry",
            };
            records.set(p.id, next);
            return next;
          }
          if (action === "reconcile") {
            const r = { ...records.get(p.id), status: "published" };
            records.set(p.id, r);
            return r;
          }
          if (action === "save-settings") {
            settings = {
              ...settings,
              ...p,
              hasBlogKey: !!p.blogKey || settings.hasBlogKey,
              hasPhotoKey: !!p.photoKey || settings.hasPhotoKey,
            };
            return settings;
          }
          return {};
        },
      };
    },
    { world: { ...world, platforms }, delay },
  );
  await page.goto("/");
}
test("メモ・写真・Codex取り込み・添削・投稿まで進められる", async ({
  page,
}) => {
  await setup(page);
  await page.getByLabel("ワールドURL", { exact: true }).fill(world.url);
  await page.getByRole("button", { name: "情報を取得", exact: true }).click();
  await expect(page.getByLabel("ワールド名", { exact: true })).toHaveValue(
    world.name,
  );
  await page
    .getByLabel("ひとことでいうと")
    .fill("・雨音が心地よかった\n・窓際でのんびり過ごした");
  await page
    .getByLabel("音・音楽", { exact: true })
    .fill("・小さな雨音が聞こえた");
  await page.locator("input[type=file]").setInputFiles({
    name: "test.png",
    mimeType: "image/png",
    buffer: readFileSync(
      new URL("../src-tauri/icons/icon.png", import.meta.url),
    ),
  });
  await expect(page.getByRole("img", { name: "撮影写真 1" })).toBeVisible();
  await page.getByLabel("写真1の説明").fill("窓際の写真");
  await page.getByRole("button", { name: "Codexに渡す", exact: true }).click();
  await expect(page.getByLabel("Codexへの依頼文")).toBeVisible();
  await page
    .getByRole("button", { name: "記事を取り込む", exact: true })
    .click();
  await expect(page.getByLabel("記事タイトル", { exact: true })).toHaveValue(
    "雨音を聞きながら過ごす図書室",
  );
  await page
    .getByLabel("記事本文", { exact: true })
    .fill("## 窓際でひと休み\n\n自分で添削した本文だけです。");
  await page
    .getByLabel("記事タイトル", { exact: true })
    .fill("添削後のタイトル");
  await page.getByRole("button", { name: "はてなへ投稿", exact: true }).click();
  await page
    .getByRole("button", { name: "この内容で公開する", exact: true })
    .click();
  await expect(
    page.getByText("記事を公開しました。", { exact: true }),
  ).toBeVisible();
  const sent = await page.evaluate(() => (window as any).__calls);
  const publish = sent.findLast((c: any) => c.action === "publish");
  const save = sent.findLast((c: any) => c.action === "save");
  expect(publish.payload.revision).toBe(save.payload.review.revision + 1);
  expect(save.payload.review.body).toContain("自分で添削した本文だけ");
  expect(save.payload.review.body).not.toContain("この一文は添削で削ります");
  expect(save.payload.review.title).toBe("添削後のタイトル");
});
test("保存中に追記しても最新のメモを失わない", async ({ page }) => {
  await setup(page, 400);
  const memo = page.getByLabel("ひとことでいうと");
  await memo.fill("最初のメモ");
  await page.waitForTimeout(1000);
  await memo.fill("最初のメモに追加した最新のメモ");
  await expect(page.getByText("保存済み", { exact: true })).toBeVisible();
  await expect(memo).toHaveValue("最初のメモに追加した最新のメモ");
  const saves = await page.evaluate(() =>
    (window as any).__calls.filter((c: any) => c.action === "save"),
  );
  expect(saves.at(-1).payload.review.notes.summary).toBe(
    "最初のメモに追加した最新のメモ",
  );
});
test("投稿結果が不明な場合は再送せず確認に誘導する", async ({ page }) => {
  await setup(page);
  await page.getByLabel("ワールドURL", { exact: true }).fill(world.url);
  await page.getByRole("button", { name: "情報を取得", exact: true }).click();
  await page.getByRole("tab", { name: "記事を整える" }).click();
  await page.getByLabel("記事タイトル", { exact: true }).fill("テスト");
  await page.getByLabel("記事本文", { exact: true }).fill("添削済み");
  await page.evaluate(() => {
    (window as any).__failPublish = true;
  });
  await page.getByRole("button", { name: "はてなへ投稿", exact: true }).click();
  await page
    .getByRole("button", { name: "この内容で公開する", exact: true })
    .click();
  await page.getByRole("button", { name: "戻る", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "投稿結果を確認", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "はてなへ投稿", exact: true }),
  ).toBeDisabled();
  await page
    .getByRole("button", { name: "投稿結果を確認", exact: true })
    .click();
  await expect(
    page.getByText("投稿結果を確認できました。", { exact: true }),
  ).toBeVisible();
});
test("不正URLでは取得結果を埋めない", async ({ page }) => {
  await setup(page);
  await page
    .getByLabel("ワールドURL", { exact: true })
    .fill("https://evil.example/");
  await page.getByRole("button", { name: "情報を取得", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("公式");
  await expect(page.getByLabel("ワールド名", { exact: true })).toHaveValue("");
});
test("記事のプレビューがスクリプトを実行しない", async ({ page }) => {
  await setup(page);
  await page.getByRole("tab", { name: "記事を整える" }).click();
  await page
    .getByLabel("記事本文", { exact: true })
    .fill(
      '<script>window.pwned=1</script><img src=x onerror="window.pwned=2"><iframe src="https://evil.example/"></iframe>',
    );
  await expect(page.locator(".prose script")).toHaveCount(0);
  await expect(page.locator(".prose iframe")).toHaveCount(0);
  expect(await page.evaluate(() => (window as any).pwned)).toBeUndefined();
});
test("設定にはブログURLが初期設定され秘密情報は伏字になる", async ({
  page,
}) => {
  await setup(page);
  await page
    .getByRole("button", { name: "設定・ブログ連携", exact: true })
    .click();
  await expect(page.getByLabel("ブログID", { exact: true })).toHaveValue(
    "example.hatenablog.com",
  );
  await expect(
    page.getByLabel("ブログAPIキー", { exact: false }),
  ).toHaveAttribute("type", "password");
  await expect(
    page.getByText("追加のAI API契約・キーは不要です。", { exact: false }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "閉じる", exact: true })
    .last()
    .click();
});
test("空の初期画面と記事画面のスクリーンショット", async ({ page }) => {
  await setup(page);
  await page.screenshot({ path: "artifacts/app-notes.png", fullPage: true });
  await page.getByRole("tab", { name: "記事を整える" }).click();
  await page.screenshot({ path: "artifacts/app-editor.png", fullPage: true });
});

test("外観の切替で入力を保ち、再起動後も選択を保存しWindowsの配色に追従する", async ({
  page,
}) => {
  await page.emulateMedia({ colorScheme: "light" });
  await setup(page);
  const appearance = page.getByRole("combobox", { name: "画面のテーマ" });
  await expect(appearance).toHaveValue("dark");
  await page
    .getByLabel("ひとことでいうと")
    .fill("外観を変えてもこのメモを残す");
  await appearance.selectOption("light");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await expect(page.getByLabel("ひとことでいうと")).toHaveValue(
    "外観を変えてもこのメモを残す",
  );
  await page.reload();
  await expect(appearance).toHaveValue("light");
  await appearance.selectOption("system");
  await page.emulateMedia({ colorScheme: "dark" });
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.emulateMedia({ colorScheme: "light" });
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await page.reload();
  await expect(appearance).toHaveValue("system");
  await appearance.selectOption("dark");
  await page.screenshot({
    path: "artifacts/app-dark-notes.png",
    fullPage: true,
  });
  await page.getByRole("tab", { name: "記事を整える" }).click();
  await page.getByLabel("基本情報を記事の先頭に付ける").uncheck();
  await page
    .getByLabel("記事タイトル", { exact: true })
    .fill("夜のワールドを、言葉に残す");
  await page
    .getByLabel("記事本文", { exact: true })
    .fill(
      "これはダークモードの表示確認用サンプルです。\n\n## 記憶を、ひとつずつ\n\n明朝体のタイトルと、読みやすい本文。はてなブログの静かな雰囲気を、暗い画面でも。\n\n> メモに残した言葉を、自分の記事へ。\n\n[テンプレートと使い方](https://github.com/yuhi-neru/world-report-assistant)\n\n| 項目 | 表示 |\n| --- | --- |\n| 見出し・引用 | 落ち着いた配色 |\n| 写真 | 元の色のまま |\n\n```text\nWorld Report Assistant\n``` ",
    );
  await expect(page.locator(".prose h2")).toBeVisible();
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: "artifacts/app-dark-editor.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "設定・ブログ連携" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.screenshot({
    path: "artifacts/app-dark-settings.png",
    fullPage: true,
  });
});

test("ツイートはURLとタグ1つを付け、日本語・絵文字・URLの重みを数える", async () => {
  const report = newReview();
  report.world = { ...world, url: world.url + "?instanceId=private" };
  report.sharing!.tweet = "あ";
  let result = tweetResult(report);
  expect(result.issues).toEqual([]);
  expect(result.length).toBe(36);
  expect(result.text).toContain(world.url);
  expect(result.text).not.toContain("instanceId");
  expect(result.text.match(/#VRChat/g)).toHaveLength(1);
  report.sharing!.tweet = "👨‍👩‍👧‍👦";
  expect(tweetResult(report).length).toBe(36);
  report.sharing!.tweet = "あ".repeat(140);
  expect(tweetResult(report).issues.join(" ")).toContain("上限");
  report.sharing!.tweet = "短い本文 #余分なタグ";
  expect(tweetResult(report).issues.join(" ")).toContain("本文内");
  report.sharing!.tweet = "https://example.com/";
  expect(tweetResult(report).issues.join(" ")).toContain("本文内");
  report.sharing!.hashtag = "VRChat 別のタグ";
  expect(tweetResult(report).issues.join(" ")).toContain("ハッシュタグを1つ");
  report.sharing!.hashtag = "VRChat";
  expect(tweetTemplate(report).match(/#/g)).toHaveLength(1);
  expect(tweetTemplate(report)).toContain(world.url);
});

test("4つの視点から冒頭文とツイートを作り、必須URLとタグ付きでコピーする", async ({
  page,
}) => {
  await setup(page);
  await page.evaluate(() => {
    (window as any).__copied = [];
    Object.defineProperty(navigator, "clipboard", {
      value: {
        writeText: async (text: string) => {
          (window as any).__copied.push(text);
        },
      },
      configurable: true,
    });
  });
  await page.getByLabel("ワールドURL", { exact: true }).fill(world.url);
  await page.getByRole("button", { name: "情報を取得", exact: true }).click();
  await page.getByLabel("What 何のワールド？").fill("雨音がする図書室");
  await page.getByLabel("Who 誰向け？").fill("静かに読書したい人");
  await page
    .getByLabel("How 何ができる？")
    .fill("窓際で雨音を聞きながら過ごせる");
  await page.getByLabel("Why なぜおすすめ？").fill("静かな照明が落ち着く");
  await page.getByRole("tab", { name: "記事を整える" }).click();
  await page.getByRole("button", { name: "空欄に雛形を入れる" }).click();
  await expect(page.getByLabel("記事の冒頭文", { exact: true })).toHaveValue(
    /雨音がする図書室.*静かに読書したい人.*窓際で雨音を聞きながら過ごせる.*静かな照明/,
  );
  await expect(page.locator(".prose")).toContainText("雨音がする図書室");
  await page
    .getByLabel("記事の冒頭文", { exact: true })
    .fill("自分で添削した冒頭です。");
  await page.getByRole("button", { name: "空欄に雛形を入れる" }).click();
  await expect(page.getByLabel("記事の冒頭文", { exact: true })).toHaveValue(
    "自分で添削した冒頭です。",
  );
  await page
    .getByRole("button", { name: "ツイート文をコピー", exact: true })
    .click();
  const copied = await page.evaluate(() => (window as any).__copied.at(-1));
  expect(copied).toContain(world.url);
  expect(copied.match(/#/g)).toHaveLength(1);
  await page.getByLabel("ハッシュタグ（1つ）").fill("ワールド紹介");
  await page.getByRole("button", { name: "ツイート雛形をコピー" }).click();
  const template = await page.evaluate(() => (window as any).__copied.at(-1));
  expect(template).toContain(world.url);
  expect(template).toContain("#ワールド紹介");
  expect(template.match(/#/g)).toHaveLength(1);
  await page
    .getByLabel("ツイート本文", { exact: true })
    .fill("余分なタグ #extra");
  await expect(
    page.getByRole("button", { name: "ツイート文をコピー", exact: true }),
  ).toBeDisabled();
  await page
    .getByLabel("ツイート本文", { exact: true })
    .fill(
      "「雨の図書室」雨音と静かな照明で落ち着ける場所。窓際で過ごせて、読書好きにおすすめ。",
    );
  await page
    .getByLabel("記事本文", { exact: true })
    .fill("## 訪問メモ\n\nこれは表示確認用のサンプルです。");
  await page.evaluate(() => window.scrollTo(0, 0));
  const closeToast = page.getByRole("button", { name: "通知を閉じる" });
  if (await closeToast.count()) await closeToast.click();
  await page.screenshot({
    path: "artifacts/app-writing-copy.png",
    fullPage: true,
  });
});

test("APIで確認できた対応環境だけをツイートと雛形へ付ける", async () => {
  const report = newReview();
  report.world = { ...world, platforms: [] };
  report.sharing!.tweet = "静かな図書室。";
  const before = tweetResult(report).length;
  for (const [platforms, line] of [
    [[], ""],
    [["unknown"], ""],
    [["PC"], "対応：PC"],
    [["Android / Quest"], "対応：Quest単機 / スマホ(Android)"],
    [["iOS"], "対応：スマホ(iOS)"],
    [
      ["standalonewindows", "android", "ios", "Android / Quest"],
      "対応：PC / Quest単機 / スマホ(Android) / スマホ(iOS)",
    ],
  ] as [string[], string][]) {
    report.world.platforms = platforms;
    expect(platformLine(report)).toBe(line);
    const result = tweetResult(report);
    expect(result.issues).toEqual([]);
    expect(result.text.match(/#/g)).toHaveLength(1);
    expect(result.text).toContain(world.url);
    if (line) {
      expect(result.text).toContain(line);
      expect(tweetTemplate(report)).toContain(line);
      expect(result.length).toBeGreaterThan(before);
    } else {
      expect(result.text).not.toContain("対応：");
      expect(tweetTemplate(report)).not.toContain("対応：");
    }
  }
  report.sharing!.tweet = "あ".repeat(110);
  expect(tweetResult(report).issues.join(" ")).toContain("上限");
});

test("APIのAndroid情報をQuest単機とAndroidスマホとして完成文へ表示する", async ({
  page,
}) => {
  await setup(page, 0, ["PC", "Android / Quest"]);
  await page.getByLabel("ワールドURL", { exact: true }).fill(world.url);
  await page.getByRole("button", { name: "情報を取得", exact: true }).click();
  await page.getByRole("tab", { name: "記事を整える" }).click();
  await page
    .getByLabel("ツイート本文", { exact: true })
    .fill("静かな図書室。読書好きにおすすめ。");
  const result = page.getByLabel("URL・タグ付きの完成文");
  await expect(result).toHaveValue(
    /対応：PC \/ Quest単機 \/ スマホ\(Android\)/,
  );
  await expect(result).not.toHaveValue(/iOS/);
  await expect(
    page.getByRole("button", { name: "ツイート文をコピー", exact: true }),
  ).toBeEnabled();
});
