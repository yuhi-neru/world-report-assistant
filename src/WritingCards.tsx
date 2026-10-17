import { Clipboard, FileText, Sparkles } from "lucide-react";
import {
  draftCopy,
  tweetResult,
  tweetTemplate,
  worldUrl,
} from "./communication";
import { emptySharing, type Review, type Sharing } from "./types";

export function CopyCard({
  report,
  onChange,
  notify,
  tweetOnly = false,
}: {
  tweetOnly?: boolean;
  report: Review;
  onChange: (value: Sharing) => void;
  notify: (text: string, error?: boolean) => void;
}) {
  if (report.kind === "article") return null;
  const sharing = report.sharing ?? emptySharing();
  const result = tweetResult(report);
  const draft = draftCopy(report);
  const fill = () => {
    onChange({
      ...sharing,
      opening: tweetOnly ? sharing.opening : sharing.opening || draft.opening,
      tweet: sharing.tweet || draft.tweet,
    });
    notify("空欄に選んだ原文の抜粋を入れました。Codexで文章を整えられます。");
  };
  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      notify("コピーしました。");
    } catch {
      notify(
        "コピーできませんでした。表示された文章を選択してコピーしてください。",
        true,
      );
    }
  };
  return (
    <section className="card copy-card">
      <div className="section-heading">
        <div className="section-icon">
          <Sparkles size={18} />
        </div>
        <div>
          <h2>記事の冒頭と、ツイート</h2>
          <p>抽出した語句・原文の候補から、Codexで自然な紹介文に整えます。</p>
        </div>
        <button
          className="button"
          onClick={fill}
          disabled={!draft.opening && !draft.tweet}
        >
          <Sparkles size={15} />
          空欄に素材を入れる
        </button>
      </div>
      <div className="copy-grid">
        <div>
          <label>
            記事の冒頭文
            <textarea
              aria-label="記事の冒頭文"
              value={sharing.opening}
              onChange={(e) =>
                onChange({ ...sharing, opening: e.target.value })
              }
              rows={5}
              maxLength={8000}
              placeholder="どんな場所で何をすると、何を体験できるのか。自然につながる2〜3文で。"
            />
          </label>
          <label className="check-row">
            <input
              type="checkbox"
              checked={sharing.includeOpening}
              onChange={(e) =>
                onChange({ ...sharing, includeOpening: e.target.checked })
              }
            />
            この冒頭文を記事の先頭に付ける
          </label>
          <p className="copy-hint">
            冒頭文 → 基本情報 →
            本文の順でプレビュー・投稿します。本文への重複貼り付けは不要です。
          </p>
          <button
            className="button subtle"
            disabled={!sharing.opening.trim()}
            onClick={() => void copy(sharing.opening)}
          >
            <Clipboard size={15} />
            冒頭文をコピー
          </button>
        </div>
        <div>
          <label>
            ツイート本文
            <textarea
              aria-label="ツイート本文"
              value={sharing.tweet}
              onChange={(e) => onChange({ ...sharing, tweet: e.target.value })}
              rows={5}
              maxLength={4000}
              placeholder="資料にある具体的な特徴と体験を短く。チャットで完成文を受け取れます。"
            />
          </label>
          <div className="tweet-controls">
            <p className="copy-hint">末尾のタグ：#VRchat #VRChatワールド紹介</p>
            <span
              className={
                result.length > 280 ? "tweet-count over" : "tweet-count"
              }
              aria-label="ツイート文字数"
            >
              {result.length} / 280
            </span>
          </div>
          <label>
            URL・タグ付きの完成文
            <textarea
              aria-label="URL・タグ付きの完成文"
              value={result.text}
              readOnly
              rows={11}
            />
          </label>
          <p className="copy-hint">
            取得できた対応環境を添え、末尾にワールド名・URL・指定の2タグを自動付与。スマホはAndroidとiOSを分けて表示します。文字数は対応環境も含めて計算します。
          </p>
          {result.issues.length > 0 && (
            <p className="copy-issue" role="status">
              {result.issues[0]}
            </p>
          )}
          <div className="copy-actions">
            <button
              className="button primary"
              disabled={result.issues.length > 0}
              onClick={() => void copy(result.text)}
            >
              <Clipboard size={15} />
              ツイート文をコピー
            </button>
            <button
              className="button"
              disabled={!worldUrl(report) || !report.world.name.trim()}
              onClick={() => void copy(tweetTemplate(report))}
            >
              ツイート雛形をコピー
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
