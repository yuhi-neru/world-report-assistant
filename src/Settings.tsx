import { useState } from "react";
import {
  Check,
  Compass,
  ExternalLink,
  FolderOpen,
  RefreshCw,
  Save,
  Send,
} from "lucide-react";
import { Button, Modal } from "./App";
import { command } from "./bridge";
import type { Settings } from "./types";
export default function SettingsModal({
  settings,
  workspace,
  busy,
  run,
  onClose,
  onSaved,
  notify,
}: {
  settings: Settings | null;
  workspace: string;
  busy: boolean;
  run: (s: string, f: () => Promise<void>) => Promise<void>;
  onClose: () => void;
  onSaved: (s: Settings) => void;
  notify: (s: string, error?: boolean) => void;
}) {
  const [form, setForm] = useState({
    hatenaId: settings?.hatenaId || "",
    blogId: settings?.blogId || "",
    blogKey: "",
    photoKey: "",
    markdownConfirmed: settings?.markdownConfirmed || false,
    apiContact: settings?.apiContact || "",
  });
  const [username, setUsername] = useState(""),
    [password, setPassword] = useState(""),
    [methods, setMethods] = useState<string[]>([]),
    [method, setMethod] = useState("totp"),
    [code, setCode] = useState(""),
    [authMessage, setAuthMessage] = useState(
      settings?.vrchatSaved
        ? "ログイン情報は保存済みです。取得時に有効性を確認します。"
        : "公開情報を取得できない場合にログインしてください。",
    );
  const field = (key: keyof typeof form, value: string | boolean) =>
    setForm((f) => ({ ...f, [key]: value }));
  const save = async () => {
    const s = await command<Settings>("save-settings", form);
    onSaved(s);
    setForm((f) => ({ ...f, blogKey: "", photoKey: "" }));
    return s;
  };
  return (
    <Modal title="設定・ブログ連携" onClose={onClose} wide>
      <fieldset disabled={busy} className="settings-fields">
        <div className="settings-section">
          <div className="settings-section-heading">
            <span className="section-icon">
              <Send size={18} />
            </span>
            <div>
              <h3>はてなブログ</h3>
              <p>通常の投稿は無料プランで利用できます。</p>
            </div>
          </div>
          <div className="settings-grid">
            <label>
              はてなID
              <input
                autoComplete="off"
                value={form.hatenaId}
                onChange={(e) => field("hatenaId", e.target.value)}
                placeholder="ブログの表示名ではなく、はてなID"
              />
            </label>
            <label>
              ブログID
              <input
                value={form.blogId}
                onChange={(e) => field("blogId", e.target.value)}
                placeholder="example.hatenablog.com"
              />
            </label>
            <label>
              ブログAPIキー・投稿用メール{" "}
              <small>
                {settings?.hasBlogKey ? "登録済み・空欄なら維持" : ""}
              </small>
              <input
                type="password"
                autoComplete="new-password"
                value={form.blogKey}
                onChange={(e) => field("blogKey", e.target.value)}
                placeholder="ブログ管理画面 → 設定 → 詳細設定 → AtomPub"
              />
            </label>
            <label>
              フォトライフAPIキー・投稿用メール{" "}
              <small>
                {settings?.hasPhotoKey
                  ? "登録済み・空欄なら維持"
                  : "写真の投稿に必要"}
              </small>
              <input
                type="password"
                autoComplete="new-password"
                value={form.photoKey}
                onChange={(e) => field("photoKey", e.target.value)}
                placeholder="投稿用メールアドレスをそのまま貼り付け可"
              />
            </label>
          </div>
          <label className="check-row">
            <input
              type="checkbox"
              checked={form.markdownConfirmed}
              onChange={(e) => field("markdownConfirmed", e.target.checked)}
            />
            はてなブログの既定の編集モードを「Markdown」に設定した
          </label>
          <div className="settings-help">
            <p>
              APIキーは、はてなアカウントのパスワードとは異なります。写真は無料で月300MBまで。公開用のコピーだけを送ります。
            </p>
            <Button
              variant="subtle"
              icon={ExternalLink}
              onClick={() =>
                void command("open-external", {
                  url: "https://help.hatenablog.com/entry/config/detail",
                }).catch((e) => notify(e.message, true))
              }
            >
              設定方法
            </Button>
            <Button
              variant="subtle"
              icon={RefreshCw}
              onClick={() =>
                void run("ブログへの接続を確認しています", async () => {
                  await save();
                  const r = await command<{ message: string }>("check-blog");
                  notify(r.message);
                })
              }
            >
              保存して接続確認
            </Button>
          </div>
        </div>
        <div className="settings-section">
          <div className="settings-section-heading">
            <span className="section-icon">
              <Compass size={18} />
            </span>
            <div>
              <h3>VRChatの基本情報取得</h3>
              <p>{authMessage}</p>
            </div>
          </div>
          <label>
            APIの連絡先（任意）
            <input
              value={form.apiContact}
              onChange={(e) => field("apiContact", e.target.value)}
              placeholder="あなたのWebサイトURL、またはメールアドレス"
            />
          </label>
          <div className="settings-grid">
            <label>
              ログイン用ユーザー名
              <input
                autoComplete="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
              />
            </label>
            <label>
              パスワード
              <input
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </label>
          </div>
          <div className="auth-actions">
            <Button
              onClick={() =>
                void run("VRChatにログインしています", async () => {
                  await save();
                  try {
                    const s = await command<{
                      loggedIn: boolean;
                      displayName: string;
                      methods: string[];
                    }>("vrchat-login", { username, password });
                    setMethods(s.methods);
                    setMethod(
                      s.methods.includes("totp")
                        ? "totp"
                        : s.methods[0] || "totp",
                    );
                    setAuthMessage(
                      s.loggedIn
                        ? `${s.displayName} としてログインしました。`
                        : "二段階認証コードを入力してください。",
                    );
                    notify(
                      s.loggedIn
                        ? "VRChatへのログインが完了しました。"
                        : "二段階認証が必要です。",
                    );
                  } finally {
                    setPassword("");
                  }
                })
              }
            >
              ログイン
            </Button>
            <Button
              variant="subtle"
              onClick={() =>
                void run("ログイン情報を消去しています", async () => {
                  const s = await command<Settings>("clear-secret", {
                    key: "vrchat",
                  });
                  onSaved(s);
                  setMethods([]);
                  setAuthMessage("保存したログイン情報を消去しました。");
                })
              }
            >
              ログイン情報を消去
            </Button>
          </div>
          {methods.length > 0 && (
            <div className="two-factor">
              <select
                value={method}
                onChange={(e) => setMethod(e.target.value)}
              >
                {methods.map((m) => (
                  <option key={m} value={m}>
                    {m === "emailOtp"
                      ? "メール認証"
                      : m === "totp"
                        ? "認証アプリ"
                        : "バックアップコード"}
                  </option>
                ))}
              </select>
              <input
                aria-label="二段階認証コード"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="認証コード"
              />
              <Button
                onClick={() =>
                  void run("認証コードを確認しています", async () => {
                    const s = await command<{
                      loggedIn: boolean;
                      displayName: string;
                      methods: string[];
                    }>("vrchat-verify", { method, code });
                    if (!s.loggedIn)
                      throw new Error("認証が完了していません。");
                    setMethods([]);
                    setCode("");
                    setAuthMessage(`${s.displayName} としてログインしました。`);
                    notify("VRChatへのログインが完了しました。");
                  })
                }
              >
                確認
              </Button>
            </div>
          )}
          <p className="fine-print">
            パスワード・認証コードは保存しません。APIキーとログインセッションはWindowsの機能で暗号化します。
          </p>
        </div>
        <div className="settings-section">
          <div className="settings-section-heading">
            <span className="section-icon">
              <FolderOpen size={18} />
            </span>
            <div>
              <h3>このプロジェクトの保存先</h3>
              <p>
                SQL・メモ・写真・Codexとの受け渡しファイルをまとめて保存します。
              </p>
            </div>
          </div>
          <code className="workspace-path">
            {workspace || "Windowsアプリで確認できます"}
          </code>
          <div className="auth-actions">
            <Button
              icon={FolderOpen}
              onClick={() =>
                void command("open-workspace").catch((e) =>
                  notify(e.message, true),
                )
              }
            >
              フォルダを開く
            </Button>
            <Button
              icon={Save}
              onClick={() =>
                void run("バックアップを作成しています", async () => {
                  const r = await command<{ path: string }>("backup");
                  notify(`バックアップを保存しました：${r.path}`);
                })
              }
            >
              SQLのバックアップ
            </Button>
          </div>
          <p className="fine-print">
            記事の生成は、このプロジェクトのCodexで行います。追加のAI
            API契約・キーは不要です。Codex自体の契約と利用上限は適用されます。
          </p>
        </div>
      </fieldset>
      <div className="modal-actions">
        <Button onClick={onClose} disabled={busy}>
          閉じる
        </Button>
        <Button
          icon={Check}
          variant="primary"
          disabled={busy}
          onClick={() =>
            void run("設定を保存しています", async () => {
              await save();
            })
          }
        >
          設定を保存
        </Button>
      </div>
    </Modal>
  );
}
