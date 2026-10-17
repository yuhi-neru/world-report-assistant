import { useEffect, useRef, useState } from "react";
import { FileText } from "lucide-react";
import {
  extractMaterials,
  materialHash,
  materialInput,
  materialSources,
} from "./materials";
import type { Review, SourceDocument } from "./types";
const kinds = {
  author: "作者の説明",
  experience: "自分の体験・メモ",
  reference: "参考資料・未確認",
};
export function SourceMaterialsCard({
  report,
  onChange,
  notify,
}: {
  report: Review;
  onChange: (change: (current: Review) => Review) => void;
  notify: (text: string, error?: boolean) => void;
}) {
  const latest = useRef(report);
  latest.current = report;
  const documents = report.sourceDocuments ?? [];
  const input = materialInput(report);
  const sources = materialSources(report);
  const [analyzing, setAnalyzing] = useState(false);
  const [currentHash, setCurrentHash] = useState("");
  const token = useRef(0);
  const fileInput = useRef<HTMLInputElement>(null);
  const analyze = async (force = false) => {
    const snapshot = latest.current;
    const text = materialInput(snapshot);
    if (!materialSources(snapshot).length) return;
    const run = ++token.current;
    setAnalyzing(true);
    try {
      const sourceHash = await materialHash(text);
      if (run !== token.current || materialInput(latest.current) !== text)
        return;
      setCurrentHash(sourceHash);
      if (!force && latest.current.materialAnalysis?.sourceHash === sourceHash)
        return;
      const analysis = { sourceHash, ...extractMaterials(snapshot) };
      onChange((current) =>
        materialInput(current) === text
          ? { ...current, materialAnalysis: analysis }
          : current,
      );
    } catch {
      notify(
        "候補を抽出できませんでした。資料は保存できます。もう一度お試しください。",
        true,
      );
    } finally {
      if (run === token.current) setAnalyzing(false);
    }
  };
  useEffect(() => {
    setCurrentHash("");
    const timer = window.setTimeout(() => {
      void analyze();
    }, 600);
    return () => {
      window.clearTimeout(timer);
      token.current++;
    };
  }, [input]);
  if (report.kind === "article") return null;
  const add = () => {
    if (documents.length >= 10) {
      notify("追加資料は10件までです。", true);
      return;
    }
    const doc: SourceDocument = {
      id: crypto.randomUUID(),
      title: "",
      url: "",
      kind: "reference",
      text: "",
    };
    onChange((current) => ({
      ...current,
      sourceDocuments: [...(current.sourceDocuments ?? []), doc],
      materialAnalysis: null,
    }));
  };
  const change = (id: string, patch: Partial<SourceDocument>) =>
    onChange((current) => ({
      ...current,
      sourceDocuments: (current.sourceDocuments ?? []).map((d) =>
        d.id === id ? { ...d, ...patch } : d,
      ),
      materialAnalysis: null,
    }));
  const importFiles = async (files: File[]) => {
    try {
      if ((latest.current.sourceDocuments?.length ?? 0) + files.length > 10)
        throw new Error("追加資料は10件までです。");
      const added: SourceDocument[] = [];
      for (const file of files) {
        if (!/\.(txt|md)$/i.test(file.name) || file.size > 48000)
          throw new Error(
            "文書は48KB以内のテキスト(.txt)・Markdown(.md)を選んでください。",
          );
        const text = (await file.text()).replace(/^\uFEFF/, "");
        if (text.length > 12000 || text.includes("\uFFFD"))
          throw new Error("文書はUTF-8・12,000文字以内で用意してください。");
        added.push({
          id: crypto.randomUUID(),
          title: file.name.slice(0, 200),
          url: "",
          kind: "reference" as const,
          text,
        });
      }
      if ((latest.current.sourceDocuments?.length ?? 0) + added.length > 10)
        throw new Error("追加資料は10件までです。");
      onChange((current) => ({
        ...current,
        sourceDocuments: [...(current.sourceDocuments ?? []), ...added],
        materialAnalysis: null,
      }));
      notify(`${added.length}件の文書を追加しました。`);
    } catch (error) {
      notify(String(error instanceof Error ? error.message : error), true);
    }
  };
  const analysis = report.materialAnalysis;
  const ready = !!analysis && analysis.sourceHash === currentHash;
  const old = [
    report.experience?.scene,
    report.experience?.action,
    report.experience?.result,
    ...Object.values(report.brief ?? {}),
  ].filter(Boolean);
  return (
    <section className="card source-materials-card">
      <div className="section-heading">
        <div className="section-icon">
          <FileText size={18} />
        </div>
        <div>
          <h2>資料から、紹介の材料を集める</h2>
          <p>
            上のURLから取得した作者情報と、集めた文書をまとめます。語句と原文の候補は自動で抽出します。
          </p>
        </div>
      </div>
      <p className="framework-name">Scene / Action / DiffWow</p>
      <details className="api-source">
        <summary>
          APIの作者説明 {report.world.description ? "取得済み" : "未取得"}
        </summary>
        <p className="source-quote">
          {report.world.description ||
            "上の「情報を取得」でワールドの説明を読み込めます。取得できないときは下に文書を追加してください。"}
        </p>
        <p className="material-hint">
          作者の記載です。自分が確認した体験とは分けて扱います。
        </p>
      </details>
      <div className="source-actions">
        <button
          className="button"
          onClick={add}
          disabled={documents.length >= 10}
        >
          文書を追加
        </button>
        <button
          className="button subtle"
          onClick={() => fileInput.current?.click()}
          disabled={documents.length >= 10}
        >
          テキスト・Markdownを読み込む
        </button>
        <input
          ref={fileInput}
          type="file"
          hidden
          multiple
          accept=".txt,.md,text/plain,text/markdown"
          aria-label="文書ファイルを追加"
          onChange={(e) => {
            const files = [...(e.target.files ?? [])];
            e.target.value = "";
            void importFiles(files);
          }}
        />
      </div>
      <p className="material-hint">
        作者の説明・自分のメモ・集めた紹介文などを貼り付けられます。1件12,000文字、最大10件。出典URLは記録用で、リンク先の本文は自動取得しません。
      </p>
      {documents.map((doc, index) => (
        <div className="source-document" key={doc.id}>
          <div className="source-document-heading">
            <h3>追加資料 {index + 1}</h3>
            <button
              className="button subtle"
              aria-label={`資料${index + 1}を外す`}
              onClick={() =>
                onChange((current) => ({
                  ...current,
                  sourceDocuments: (current.sourceDocuments ?? []).filter(
                    (d) => d.id !== doc.id,
                  ),
                  materialAnalysis: null,
                }))
              }
            >
              外す
            </button>
          </div>
          <div className="source-fields">
            <label>
              名前
              <input
                aria-label={`資料${index + 1}の名前`}
                value={doc.title}
                maxLength={200}
                placeholder="作者の紹介文、訪問メモなど"
                onChange={(e) => change(doc.id, { title: e.target.value })}
              />
            </label>
            <label>
              資料の種類
              <select
                aria-label={`資料${index + 1}の種類`}
                value={doc.kind}
                onChange={(e) =>
                  change(doc.id, {
                    kind: e.target.value as SourceDocument["kind"],
                  })
                }
              >
                {Object.entries(kinds).map(([key, label]) => (
                  <option key={key} value={key}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <label>
            出典URL（任意）
            <input
              aria-label={`資料${index + 1}の出典`}
              value={doc.url}
              maxLength={2000}
              placeholder="参照元があれば記録"
              onChange={(e) => change(doc.id, { url: e.target.value })}
            />
          </label>
          <label>
            文書の本文
            <textarea
              aria-label={`資料${index + 1}の本文`}
              rows={6}
              maxLength={12000}
              value={doc.text}
              placeholder="集めた文章をそのまま貼り付け。書式を揃える必要はありません。"
              onChange={(e) => change(doc.id, { text: e.target.value })}
            />
          </label>
        </div>
      ))}
      <div className="source-analysis-heading">
        <h3>抽出した語句・要素</h3>
        <button
          className="button"
          disabled={!sources.length || analyzing}
          onClick={() => void analyze(true)}
        >
          {analyzing ? "抽出中…" : "再抽出"}
        </button>
      </div>
      <p className="material-hint">
        原文の抜粋を候補として拾っています。事実の確認や意味の判断はまだ行っていません。使わない要素はチェックを外せます。すべての資料と出典はCodexにも渡します。
      </p>
      {ready ? (
        <>
          <div className="source-keywords" aria-label="語句の候補">
            {analysis.keywords.map((term) => (
              <span key={term}>{term}</span>
            ))}
          </div>
          <div className="source-elements">
            {analysis.elements.map((element, index) => {
              const source = sources.find((s) => s.id === element.sourceId);
              return (
                <label
                  className="source-element"
                  key={`${element.sourceId}:${index}`}
                >
                  <input
                    type="checkbox"
                    aria-label={`要素${index + 1}を使う`}
                    checked={element.included}
                    onChange={(e) =>
                      onChange((current) => ({
                        ...current,
                        materialAnalysis: current.materialAnalysis
                          ? {
                              ...current.materialAnalysis,
                              elements: current.materialAnalysis.elements.map(
                                (item, at) =>
                                  at === index
                                    ? { ...item, included: e.target.checked }
                                    : item,
                              ),
                            }
                          : null,
                      }))
                    }
                  />
                  <span>
                    <small>
                      {source?.title || "名前のない資料"} ·{" "}
                      {kinds[source?.kind as keyof typeof kinds] || "参考資料"}
                    </small>
                    <span className="source-quote">{element.quote}</span>
                    {/[?？]|未確認|かも|らしい/.test(element.quote) && (
                      <small>未確認の表現を含みます</small>
                    )}
                  </span>
                </label>
              );
            })}
          </div>
        </>
      ) : (
        <p className="material-hint">
          {analyzing
            ? "資料から候補を拾っています。"
            : "API情報や文書を追加すると候補が表示されます。"}
        </p>
      )}
      {old.length > 0 && (
        <details className="legacy-brief">
          <summary>以前の入力を参照する</summary>
          {old.map((text, index) => (
            <p className="source-quote" key={index}>
              {text}
            </p>
          ))}
        </details>
      )}
    </section>
  );
}
