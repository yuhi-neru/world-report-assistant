import DOMPurify from "dompurify";
import { marked } from "marked";
import type { Photo, Review } from "./types";
export const escapeMd = (s: string) =>
  s.replace(/[\\`*_{}\[\]<>()#+\-.!|]/g, "\\$&").replace(/[\r\n]/g, " ");
export function articleSource(r: Review, photos: Photo[]): string {
  const metadata = r.includeMetadata
    ? `## ワールドの基本情報\n\n- ワールド：${escapeMd(r.world.name)}\n- 作者：${escapeMd(r.world.author || "未確認")}\n- ワールドURL：https://vrchat.com/home/world/${r.world.id}\n- 訪問日：${r.visitedAt}\n- 訪問環境：${escapeMd(r.environment)}\n- 対応環境：${r.world.platforms.map(escapeMd).join(" / ") || "未確認"}\n\n`
    : "";
  const opening =
    r.sharing?.includeOpening && r.sharing.opening.trim()
      ? `${r.sharing.opening.trim()}\n\n`
      : "";
  let source = opening + metadata + r.body;
  for (const photo of photos)
    source = source.replaceAll(
      `{{photo:${photo.id}}}`,
      `![${escapeMd(photo.caption)}](${photo.dataUrl})`,
    );
  return source;
}
export function previewHtml(r: Review, photos: Photo[]): string {
  return DOMPurify.sanitize(
    marked.parse(articleSource(r, photos), { async: false }) as string,
    {
      FORBID_TAGS: [
        "style",
        "iframe",
        "form",
        "input",
        "button",
        "video",
        "audio",
        "object",
      ],
      FORBID_ATTR: ["style"],
      ADD_ATTR: ["target", "rel"],
    },
  );
}
