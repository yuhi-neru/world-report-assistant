import { Clipboard, FileText, Sparkles } from "lucide-react";
import {
  draftCopy,
  tweetResult,
  tweetTemplate,
  worldUrl,
} from "./communication";
import {
  emptyBrief,
  emptyExperience,
  emptySharing,
  type Experience,
  type Review,
  type Sharing,
} from "./types";

export function ExperienceCard({
  report,
  onChange,
}: {
  report: Review;
  onChange: (value: Experience) => void;
}) {
  if (report.kind === "article") return null;
  const experience = report.experience ?? emptyExperience();
  const legacy = report.brief ?? emptyBrief();
  const fields: {
    key: keyof Experience;
    title: string;
    question: string;
    hint: string;
  }[] = [
    {
      key: "scene",
      title: "Scene",
      question: "どんな場所？",
      hint: "訪問先を思い浮かべる手がかり。例：雨が降る夜の喫茶店",
    },
    {
      key: "action",
      title: "Action",
      question: "そこで何をする？",
      hint: "同じ場所での具体的な行動。例：窓際に座って外を眺める。散策・撮影も行動です",
    },
    {
      key: "result",
      title: "Result",
      question: "すると何を体験できる？",
      hint: "上の行動で見える・聞こえること。例：窓に当たる雨粒と、室内に響く雨音を楽しめる。確認した内容だけ",
    },
  ];
  return (
    <section className="card brief-card">
      <div className="section-heading">
        <div className="section-icon">
          <FileText size={18} />
        </div>
        <div>
          <h2>Joinした後の体験を、順番に</h2>
          <p>
            同じ体験を「場所 → 行動 →
            その結果」でつなぎます。写真だけでは伝わらない音・仕組みも、確認できたら記入してください。未確認の欄は空欄で大丈夫です。
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
              value={experience[f.key]}
              placeholder={f.hint}
              rows={2}
              maxLength={2000}
              onChange={(e) =>
                onChange({ ...experience, [f.key]: e.target.value })
              }
            />
          </label>
        ))}
      </div>
      <p className="copy-hint">
        SARは文章を組み立てるための手がかりです。完成文にラベルは付きません。「綺麗」「おすすめ」より、どこで何をすると何が起こるかを具体的に残します。
      </p>
      {Object.values(legacy).some((v) => v.trim()) && (
        <details className="legacy-brief">
          <summary>以前の4項目を参照する（保存内容は維持）</summary>
          <dl>
            {[
              ["What", legacy.what],
              ["Who", legacy.who],
              ["How", legacy.how],
              ["Why", legacy.why],
            ].map(
              ([label, text]) =>
                text && (
                  <div key={label}>
                    <dt>{label}</dt>
                    <dd>{text}</dd>
                  </div>
                ),
            )}
          </dl>
          <p className="copy-hint">
            おすすめ理由を結果へ自動変換しません。確認できる体験だけを上の欄へ整理してください。
          </p>
        </details>
      )}
    </section>
  );
}

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
    notify("空欄に体験の流れから雛形を入れました。読み直して整えてください。");
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
          <p>
            場所・行動・結果から雛形を作り、Codexでつながる文章に整えて取り込めます。
          </p>
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
              placeholder="原則3行で、場所 → 行動 → その結果。ワールド名・URL・2タグは下で自動付与します。"
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
