import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  ArrowDownToLine,
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCheck,
  Clipboard,
  Compass,
  ExternalLink,
  FileText,
  FolderOpen,
  ImagePlus,
  Link,
  LoaderCircle,
  MapPin,
  PencilLine,
  Plus,
  RefreshCw,
  Save,
  Search,
  Send,
  Settings2,
  ShieldCheck,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import { command, imageForArticle, native } from "./bridge";
import { previewHtml } from "./article";
import {
  editKey,
  newReview,
  statusLabel,
  type Boot,
  type Notes,
  type Photo,
  type Review,
  type Summary,
  type World,
  type Settings,
} from "./types";
import SettingsModal from "./Settings";
import { getCurrentWindow } from "@tauri-apps/api/window";

export const noteFields: {
  key: keyof Notes;
  label: string;
  placeholder: string;
  wide?: boolean;
}[] = [
  {
    key: "summary",
    label: "ひとことでいうと",
    placeholder: "例：雨音を聞きながら、のんびり過ごせる小さな喫茶店",
    wide: true,
  },
  {
    key: "scenery",
    label: "景色・空間",
    placeholder: "・窓の外に海が見える\n・夕方の光がきれい",
  },
  {
    key: "sound",
    label: "音・音楽",
    placeholder: "・静かなピアノのBGM\n・窓際では雨音が聞こえる",
  },
  {
    key: "activities",
    label: "できること",
    placeholder: "・友達と雑談\n・窓際の席で撮影",
  },
  {
    key: "highlights",
    label: "よかったところ",
    placeholder: "・照明が柔らかく、写真を撮りやすかった",
  },
  {
    key: "concerns",
    label: "気になったところ",
    placeholder: "・実際に気づいたことだけ。なければ空欄でOK",
  },
  {
    key: "recommended",
    label: "どんな人におすすめ？",
    placeholder: "・二人でゆっくり話したい人\n・落ち着いた写真を撮りたい人",
  },
];
export function Button({
  children,
  icon: Icon,
  onClick,
  variant = "",
  disabled = false,
  title,
}: {
  children?: ReactNode;
  icon?: typeof Plus;
  onClick?: () => void;
  variant?: string;
  disabled?: boolean;
  title?: string;
}) {
  return (
    <button
      type="button"
      className={`button ${variant}`}
      onClick={onClick}
      disabled={disabled}
      title={title}
    >
      {Icon && <Icon size={16} />}
      <span>{children}</span>
    </button>
  );
}
export function Modal({
  title,
  children,
  onClose,
  wide = false,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  wide?: boolean;
}) {
  return (
    <div
      className="overlay"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <section
        className={`modal ${wide ? "wide" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className="modal-heading">
          <h2>{title}</h2>
          <button className="icon-button" aria-label="閉じる" onClick={onClose}>
            <X size={20} />
          </button>
        </div>
        {children}
      </section>
    </div>
  );
}

export default function App() {
  const initial = useRef(newReview());
  const [draft, setDraft] = useState(initial.current),
    [photos, setPhotos] = useState<Photo[]>([]),
    [reviews, setReviews] = useState<Summary[]>([]);
  const [settings, setSettings] = useState<Settings | null>(null),
    [workspace, setWorkspace] = useState(""),
    [url, setUrl] = useState(""),
    [query, setQuery] = useState("");
  const [tab, setTab] = useState<"notes" | "article">("notes"),
    [busy, setBusy] = useState(""),
    [toast, setToast] = useState<{ text: string; error: boolean } | null>(null),
    [saveState, setSaveState] = useState("保存前");
  const [settingsOpen, setSettingsOpen] = useState(false),
    [publishOpen, setPublishOpen] = useState(false),
    [packet, setPacket] = useState<{ path: string; prompt: string } | null>(
      null,
    ),
    [dragging, setDragging] = useState(false),
    [resetChecked, setResetChecked] = useState(false);
  const current = useRef(draft),
    savedKey = useRef(editKey(initial.current)),
    savePromise = useRef<Promise<Review> | null>(null),
    photoWrite = useRef<Promise<void> | null>(null),
    busyRef = useRef(""),
    queryRef = useRef(""),
    fileInput = useRef<HTMLInputElement>(null),
    bodyInput = useRef<HTMLTextAreaElement>(null);
  current.current = draft;
  busyRef.current = busy;
  queryRef.current = query;
  const notify = useCallback(
    (text: string, error = false) => setToast({ text, error }),
    [],
  );
  const update = useCallback((fn: (r: Review) => Review) => {
    setDraft((r) => {
      const next = fn(r);
      current.current = next;
      return next;
    });
    setSaveState("未保存");
  }, []);
  const refresh = useCallback(
    async () =>
      setReviews(await command<Summary[]>("list", { query: queryRef.current })),
    [],
  );
  const persist = useCallback(
    async function save(): Promise<Review> {
      if (savePromise.current) {
        await savePromise.current;
        return save();
      }
      const snapshot = current.current;
      if (snapshot.revision > 0 && savedKey.current === editKey(snapshot))
        return snapshot;
      setSaveState("保存中…");
      const promise = command<Review>("save", { review: snapshot })
        .then((saved) => {
          savedKey.current = editKey(snapshot);
          if (current.current.id === saved.id) {
            const latest = {
              ...current.current,
              revision: saved.revision,
              status: saved.status,
              editUrl: saved.editUrl,
              publicUrl: saved.publicUrl,
              previewUrl: saved.previewUrl,
              targetBlog: saved.targetBlog,
              updatedAt: saved.updatedAt,
            };
            current.current = latest;
            setDraft(latest);
            setSaveState(
              editKey(latest) === savedKey.current ? "保存済み" : "未保存",
            );
          }
          void refresh().catch(() => {});
          return saved;
        })
        .catch((e) => {
          setSaveState("保存できませんでした");
          throw e;
        })
        .finally(() => {
          savePromise.current = null;
        });
      savePromise.current = promise;
      return promise;
    },
    [refresh],
  );
  const run = useCallback(
    async (label: string, fn: () => Promise<void>) => {
      if (busyRef.current) return;
      busyRef.current = label;
      setBusy(label);
      try {
        if (photoWrite.current) await photoWrite.current;
        await fn();
      } catch (e) {
        notify(e instanceof Error ? e.message : String(e), true);
      } finally {
        busyRef.current = "";
        setBusy("");
      }
    },
    [notify],
  );
  const accept = useCallback((r: Review) => {
    current.current = r;
    savedKey.current = editKey(r);
    setDraft(r);
    setSaveState("保存済み");
  }, []);
  useEffect(() => {
    let live = true;
    if (native)
      void command<Boot>("bootstrap")
        .then((b) => {
          if (live) {
            setSettings(b.settings);
            setWorkspace(b.workspace);
            setReviews(b.reviews);
          }
        })
        .catch((e) => notify(e.message, true));
    return () => {
      live = false;
    };
  }, [notify]);
  useEffect(() => {
    if (
      !native ||
      busy ||
      savedKey.current === editKey(draft) ||
      ["publishing", "publish-unknown"].includes(draft.status)
    )
      return;
    const timer = window.setTimeout(() => {
      void persist().catch((e) => notify(e.message, true));
    }, 900);
    return () => window.clearTimeout(timer);
  }, [draft, busy, persist, notify]);
  useEffect(() => {
    if (!native) return;
    const timer = window.setTimeout(() => {
      void refresh().catch(() => {});
    }, 200);
    return () => window.clearTimeout(timer);
  }, [query, refresh]);
  useEffect(() => {
    if (!toast || toast.error) return;
    const timer = window.setTimeout(() => setToast(null), 6500);
    return () => window.clearTimeout(timer);
  }, [toast]);
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (savedKey.current !== editKey(current.current) || savePromise.current)
        e.preventDefault();
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, []);
  useEffect(() => {
    if (!native) return;
    let dispose: (() => void) | undefined;
    let stopped = false;
    void getCurrentWindow()
      .onCloseRequested(async (event) => {
        if (busyRef.current) {
          event.preventDefault();
          notify("処理が終わってからアプリを閉じてください。", true);
          return;
        }
        if (
          savedKey.current !== editKey(current.current) ||
          savePromise.current ||
          photoWrite.current
        ) {
          event.preventDefault();
          try {
            if (photoWrite.current) await photoWrite.current;
            await persist();
            await getCurrentWindow().destroy();
          } catch (e) {
            notify(String(e), true);
          }
        }
      })
      .then((fn) => {
        if (stopped) fn();
        else dispose = fn;
      })
      .catch(() => {});
    return () => {
      stopped = true;
      dispose?.();
    };
  }, [persist, notify]);
  const openReview = (id: string) =>
    void run("記録を開いています", async () => {
      if (editKey(current.current) !== savedKey.current) await persist();
      const v = await command<{ review: Review; photos: Photo[] }>("read", {
        id,
      });
      accept(v.review);
      setPhotos(v.photos);
      setUrl(v.review.world.url);
      setPacket(null);
      setTab(v.review.body ? "article" : "notes");
      setResetChecked(false);
    });
  const create = () =>
    void run("新しい記録を準備しています", async () => {
      if (editKey(current.current) !== savedKey.current) await persist();
      const next = newReview();
      current.current = next;
      savedKey.current = editKey(next);
      setDraft(next);
      setPhotos([]);
      setUrl("");
      setPacket(null);
      setTab("notes");
      setSaveState("保存前");
    });
  const loadWorld = () =>
    void run("ワールド情報を取得しています", async () => {
      const world = await command<World>("fetch-world", { url });
      if (
        current.current.world.id &&
        current.current.world.id !== world.id &&
        (photos.length > 0 ||
          current.current.body ||
          Object.values(current.current.notes).some(Boolean))
      )
        throw new Error("別のワールドは「新しい記録」から追加してください。");
      update((r) => ({ ...r, world }));
      notify("ワールドの基本情報を取得しました。");
    });
  const manualWorld = () =>
    void run("ワールドを準備しています", async () => {
      const world = await command<World>("identify-world", { url });
      if (current.current.world.id && current.current.world.id !== world.id)
        throw new Error("別のワールドは「新しい記録」から追加してください。");
      update((r) => ({
        ...r,
        world: { ...world, name: r.world.name, author: r.world.author },
      }));
      notify(
        "ワールド名と作者を入力してください。対応環境は未確認として保存します。",
      );
    });
  const addFiles = (files: File[]) =>
    void run("写真を保存しています", async () => {
      await persist();
      let added = 0;
      for (const file of files) {
        if (photos.length + added >= 20)
          throw new Error("写真は1記事20枚までです。");
        const dataUrl = await imageForArticle(file);
        const p = await command<Photo>("add-photo", {
          id: current.current.id,
          name: file.name,
          dataUrl,
        });
        setPhotos((old) => [...old, p]);
        added++;
      }
      await refresh();
      notify(`${added}枚の写真を保存しました。`);
    });
  const prepare = () =>
    void run("Codex用の素材をまとめています", async () => {
      await persist();
      const p = await command<{ path: string; prompt: string }>(
        "prepare-codex",
        { id: current.current.id },
      );
      setPacket(p);
      try {
        await navigator.clipboard.writeText(p.prompt);
        notify(
          "依頼文をコピーしました。このプロジェクトのCodexチャットに貼り付けてください。",
        );
      } catch {
        notify("素材を保存しました。表示された依頼文をCodexに渡してください。");
      }
    });
  const importArticle = () =>
    void run("記事を取り込んでいます", async () => {
      await persist();
      const r = await command<Review>("import-article", {
        id: current.current.id,
      });
      accept(r);
      setTab("article");
      setPacket(null);
      await refresh();
      notify("Codexの記事を取り込みました。自由に削ったり書き直せます。");
    });
  const insertPhoto = (p: Photo) => {
    const r = current.current,
      marker = `\n\n{{photo:${p.id}}}\n\n`,
      at = bodyInput.current?.selectionStart ?? r.body.length;
    update((r) => ({
      ...r,
      body: r.body.slice(0, at) + marker + r.body.slice(at),
    }));
  };
  const removePhoto = (p: Photo) =>
    void run("写真を外しています", async () => {
      await command("remove-photo", { id: p.id, reviewId: draft.id });
      setPhotos((old) => old.filter((v) => v.id !== p.id));
      update((r) => ({
        ...r,
        body: r.body.replaceAll(`{{photo:${p.id}}}`, ""),
      }));
    });
  const pending = ["publishing", "publish-unknown"].includes(draft.status);
  const publish = (asDraft: boolean) =>
    void run("はてなブログに送信しています", async () => {
      try {
        const r = await persist(),
          result = await command<Review>("publish", {
            id: r.id,
            revision: r.revision,
            draft: asDraft,
          });
        accept(result);
        setPublishOpen(false);
        await refresh();
        notify(
          result.status === "published"
            ? "記事を公開しました。"
            : "はてなブログに下書きを保存しました。",
        );
      } catch (e) {
        const result = await command<{ review: Review }>("read", {
          id: current.current.id,
        });
        accept(result.review);
        throw e;
      }
    });
  const external = (url: string) =>
    void run("リンクを開いています", async () => {
      await command("open-external", { url });
    });
  const noteCount = Object.values(draft.notes).filter((s) => s.trim()).length;

  return (
    <div
      className="app-shell"
      onPaste={(e) => {
        const files = Array.from(e.clipboardData.files).filter((f) =>
          f.type.startsWith("image/"),
        );
        if (
          files.length &&
          !busy &&
          !pending &&
          !settingsOpen &&
          !publishOpen
        ) {
          e.preventDefault();
          addFiles(files);
        }
      }}
    >
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">
            <Compass size={24} />
          </div>
          <div>
            WORLD REVIEW<small>ASSISTANT</small>
          </div>
        </div>
        <div className="sidebar-label">YOUR FIELD NOTES</div>
        <Button
          icon={Plus}
          variant="new-note"
          onClick={create}
          disabled={!!busy}
        >
          新しい記録
        </Button>
        <label className="search-box">
          <Search size={15} />
          <input
            aria-label="保存した記録を検索"
            placeholder="記録を探す"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
        <div className="list-heading">
          <span>保存した記録</span>
          <button
            className="icon-button"
            aria-label="記録一覧を更新"
            onClick={() => void refresh().catch((e) => notify(e.message, true))}
          >
            <RefreshCw size={13} />
          </button>
        </div>
        <nav className="review-list">
          {reviews.map((r) => (
            <button
              key={r.id}
              className={`review-item ${r.id === draft.id ? "selected" : ""}`}
              onClick={() => openReview(r.id)}
              disabled={!!busy}
            >
              <FileText size={16} />
              <span>
                <strong>{r.worldName || r.title || "名前のない記録"}</strong>
                <small>
                  {r.visitedAt} <i>·</i> {statusLabel(r.status)}
                </small>
              </span>
              {r.status === "published" && <Check size={13} />}
            </button>
          ))}
          {!reviews.length && (
            <p className="empty-list">
              訪れた場所を、
              <br />
              ひとつずつ残していこう。
            </p>
          )}
        </nav>
        <div className="sidebar-bottom">
          <div className="local-note">
            <ShieldCheck size={16} />
            <span>記録はこのPCに保存</span>
          </div>
          <button
            className="settings-link"
            onClick={() => setSettingsOpen(true)}
          >
            <Settings2 size={17} />
            設定・ブログ連携
          </button>
          <div className="sidebar-version">
            World Review Assistant <span>0.1</span>
          </div>
        </div>
      </aside>
      <main className="main">
        <header className="topbar">
          <div className="breadcrumb">
            <span>マイノート</span>
            <span>/</span>
            <strong>{draft.world.name || "新しいワールドレビュー"}</strong>
          </div>
          <div className="top-actions">
            <span
              className={`save-status ${saveState.includes("できません") ? "failed" : ""}`}
            >
              {saveState === "保存済み" ? (
                <CheckCheck size={14} />
              ) : (
                <span className="status-dot" />
              )}
              {saveState}
            </span>
            <Button
              icon={Save}
              variant="subtle"
              onClick={() =>
                void run("保存しています", async () => {
                  await persist();
                  notify("記録を保存しました。");
                })
              }
              disabled={!!busy}
            >
              保存
            </Button>
          </div>
        </header>
        {!native && (
          <div className="preview-banner">
            ブラウザでの画面プレビューです。保存・取得・投稿はWindowsアプリで利用できます。
          </div>
        )}
        <div className="page-heading">
          <div>
            <p className="eyebrow">A PLACE WORTH REMEMBERING</p>
            <h1>
              {draft.world.name ||
                (draft.kind === "article"
                  ? draft.title
                  : "今日の体験を、記事に。")}
            </h1>
            <p className="page-description">
              メモと写真を残して、Codexと一緒にあなただけのワールドレビューを。
            </p>
          </div>
          <span
            className={`state-pill ${draft.status === "published" ? "published" : ""}`}
          >
            <span />
            {statusLabel(draft.status)}
          </span>
        </div>
        <div className="workflow">
          <div className={tab === "notes" ? "active" : ""}>
            <span className="step-number">01</span>
            <div>
              <strong>体験を残す</strong>
              <small>URL・箇条書き・写真</small>
            </div>
          </div>
          <ArrowRight size={15} />
          <div className={packet ? "active" : ""}>
            <span className="step-number">02</span>
            <div>
              <strong>Codexで記事に</strong>
              <small>素材を渡して、文章を作る</small>
            </div>
          </div>
          <ArrowRight size={15} />
          <div className={tab === "article" ? "active" : ""}>
            <span className="step-number">03</span>
            <div>
              <strong>整えて、公開する</strong>
              <small>自分で添削して、はてなへ</small>
            </div>
          </div>
        </div>
        <div className="content-toolbar">
          <div className="tabs" role="tablist">
            <button
              role="tab"
              aria-selected={tab === "notes"}
              className={tab === "notes" ? "active" : ""}
              onClick={() => setTab("notes")}
            >
              <PencilLine size={16} />
              メモと写真
            </button>
            <button
              role="tab"
              aria-selected={tab === "article"}
              className={tab === "article" ? "active" : ""}
              onClick={() => setTab("article")}
            >
              <FileText size={16} />
              記事を整える{draft.body && <span className="tab-dot" />}
            </button>
          </div>
          <div className="toolbar-buttons">
            <Button
              icon={ArrowDownToLine}
              variant="subtle"
              onClick={importArticle}
              disabled={!!busy || pending}
            >
              記事を取り込む
            </Button>
            {tab === "notes" ? (
              <Button
                icon={Sparkles}
                variant="primary"
                onClick={prepare}
                disabled={!!busy || pending}
              >
                Codexに渡す
              </Button>
            ) : (
              <Button
                icon={Send}
                variant="primary"
                onClick={() => setPublishOpen(true)}
                disabled={!!busy || pending || !draft.body.trim()}
              >
                はてなへ投稿
              </Button>
            )}
          </div>
        </div>
        {busy && (
          <div className="busy-bar" role="status">
            <LoaderCircle className="spin" size={16} />
            {busy}…
          </div>
        )}
        {packet && (
          <section className="codex-panel">
            <div>
              <Sparkles size={20} />
              <div>
                <strong>Codexへの素材がそろいました</strong>
                <p>
                  この依頼文を、このプロジェクトのチャットに貼り付けてください。
                </p>
              </div>
              <button
                className="icon-button"
                aria-label="依頼パネルを閉じる"
                onClick={() => setPacket(null)}
              >
                <X size={18} />
              </button>
            </div>
            <textarea
              aria-label="Codexへの依頼文"
              readOnly
              value={packet.prompt}
            />
            <div className="packet-actions">
              <Button
                icon={Clipboard}
                onClick={() =>
                  void navigator.clipboard
                    .writeText(packet.prompt)
                    .then(() => notify("依頼文をコピーしました。"))
                    .catch(() =>
                      notify("依頼文を選択してコピーしてください。", true),
                    )
                }
              >
                依頼文をコピー
              </Button>
              <Button
                icon={FolderOpen}
                variant="subtle"
                onClick={() =>
                  void command("open-workspace", { id: draft.id }).catch((e) =>
                    notify(e.message, true),
                  )
                }
              >
                素材フォルダ
              </Button>
              <small>記事ができたら「記事を取り込む」へ</small>
            </div>
          </section>
        )}
        {pending && (
          <section className="pending-panel">
            <strong>投稿結果を確認してください</strong>
            <p>
              通信が途切れたため、重複を防ぐために再送を止めています。公開済み・はてな下書きを確認します。
            </p>
            <Button
              icon={RefreshCw}
              onClick={() =>
                void run("投稿結果を確認しています", async () => {
                  accept(await command<Review>("reconcile", { id: draft.id }));
                  await refresh();
                  notify("投稿結果を確認できました。");
                })
              }
              disabled={!!busy}
            >
              投稿結果を確認
            </Button>
            {!draft.editUrl && (
              <details>
                <summary>ブログに記事が存在しないことを確認した場合</summary>
                <label className="check-row">
                  <input
                    type="checkbox"
                    checked={resetChecked}
                    onChange={(e) => setResetChecked(e.target.checked)}
                  />
                  ブログ管理画面で、この記事が公開記事にも下書きにも存在しないことを確認した
                </label>
                <Button
                  disabled={!resetChecked || !!busy}
                  onClick={() =>
                    void run("投稿状態を戻しています", async () =>
                      accept(
                        await command<Review>("reset-publish", {
                          id: draft.id,
                          confirmedNoPost: true,
                        }),
                      ),
                    )
                  }
                >
                  ローカル下書きに戻す
                </Button>
              </details>
            )}
          </section>
        )}
        <fieldset className="workspace-fields" disabled={!!busy || pending}>
          {tab === "notes" ? (
            <div className="capture-grid">
              <div className="capture-main">
                <section className="card url-card">
                  <div className="section-heading">
                    <div className="section-icon">
                      <Link size={18} />
                    </div>
                    <div>
                      <h2>ワールドを追加</h2>
                      <p>VRChatのワールドURLを貼り付けてください。</p>
                    </div>
                  </div>
                  <div className="url-input">
                    <input
                      aria-label="ワールドURL"
                      placeholder="https://vrchat.com/home/world/wrld_…"
                      value={url}
                      onChange={(e) => setUrl(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          loadWorld();
                        }
                      }}
                    />
                    <Button
                      icon={ArrowRight}
                      variant="primary"
                      onClick={loadWorld}
                      disabled={!url.trim()}
                    >
                      情報を取得
                    </Button>
                  </div>
                  <div className="url-hint">
                    <span>
                      名前・作者・説明など、取得できる基本情報を入力します。
                    </span>
                    <button
                      className="text-button"
                      onClick={manualWorld}
                      disabled={!url.trim()}
                    >
                      手入力する
                    </button>
                  </div>
                </section>
                <section className="card notes-card">
                  <div className="section-heading">
                    <div className="section-icon">
                      <PencilLine size={18} />
                    </div>
                    <div>
                      <h2>体験メモ</h2>
                      <p>
                        短い箇条書きで大丈夫。あなたが感じたことを、そのまま。
                      </p>
                    </div>
                    <span className="count-label">{noteCount} / 7</span>
                  </div>
                  <div className="visit-row">
                    <label>
                      訪問日
                      <input
                        type="date"
                        value={draft.visitedAt}
                        onChange={(e) =>
                          update((r) => ({ ...r, visitedAt: e.target.value }))
                        }
                      />
                    </label>
                    <label>
                      訪問環境
                      <select
                        value={draft.environment}
                        onChange={(e) =>
                          update((r) => ({ ...r, environment: e.target.value }))
                        }
                      >
                        <option>PC VR</option>
                        <option>デスクトップ</option>
                        <option>スタンドアロン / Quest</option>
                        <option>その他</option>
                      </select>
                    </label>
                  </div>
                  <div className="notes-grid">
                    {noteFields.map((f) => (
                      <label className={f.wide ? "full" : ""} key={f.key}>
                        {f.label}
                        {f.key === "summary" && (
                          <small>まずは、ひとつだけでも</small>
                        )}
                        <textarea
                          rows={f.wide ? 2 : 3}
                          value={draft.notes[f.key]}
                          placeholder={f.placeholder}
                          onChange={(e) =>
                            update((r) => ({
                              ...r,
                              notes: { ...r.notes, [f.key]: e.target.value },
                            }))
                          }
                        />
                      </label>
                    ))}
                  </div>
                </section>
                <section className="card photos-card">
                  <div className="section-heading">
                    <div className="section-icon">
                      <ImagePlus size={18} />
                    </div>
                    <div>
                      <h2>撮影した写真</h2>
                      <p>
                        ドラッグ＆ドロップ、またはコピーした画像を貼り付け。
                      </p>
                    </div>
                    <span className="count-label">{photos.length} / 20</span>
                  </div>
                  <input
                    ref={fileInput}
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    multiple
                    hidden
                    onChange={(e) => {
                      if (e.target.files) addFiles(Array.from(e.target.files));
                      e.target.value = "";
                    }}
                  />
                  <div
                    className={`photo-drop ${dragging ? "dragging" : ""}`}
                    onDragOver={(e) => {
                      e.preventDefault();
                      setDragging(true);
                    }}
                    onDragLeave={() => setDragging(false)}
                    onDrop={(e) => {
                      e.preventDefault();
                      setDragging(false);
                      if (!busy && !pending)
                        addFiles(Array.from(e.dataTransfer.files));
                    }}
                  >
                    <ImagePlus size={24} strokeWidth={1.5} />
                    <span>写真をここにドロップ</span>
                    <small>または</small>
                    <Button onClick={() => fileInput.current?.click()}>
                      写真を選ぶ
                    </Button>
                  </div>
                  {photos.length > 0 && (
                    <div className="photo-grid">
                      {photos.map((p, i) => (
                        <div className="photo-card" key={p.id}>
                          <div className="photo-frame">
                            <img
                              src={p.dataUrl}
                              alt={p.caption || `撮影写真 ${i + 1}`}
                            />
                            <span>{String(i + 1).padStart(2, "0")}</span>
                            <button
                              className="photo-remove"
                              aria-label={`写真${i + 1}を外す`}
                              onClick={() => removePhoto(p)}
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                          <input
                            aria-label={`写真${i + 1}の説明`}
                            placeholder="写真のひとこと（任意）"
                            defaultValue={p.caption}
                            onBlur={(e) => {
                              if (e.target.value !== p.caption) {
                                const caption = e.target.value,
                                  element = e.target;
                                const task = (
                                  photoWrite.current ?? Promise.resolve()
                                )
                                  .catch(() => {})
                                  .then(async () => {
                                    await command("caption", {
                                      reviewId: draft.id,
                                      id: p.id,
                                      caption,
                                    });
                                    setPhotos((old) =>
                                      old.map((v) =>
                                        v.id === p.id ? { ...v, caption } : v,
                                      ),
                                    );
                                  })
                                  .catch((e) => {
                                    element.value = p.caption;
                                    notify(e.message, true);
                                    throw e;
                                  })
                                  .finally(() => {
                                    if (photoWrite.current === task)
                                      photoWrite.current = null;
                                  });
                                photoWrite.current = task;
                                void task.catch(() => {});
                              }
                            }}
                          />
                        </div>
                      ))}
                    </div>
                  )}
                  <div className="photo-footnote">
                    <span>
                      公開用のコピーを長辺2,400pxまで縮小して保存。元の写真は変更しません。
                    </span>
                    <span>
                      {(
                        photos.reduce((s, p) => s + p.bytes, 0) /
                        1024 /
                        1024
                      ).toFixed(1)}{" "}
                      MB
                    </span>
                  </div>
                </section>
              </div>
              <aside className="capture-side">
                <section className="card world-card">
                  <div className="world-art">
                    <div className="orb orb-one" />
                    <div className="orb orb-two" />
                    <div className="map-grid" />
                    <Compass size={56} strokeWidth={1} />
                    <span>WORLD FIELD NOTES</span>
                  </div>
                  <div className="world-info">
                    <p className="eyebrow">WORLD INFORMATION</p>
                    <label>
                      ワールド名
                      <input
                        value={draft.world.name}
                        onChange={(e) =>
                          update((r) => ({
                            ...r,
                            world: {
                              ...r.world,
                              name: e.target.value,
                              source: "手入力・編集",
                            },
                          }))
                        }
                        placeholder="URLから取得すると表示されます"
                      />
                    </label>
                    <label>
                      作者
                      <input
                        value={draft.world.author}
                        onChange={(e) =>
                          update((r) => ({
                            ...r,
                            world: {
                              ...r.world,
                              author: e.target.value,
                              source: "手入力・編集",
                            },
                          }))
                        }
                        placeholder="未確認"
                      />
                    </label>
                    <div className="world-facts">
                      <div>
                        <span>対応環境</span>
                        <strong>
                          {draft.world.platforms.join(" / ") || "未確認"}
                        </strong>
                      </div>
                      <div>
                        <span>定員</span>
                        <strong>
                          {draft.world.capacity != null
                            ? `${draft.world.capacity}人`
                            : "未確認"}
                        </strong>
                      </div>
                    </div>
                    {draft.world.tags.length > 0 && (
                      <div className="tags">
                        {draft.world.tags.slice(0, 8).map((t) => (
                          <span key={t}>{t}</span>
                        ))}
                      </div>
                    )}
                    {draft.world.description && (
                      <details className="description">
                        <summary>作者の説明を見る</summary>
                        <p>{draft.world.description}</p>
                      </details>
                    )}
                    <p className="source-note">
                      {draft.world.source ||
                        "公開情報はURLの取得後に表示します。"}
                      <br />
                      体験メモとは分けて保存します。
                    </p>
                  </div>
                </section>
                <section className="quiet-card">
                  <Sparkles size={19} />
                  <h3>文章にするのは、あとで。</h3>
                  <p>
                    まずは覚えておきたい景色や音をメモ。写真と一緒にCodexに渡すと、記事の下書きにできます。
                  </p>
                  <span>AI APIの契約は不要です。</span>
                </section>
              </aside>
            </div>
          ) : (
            <div className="article-layout">
              <section className="card editor-card">
                <div className="section-heading">
                  <div className="section-icon">
                    <PencilLine size={18} />
                  </div>
                  <div>
                    <h2>あなたの言葉に整える</h2>
                    <p>
                      削ったり、書き足したり。確定した文章をそのまま投稿します。
                    </p>
                  </div>
                </div>
                <label className="title-label">
                  記事タイトル
                  <input
                    aria-label="記事タイトル"
                    className="article-title"
                    placeholder="この記事のタイトル"
                    value={draft.title}
                    onChange={(e) =>
                      update((r) => ({ ...r, title: e.target.value }))
                    }
                  />
                </label>
                <label className="body-label">
                  本文{" "}
                  <small>Markdown · 写真の位置は {"{{photo:…}}"} で指定</small>
                  <textarea
                    ref={bodyInput}
                    aria-label="記事本文"
                    value={draft.body}
                    onChange={(e) =>
                      update((r) => ({ ...r, body: e.target.value }))
                    }
                    placeholder="Codexが作ったarticle.mdを取り込むか、ここに記事を貼り付けてください。"
                  />
                </label>
                {photos.length > 0 && (
                  <div className="photo-inserts">
                    <span>写真を本文に挿入</span>
                    <div>
                      {photos.map((p, i) => (
                        <button
                          key={p.id}
                          title={p.caption || p.name}
                          onClick={() => insertPhoto(p)}
                        >
                          <img
                            src={p.dataUrl}
                            alt={p.caption || `写真${i + 1}`}
                          />
                          <Plus size={14} />
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                <label className="check-row">
                  <input
                    type="checkbox"
                    checked={draft.includeMetadata}
                    onChange={(e) =>
                      update((r) => ({
                        ...r,
                        includeMetadata: e.target.checked,
                      }))
                    }
                  />
                  基本情報を記事の先頭に付ける
                </label>
                <label>
                  カテゴリー
                  <input
                    aria-label="カテゴリー"
                    value={draft.categories.join(", ")}
                    onChange={(e) =>
                      update((r) => ({
                        ...r,
                        categories: e.target.value
                          .split(/[,、]/)
                          .map((v) => v.trim())
                          .filter(Boolean),
                      }))
                    }
                    placeholder="VRChat, ワールド紹介"
                  />
                </label>
                <div className="editor-bottom">
                  <span>{draft.body.length.toLocaleString()}文字</span>
                  {draft.publicUrl && (
                    <button
                      className="text-button"
                      onClick={() => external(draft.publicUrl)}
                    >
                      公開記事を開く
                      <ExternalLink size={13} />
                    </button>
                  )}
                </div>
              </section>
              <section className="card preview-card">
                <header>
                  <span>
                    <FileText size={15} />
                    記事のプレビュー
                  </span>
                  <small>ブログのテーマにより見た目は異なります</small>
                </header>
                <div className="article-paper">
                  <p className="paper-date">
                    {draft.visitedAt} <span>WORLD REVIEW</span>
                  </p>
                  <h1>{draft.title || "記事のタイトルがここに入ります"}</h1>
                  {draft.body ? (
                    <div
                      className="prose"
                      dangerouslySetInnerHTML={{
                        __html: previewHtml(draft, photos),
                      }}
                      onClick={(e) => {
                        const a = (e.target as HTMLElement).closest("a");
                        if (a) {
                          e.preventDefault();
                          external(a.href);
                        }
                      }}
                    />
                  ) : (
                    <div className="empty-article">
                      <FileText size={38} strokeWidth={1} />
                      <h3>ここから、ひとつの記事に。</h3>
                      <p>
                        メモと写真をCodexに渡して、
                        <br />
                        できあがった記事を取り込んでください。
                      </p>
                      <Button
                        icon={ArrowLeft}
                        variant="subtle"
                        onClick={() => setTab("notes")}
                      >
                        メモと写真に戻る
                      </Button>
                    </div>
                  )}
                </div>
              </section>
            </div>
          )}
        </fieldset>
        <footer className="page-footer">
          <span>
            <MapPin size={13} />
            あなたが訪れた場所を、あなたの言葉で。
          </span>
          <span>LOCAL FIRST · CODEX ASSISTED</span>
        </footer>
      </main>
      {toast && (
        <div
          className={`toast ${toast.error ? "error" : ""}`}
          role={toast.error ? "alert" : "status"}
        >
          {toast.error ? (
            <span className="toast-symbol">!</span>
          ) : (
            <Check size={18} />
          )}
          <p>{toast.text}</p>
          <button
            className="icon-button"
            aria-label="通知を閉じる"
            onClick={() => setToast(null)}
          >
            <X size={16} />
          </button>
        </div>
      )}
      {settingsOpen && (
        <SettingsModal
          settings={settings}
          workspace={workspace}
          busy={!!busy}
          run={run}
          onClose={() => {
            if (!busy) setSettingsOpen(false);
          }}
          onSaved={(s) => {
            setSettings(s);
            notify("設定を保存しました。");
          }}
          notify={notify}
        />
      )}
      {publishOpen && (
        <Modal
          title={draft.editUrl ? "記事を更新する" : "はてなブログに投稿"}
          onClose={() => {
            if (!busy) setPublishOpen(false);
          }}
        >
          <p className="modal-intro">
            添削した現在のタイトル・本文・写真を送信します。
          </p>
          <div className="publish-summary">
            <span>投稿先</span>
            <strong>{settings?.blogId || "未設定"}</strong>
            <span>タイトル</span>
            <strong>{draft.title || "未入力"}</strong>
            <span>本文</span>
            <strong>{draft.body.length.toLocaleString()}文字</strong>
            <span>使用する写真</span>
            <strong>
              {
                photos.filter((p) => draft.body.includes(`{{photo:${p.id}}}`))
                  .length
              }
              枚
            </strong>
          </div>
          <p className="fine-print">
            写真は送信時にはてなフォトライフへアップロードされます。文章はAIで再生成しません。
          </p>
          {(!settings?.hasBlogKey || !settings?.markdownConfirmed) && (
            <div className="inline-warning">
              設定でブログAPIキーとMarkdownの編集モードを確認してください。
            </div>
          )}
          <div className="modal-actions">
            <Button onClick={() => setPublishOpen(false)} disabled={!!busy}>
              戻る
            </Button>
            <Button
              icon={Save}
              onClick={() => publish(true)}
              disabled={
                !!busy || !settings?.hasBlogKey || !settings.markdownConfirmed
              }
            >
              はてな下書きに保存
            </Button>
            <Button
              icon={Send}
              variant="primary"
              onClick={() => publish(false)}
              disabled={
                !!busy || !settings?.hasBlogKey || !settings.markdownConfirmed
              }
            >
              {draft.editUrl ? "この内容で更新する" : "この内容で公開する"}
            </Button>
          </div>
        </Modal>
      )}
    </div>
  );
}
