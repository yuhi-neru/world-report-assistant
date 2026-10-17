import { useState } from "react";
import { PencilLine } from "lucide-react";
import { emptyArticleMaterial, type Notes, type Review } from "./types";

const fields: {
  key: keyof Notes;
  label: string;
  hint: string;
  placeholder: string;
  wide?: boolean;
}[] = [
  {
    key: "activities",
    label: "体験した順序・遊び方",
    hint: "体験した行動を詳しく。どこへ進み、何を操作し、どう変わったか。散策や撮影の流れでも大丈夫です。",
    placeholder: "・入口から窓際の席へ移動した\n・席に座って外を眺めた",
    wide: true,
  },
  {
    key: "scenery",
    label: "景色・空間の補足",
    hint: "写真だけでは伝えきれない広さ・距離・見える位置など。",
    placeholder: "・窓際からは水面まで見渡せた\n・奥の席は照明が控えめだった",
  },
  {
    key: "sound",
    label: "音・音楽・演出の補足",
    hint: "実際に聞いた音や、動く・変化する演出。未確認のものは書かなくて大丈夫です。",
    placeholder:
      "・窓際では雨音がはっきり聞こえた\n・BGMは席を移動しても同じ音量だった",
  },
  {
    key: "highlights",
    label: "印象に残った場面・自分の感想",
    hint: "何を見て、どう感じたか。体験の事実と感想を分けて残します。",
    placeholder:
      "・窓に映る照明が印象に残った\n・雨音を聞きながら、一人で落ち着いて過ごせた",
    wide: true,
  },
  {
    key: "concerns",
    label: "訪問前に伝えておきたいこと",
    hint: "操作で迷った点、移動や音の注意など。動作の重さは自分の訪問環境での感想として。なければ空欄で大丈夫です。",
    placeholder: "・操作説明は入口の右側にあった\n・音量は入室後に調整した",
    wide: true,
  },
];

export function ArticleNotesCard({
  report,
  onChange,
}: {
  report: Review;
  onChange: (change: (current: Review) => Review) => void;
}) {
  const [supplementOpen, setSupplementOpen] = useState(
    !!(report.notes.summary.trim() || report.notes.recommended.trim()),
  );
  const material = report.articleMaterial ?? emptyArticleMaterial();
  const note = (key: keyof Notes, value: string) =>
    onChange((current) => ({
      ...current,
      notes: { ...current.notes, [key]: value },
    }));
  const extra = (key: keyof typeof material, value: string) =>
    onChange((current) => ({
      ...current,
      articleMaterial: {
        ...(current.articleMaterial ?? emptyArticleMaterial()),
        [key]: value,
      },
    }));
  return (
    <section className="card notes-card article-material-card">
      <div className="section-heading">
        <div className="section-icon">
          <PencilLine size={18} />
        </div>
        <div>
          <h2>はてな記事の材料</h2>
          <p>
            集めた素材を、本文で詳しく。重なる内容は書き直さず、補足したいことだけ箇条書きで残せます。
          </p>
        </div>
        <span className="count-label">すべて任意</span>
      </div>
      <div className="material-section">
        <h3>訪問の記録</h3>
        <div className="visit-row">
          <label>
            訪問日
            <input
              type="date"
              value={report.visitedAt}
              onChange={(e) =>
                onChange((current) => ({
                  ...current,
                  visitedAt: e.target.value,
                }))
              }
            />
          </label>
          <label>
            訪問環境
            <select
              value={report.environment}
              onChange={(e) =>
                onChange((current) => ({
                  ...current,
                  environment: e.target.value,
                }))
              }
            >
              <option>PC VR</option>
              <option>デスクトップ</option>
              <option>スタンドアロン / Quest</option>
              <option>その他</option>
            </select>
          </label>
        </div>
        <label>
          一緒に訪れた人数・訪問時の補足
          <textarea
            rows={2}
            maxLength={2000}
            aria-label="一緒に訪れた人数・訪問時の補足"
            value={material.visitContext}
            placeholder="例：一人で訪問。友人と2人で散策。記事に残したい訪問条件だけ。"
            onChange={(e) => extra("visitContext", e.target.value)}
          />
        </label>
        <p className="material-hint">
          自分が使った機器と、ワールドが対応する機器は別の情報です。作者の説明を引用する場合は、出典もメモしてください。
        </p>
      </div>
      <div className="material-section">
        <h3>本文に残す体験</h3>
        <p className="material-hint">
          上の資料や写真の説明も記事の材料になります。本文の各見出しを、この欄の数だけ作る必要はありません。
        </p>
        <div className="notes-grid">
          {fields.map((f) => (
            <label className={f.wide ? "full" : ""} key={f.key}>
              <span>{f.label}</span>
              <small className="material-hint">{f.hint}</small>
              <textarea
                aria-label={f.label}
                rows={f.wide ? 4 : 3}
                maxLength={10000}
                value={report.notes[f.key]}
                placeholder={f.placeholder}
                onChange={(e) => note(f.key, e.target.value)}
              />
            </label>
          ))}
        </div>
        <details
          className="material-supplement"
          key={report.id}
          open={supplementOpen}
          onToggle={(e) => setSupplementOpen(e.currentTarget.open)}
        >
          <summary>記事の軸・おすすめの補足（任意）</summary>
          <p className="material-hint">
            資料に加えて伝えたいことがある場合に。以前の「ひとことでいうと」「どんな人におすすめ？」の入力もここに残ります。
          </p>
          <label>
            記事全体で伝えたいこと
            <textarea
              rows={2}
              maxLength={10000}
              aria-label="記事全体で伝えたいこと"
              value={report.notes.summary}
              placeholder="記事全体で残しておきたいことがあれば。"
              onChange={(e) => note("summary", e.target.value)}
            />
          </label>
          <label>
            楽しみ方・向いていそうな人
            <textarea
              rows={2}
              maxLength={10000}
              aria-label="楽しみ方・向いていそうな人"
              value={report.notes.recommended}
              placeholder="実際の体験から、自分ならどう楽しむか・誰に合いそうか。"
              onChange={(e) => note("recommended", e.target.value)}
            />
          </label>
        </details>
      </div>
      <div className="material-section">
        <h3>記事化の希望</h3>
        <div className="notes-grid">
          <label>
            記事で重点を置くこと
            <textarea
              rows={3}
              maxLength={2000}
              aria-label="記事で重点を置くこと"
              value={material.focus}
              placeholder="例：散策の流れを中心に。自分の言い回しを残す。操作方法は詳しく。"
              onChange={(e) => extra("focus", e.target.value)}
            />
          </label>
          <label>
            記事に含めないこと
            <textarea
              rows={3}
              maxLength={2000}
              aria-label="記事に含めないこと"
              value={material.omit}
              placeholder="例：同行者の名前、仕掛けの結末。空欄なら特別な指定なし。"
              onChange={(e) => extra("omit", e.target.value)}
            />
          </label>
        </div>
        <p className="material-hint">
          この希望は記事の編集方針としてCodexへ渡します。新しい事実を補ったり、公開を指示したりするための欄ではありません。
        </p>
      </div>
    </section>
  );
}
