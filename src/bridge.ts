import { invoke, isTauri } from "@tauri-apps/api/core";
export const native = isTauri();
export async function command<T>(
  action: string,
  payload: Record<string, unknown> = {},
): Promise<T> {
  if (!native)
    throw new Error("この機能はインストールしたWindowsアプリで利用できます。");
  try {
    return await invoke<T>("command", { action, payload });
  } catch (e) {
    throw new Error(typeof e === "string" ? e : String(e));
  }
}
export async function imageForArticle(file: File): Promise<string> {
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type))
    throw new Error("JPEG・PNG・WebPの写真を選んでください。");
  if (file.size > 50 * 1024 * 1024)
    throw new Error("元の写真は50MB以下にしてください。");
  const image = await createImageBitmap(file);
  try {
    const scale = Math.min(1, 2400 / Math.max(image.width, image.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(image.width * scale));
    canvas.height = Math.max(1, Math.round(image.height * scale));
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("写真を読み込めませんでした。");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", 0.9);
  } finally {
    image.close();
  }
}
