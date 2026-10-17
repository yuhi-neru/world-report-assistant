import { currentElements } from "./materials";
import twitterText from "twitter-text";
const { extractHashtags, extractUrls, parseTweet } = twitterText;
import { emptyExperience, emptySharing, type Review } from "./types";

export function worldUrl(r: Review): string {
  return /^wrld_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(
    r.world.id,
  )
    ? `https://vrchat.com/home/world/${r.world.id}`
    : "";
}
export function platformLine(r: Review): string {
  const platforms = new Set(
    r.world.platforms.map((p) => p.trim().toLowerCase()),
  );
  const pc = platforms.has("pc") || platforms.has("standalonewindows");
  const android = platforms.has("android / quest") || platforms.has("android");
  const ios = platforms.has("ios");
  const labels = [
    pc && "PC",
    android && "Quest単機",
    android && "スマホ(Android)",
    ios && "スマホ(iOS)",
  ].filter(Boolean);
  return labels.length ? `対応：${labels.join(" / ")}` : "";
}
export const TWEET_HASHTAGS = "#VRchat #VRChatワールド紹介";
export function tweetFooter(r: Review): string {
  const name = r.world.name.trim().replace(/\s+/g, " ");
  return `World：${name || "【ワールド名】"}\n${worldUrl(r)}\n${TWEET_HASHTAGS}`;
}
const sentence = (text: string) =>
  text
    .trim()
    .replace(/\s*\n\s*/g, " ")
    .replace(/[。.!！?？\s]+$/, "");
export function draftCopy(r: Review): { opening: string; tweet: string } {
  const experience = r.experience ?? emptyExperience();
  const excerpts = currentElements(r).slice(0, 3);
  const lines = excerpts.length
    ? excerpts
    : [experience.scene, experience.action, experience.result]
        .map(sentence)
        .filter(Boolean)
        .map((text) => `${text}。`);
  return { opening: lines.join(""), tweet: lines.join("\n") };
}
export function tweetTemplate(r: Review): string {
  return [
    "【資料から拾った、その場所ならではの特徴】。\n【そこで体験できることを具体的に】。",
    platformLine(r),
    tweetFooter(r),
  ]
    .filter(Boolean)
    .join("\n\n");
}
export function tweetResult(r: Review): {
  text: string;
  length: number;
  issues: string[];
} {
  const sharing = r.sharing ?? emptySharing();
  const body = sharing.tweet.trim();
  const url = worldUrl(r);
  const text = [body, platformLine(r), tweetFooter(r)]
    .filter(Boolean)
    .join("\n\n");
  const parsed = parseTweet(text);
  const issues: string[] = [];
  if (!body) issues.push("ツイート本文を入力してください。");
  if (!url) issues.push("ワールドURLを取得してください。");
  if (!r.world.name.trim()) issues.push("ワールド名を入力してください。");
  if (extractHashtags(body).length || extractUrls(body).length)
    issues.push(
      "本文内のURL・ハッシュタグを外してください。ワールド名・URL・指定の2タグは末尾に自動で付きます。",
    );
  if (
    extractHashtags(text).length !== 2 ||
    extractUrls(text).length !== (url ? 1 : 0)
  )
    issues.push(
      "ワールド名に余分なURL・ハッシュタグがないか確認してください。",
    );
  if (parsed.weightedLength > 280)
    issues.push("通常の投稿上限を超えています。本文を短くしてください。");
  else if (!parsed.valid && body)
    issues.push("投稿に使えない文字がないか確認してください。");
  return { text, length: parsed.weightedLength, issues };
}
