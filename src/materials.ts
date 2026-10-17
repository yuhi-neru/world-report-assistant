import type { Review, MaterialAnalysis } from "./types";
export function materialSources(r: Review) {
  const api = {
    id: "api",
    title: r.world.name || "ワールドAPI",
    kind: "author",
    url: /^wrld_[0-9a-f-]{36}$/.test(r.world.id)
      ? `https://vrchat.com/home/world/${r.world.id}`
      : "",
    text: [r.world.name, r.world.description, r.world.tags.join(" ")].join(
      "\n",
    ),
  };
  return [...(api.text.trim() ? [api] : []), ...(r.sourceDocuments ?? [])];
}
export function materialInput(r: Review): string {
  return JSON.stringify(
    materialSources(r).map((s) => [s.id, s.title, s.kind, s.url, s.text]),
  );
}
export async function materialHash(input: string): Promise<string> {
  const hash = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(input),
  );
  return [...new Uint8Array(hash)]
    .map((v) => v.toString(16).padStart(2, "0"))
    .join("");
}
export function extractMaterials(
  r: Review,
): Omit<MaterialAnalysis, "sourceHash"> {
  const sources = materialSources(r);
  const stop = new Set(
    "ある いる する なる できる です ます こと もの ため これ それ ここ そこ よう など から まで でも また そして とても 楽しめる 楽しむ ワールド world the and with for this that you your are VRChat"
      .toLowerCase()
      .split(" "),
  );
  const frequencies = new Map<string, { text: string; count: number }>();
  const Segmenter = (
    Intl as unknown as {
      Segmenter?: new (
        locale: string,
        options: { granularity: string },
      ) => {
        segment: (
          text: string,
        ) => Iterable<{ segment: string; isWordLike?: boolean }>;
      };
    }
  ).Segmenter;
  const segmenter = Segmenter
    ? new Segmenter("ja", { granularity: "word" })
    : null;
  for (const source of sources) {
    const clean = source.text.replace(/https?:\/\/\S+/g, " ");
    const terms = segmenter
      ? [...segmenter.segment(clean)]
          .filter((v) => v.isWordLike)
          .map((v) => v.segment)
      : (clean.match(/[\p{L}][\p{L}\p{N}_-]{1,23}/gu) ?? []);
    for (const term of terms) {
      const key = term.toLowerCase();
      if (
        term.length < 2 ||
        term.length > 24 ||
        stop.has(key) ||
        /^\d+$/.test(term)
      )
        continue;
      const previous = frequencies.get(key);
      frequencies.set(key, {
        text: previous?.text ?? term,
        count: (previous?.count ?? 0) + 1,
      });
    }
  }
  const keywords = [...frequencies.values()]
    .sort((a, b) => b.count - a.count)
    .slice(0, 30)
    .map((v) => v.text);
  // Candidate elements are literal excerpts, not inferred facts or value judgments.
  const elements = sources
    .flatMap((source) => {
      const seen = new Set<string>();
      return source.text
        .split(/(?<=[。！？])|\n+/u)
        .map((line) => line.trim())
        .filter((line) => {
          if (line.length < 6 || /^https?:\/\//.test(line) || seen.has(line))
            return false;
          seen.add(line);
          return true;
        })
        .slice(
          0,
          Math.max(
            1,
            Math.min(8, Math.floor(40 / Math.max(1, sources.length))),
          ),
        )
        .map((quote) => ({
          sourceId: source.id,
          quote: [...quote].slice(0, 600).join(""),
          included: true,
        }));
    })
    .slice(0, 40);
  return { keywords, elements };
}
export function currentElements(r: Review): string[] {
  const sources = materialSources(r);
  return (r.materialAnalysis?.elements ?? [])
    .filter(
      (e) =>
        e.included &&
        sources.some((s) => s.id === e.sourceId && s.text.includes(e.quote)),
    )
    .map((e) => e.quote);
}
