export interface World {
  id: string;
  url: string;
  name: string;
  author: string;
  description: string;
  platforms: string[];
  capacity: number | null;
  tags: string[];
  fetchedAt: number;
  source: string;
}
export interface Notes {
  summary: string;
  scenery: string;
  sound: string;
  activities: string;
  highlights: string;
  concerns: string;
  recommended: string;
}
export interface ArticleMaterial {
  visitContext: string;
  focus: string;
  omit: string;
}
export const emptyArticleMaterial = (): ArticleMaterial => ({
  visitContext: "",
  focus: "",
  omit: "",
});
export interface Brief {
  what: string;
  who: string;
  how: string;
  why: string;
}
export interface Experience {
  scene: string;
  action: string;
  result: string;
}
export const emptyExperience = (): Experience => ({
  scene: "",
  action: "",
  result: "",
});
export interface Sharing {
  opening: string;
  tweet: string;
  hashtag: string;
  includeOpening: boolean;
}
export const emptyBrief = (): Brief => ({
  what: "",
  who: "",
  how: "",
  why: "",
});
export const emptySharing = (): Sharing => ({
  opening: "",
  tweet: "",
  hashtag: "VRChat",
  includeOpening: true,
});
export interface Review {
  kind?: "world-review" | "article";
  schemaVersion: 1;
  id: string;
  revision: number;
  world: World;
  visitedAt: string;
  environment: string;
  notes: Notes;
  brief?: Brief;
  experience?: Experience;
  articleMaterial?: ArticleMaterial;
  sharing?: Sharing;
  title: string;
  body: string;
  categories: string[];
  includeMetadata: boolean;
  status: string;
  editUrl: string;
  publicUrl: string;
  previewUrl: string;
  targetBlog: string;
  updatedAt: number;
}
export interface Photo {
  id: string;
  reviewId: string;
  name: string;
  caption: string;
  mime: string;
  dataUrl: string;
  position: number;
  bytes: number;
}
export interface Summary {
  id: string;
  title: string;
  worldName: string;
  visitedAt: string;
  status: string;
  updatedAt: number;
  photoCount: number;
}
export interface Settings {
  hatenaId: string;
  blogId: string;
  hasBlogKey: boolean;
  hasPhotoKey: boolean;
  markdownConfirmed: boolean;
  apiContact: string;
  vrchatSaved: boolean;
}
export interface Boot {
  settings: Settings;
  workspace: string;
  reviews: Summary[];
  version: string;
}
export function newReview(): Review {
  const date = new Date();
  const visitedAt = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  return {
    kind: "world-review",
    schemaVersion: 1,
    id: crypto.randomUUID(),
    revision: 0,
    world: {
      id: "",
      url: "",
      name: "",
      author: "",
      description: "",
      platforms: [],
      capacity: null,
      tags: [],
      fetchedAt: 0,
      source: "",
    },
    visitedAt,
    environment: "PC VR",
    notes: {
      summary: "",
      scenery: "",
      sound: "",
      activities: "",
      highlights: "",
      concerns: "",
      recommended: "",
    },
    brief: emptyBrief(),
    experience: emptyExperience(),
    articleMaterial: emptyArticleMaterial(),
    sharing: emptySharing(),
    title: "",
    body: "",
    categories: ["VRChat", "ワールド紹介"],
    includeMetadata: true,
    status: "draft",
    editUrl: "",
    publicUrl: "",
    previewUrl: "",
    targetBlog: "",
    updatedAt: 0,
  };
}
export function editKey(r: Review): string {
  return JSON.stringify([
    r.id,
    r.kind,
    r.world,
    r.visitedAt,
    r.environment,
    r.notes,
    r.brief,
    r.experience,
    r.articleMaterial,
    r.sharing,
    r.title,
    r.body,
    r.categories,
    r.includeMetadata,
  ]);
}
export const statusLabel = (s: string) =>
  ({
    draft: "下書き",
    published: "公開済み",
    "remote-draft": "はてな下書き",
    publishing: "投稿結果の確認待ち",
    "publish-unknown": "投稿結果の確認待ち",
  })[s] ?? s;
