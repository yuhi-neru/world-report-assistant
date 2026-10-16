import { Clipboard, FileText, Sparkles } from "lucide-react";
import {
  draftCopy,
  hashtagValue,
  tweetResult,
  tweetTemplate,
  validHashtag,
  worldUrl,
} from "./communication";
import {
  emptyBrief,
  emptySharing,
  type Brief,
  type Review,
  type Sharing,
} from "./types";

export function BriefCard({
  report,
  onChange,
}: {
  report: Review;
  onChange: (value: Brief) => void;
}) {
  if (report.kind === "article") return null;
  const brief = report.brief ?? emptyBrief();
  const fields: {
    key: keyof Brief;
    title: string;
    question: string;
    hint: string;
  }[] = [
    {
      key: "what",
      title: "What",
      question: "何のワールド？",
      hint: "テーマ・世界観。例：雨が降る夜の喫茶店",
    },
    {
      key: "who",
      title: "Who",
      question: "誰向け？",
      hint: "楽しめる人。例：静かに過ごしたい人",
    },
    {
      key: "how",
      title: "How",
      question: "何ができる？",
      hint: "体験・遊び方。例：窓辺で雨音を聞きながら友達と話せる",
    },
    {
      key: "why",
      title: "Why",
      question: "なぜおすすめ？",
      hint: "魅力・特徴。例：窓の雨粒と柔らかい照明が落ち着く",
    },
  ];
  return (
    <section className="card brief-card">
      <div className="section-heading">
        <div className="section-icon">
          <FileText size={18} />
        </div>
        <div>
          <h2>伝えることを、4つの視点で</h2>
          <p>
            書けるところだけで大丈夫。記事の冒頭とツイートの素材になります。
          </p>
        </div>
      </div>
      <div className="brief-grid">
        {fields.map((f) => (
          <label key={f.key}>
            <span>
              <b>{f.title}</b> {f.question}
            </span>
            <textarea
              aria-label={`${f.title} ${f.question}`}
              value={brief[f.key]}
              placeholder={f.hint}
              rows={2}
              maxLength={2000}
              onChange={(e) => onChange({ ...brief, [f.key]: e.target.value })}
            />
          </label>
        ))}
      </div>
    </section>
  );
}

export function CopyCard({
  report,
  onChange,
  notify,
}: {
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
      opening: sharing.opening || draft.opening,
      tweet: sharing.tweet || draft.tweet,
    });
    notify("空欄に4つの視点から雛形を入れました。読み直して整えてください。");
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
          <p>4つの視点から雛形を作り、Codexで文章に整えてから取り込めます。</p>
        </div>
        <button
          className="button"
          onClick={fill}
          disabled={!draft.opening && !draft.tweet}
        >
          <Sparkles size={15} />
          空欄に雛形を入れる
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
              placeholder="何のワールドで、誰がどんな体験を楽しめるのか。なぜおすすめかを2〜4文で。"
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
              placeholder="ワールド名とWhat・Who・How・Whyを短く。URLとタグは下で自動付与します。"
            />
          </label>
          <div className="tweet-controls">
            <label>
              ハッシュタグ（1つ）
              <input
                aria-label="ハッシュタグ（1つ）"
                value={sharing.hashtag}
                onChange={(e) =>
                  onChange({
                    ...sharing,
                    hashtag: hashtagValue(e.target.value),
                  })
                }
                placeholder="VRChat"
                maxLength={60}
              />
            </label>
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
              rows={5}
            />
          </label>
          <p className="copy-hint">
            取得できた対応環境・ワールドURL・ハッシュタグ1つを自動付与。スマホはAndroidとiOSを分けて表示します。文字数は対応環境も含めて計算します。
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
              disabled={!worldUrl(report) || !validHashtag(sharing.hashtag)}
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
