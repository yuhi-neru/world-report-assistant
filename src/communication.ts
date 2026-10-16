import twitterText from "twitter-text";
const { extractHashtags, extractUrls, parseTweet } = twitterText;
import { emptyBrief, emptySharing, type Review } from "./types";

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
export function hashtagValue(value: string): string {
  return value.trim().replace(/^[#＃]/, "");
}
export function validHashtag(value: string): boolean {
  const tag = hashtagValue(value);
  const tags = extractHashtags(`#${tag}`);
  return !!tag && tag.length <= 60 && tags.length === 1 && tags[0] === tag;
}
const sentence = (text: string) => text.trim().replace(/[。.!！?？\s]+$/, "");
export function draftCopy(r: Review): { opening: string; tweet: string } {
  const brief = r.brief ?? emptyBrief();
  const what = sentence(brief.what || r.notes.summary);
  const who = sentence(brief.who || r.notes.recommended);
  const how = sentence(brief.how || r.notes.activities);
  const why = sentence(brief.why || r.notes.highlights);
  const name = r.world.name.trim();
  const parts = [
    what && `${name ? `「${name}」は、` : ""}${what}。`,
    who && `${who}におすすめです。`,
    how && `${how}。`,
    why && `${why}。`,
  ].filter(Boolean);
  return {
    opening: parts.join(""),
    tweet: [name && `「${name}」`, what, who && `${who}におすすめ。`, how, why]
      .filter(Boolean)
      .join("\n"),
  };
}
export function tweetTemplate(r: Review): string {
  const tag = hashtagValue((r.sharing ?? emptySharing()).hashtag);
  return `「${r.world.name || "【ワールド名】"}」\n【What：テーマ・世界観】\n【Who：楽しめる人】におすすめ。\n【How：体験・遊び方】\n【Why：魅力・特徴】\n\n${platformLine(r) ? platformLine(r) + "\n" : ""}${worldUrl(r)}\n#${tag}`;
}
export function tweetResult(r: Review): {
  text: string;
  length: number;
  issues: string[];
} {
  const sharing = r.sharing ?? emptySharing();
  const body = sharing.tweet.trim();
  const url = worldUrl(r);
  const tag = hashtagValue(sharing.hashtag);
  const text = [body, platformLine(r), url, tag && `#${tag}`]
    .filter(Boolean)
    .join("\n\n");
  const parsed = parseTweet(text);
  const issues: string[] = [];
  if (!body) issues.push("ツイート本文を入力してください。");
  if (!url) issues.push("ワールドURLを取得してください。");
  if (!validHashtag(tag))
    issues.push("ハッシュタグを1つ入力してください（空白・複数指定は不可）。");
  if (extractHashtags(body).length || extractUrls(body).length)
    issues.push(
      "本文内のURL・ハッシュタグを外してください。末尾に自動で付きます。",
    );
  if (parsed.weightedLength > 280)
    issues.push("通常の投稿上限を超えています。本文を短くしてください。");
  else if (!parsed.valid && body)
    issues.push("投稿に使えない文字がないか確認してください。");
  return { text, length: parsed.weightedLength, issues };
}
