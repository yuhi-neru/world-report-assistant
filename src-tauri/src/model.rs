use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::time::{SystemTime, UNIX_EPOCH};

pub type AppResult<T> = Result<T, String>;
pub fn now() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs() as i64
}
pub fn hash(input: &[u8]) -> String {
    format!("{:x}", Sha256::digest(input))
}
pub fn valid_id(id: &str) -> bool {
    uuid::Uuid::parse_str(id).is_ok_and(|v| v.to_string() == id)
}
pub fn world_id(input: &str) -> AppResult<String> {
    let input = input.trim();
    let candidate = if input.starts_with("wrld_") && input.len() == 41 {
        input.to_owned()
    } else {
        let u = reqwest::Url::parse(input).map_err(|_| "VRChatのワールドURLを入力してください")?;
        if u.scheme() != "https"
            || !matches!(u.host_str(), Some("vrchat.com" | "www.vrchat.com"))
            || !u.username().is_empty()
            || u.password().is_some()
            || u.port_or_known_default() != Some(443)
        {
            return Err("https://vrchat.com/ で始まるワールドURLを入力してください".into());
        }
        u.query_pairs()
            .find(|(k, _)| k == "worldId")
            .map(|(_, v)| v.into_owned())
            .or_else(|| {
                u.path_segments()?
                    .find(|p| p.starts_with("wrld_"))
                    .map(str::to_owned)
            })
            .ok_or("URLにワールドIDが含まれていません")?
    };
    let tail = candidate
        .strip_prefix("wrld_")
        .ok_or("ワールドIDの形式を確認してください")?;
    if !valid_id(tail) {
        return Err("ワールドIDの形式を確認してください".into());
    }
    Ok(candidate)
}

#[derive(Clone, Default, Serialize, Deserialize, Debug)]
#[serde(rename_all = "camelCase", default)]
pub struct World {
    pub id: String,
    pub url: String,
    pub name: String,
    pub author: String,
    pub description: String,
    pub platforms: Vec<String>,
    pub capacity: Option<u64>,
    pub tags: Vec<String>,
    pub fetched_at: i64,
    pub source: String,
}
pub fn platform_line(platforms: &[String]) -> String {
    let has = |name: &str| {
        platforms
            .iter()
            .any(|p| p.trim().eq_ignore_ascii_case(name))
    };
    let android = has("Android / Quest") || has("android");
    let mut labels = Vec::new();
    if has("PC") || has("standalonewindows") {
        labels.push("PC");
    }
    if android {
        labels.extend(["Quest単機", "スマホ(Android)"]);
    }
    if has("iOS") {
        labels.push("スマホ(iOS)");
    }
    if labels.is_empty() {
        String::new()
    } else {
        format!("対応：{}", labels.join(" / "))
    }
}
#[derive(Clone, Default, Serialize, Deserialize, Debug)]
#[serde(rename_all = "camelCase", default)]
pub struct Notes {
    pub summary: String,
    pub scenery: String,
    pub sound: String,
    pub activities: String,
    pub highlights: String,
    pub concerns: String,
    pub recommended: String,
}
#[derive(Clone, Default, Serialize, Deserialize, Debug)]
#[serde(rename_all = "camelCase", default)]
pub struct ArticleMaterial {
    pub visit_context: String,
    pub focus: String,
    pub omit: String,
}
#[derive(Clone, Default, Serialize, Deserialize, Debug)]
#[serde(rename_all = "camelCase", default)]
pub struct Brief {
    pub what: String,
    pub who: String,
    pub how: String,
    pub why: String,
}
#[derive(Clone, Default, Serialize, Deserialize, Debug)]
#[serde(rename_all = "camelCase", default)]
pub struct Experience {
    pub scene: String,
    pub action: String,
    pub result: String,
}
#[derive(Clone, Default, Serialize, Deserialize, Debug)]
#[serde(rename_all = "camelCase", default)]
pub struct SourceDocument {
    pub id: String,
    pub title: String,
    pub url: String,
    pub kind: String,
    pub text: String,
}
#[derive(Clone, Serialize, Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct MaterialElement {
    pub source_id: String,
    pub quote: String,
    pub included: bool,
}
#[derive(Clone, Serialize, Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct MaterialAnalysis {
    pub source_hash: String,
    pub keywords: Vec<String>,
    pub elements: Vec<MaterialElement>,
}
pub fn material_sources(r: &Review) -> Vec<SourceDocument> {
    let mut sources = vec![SourceDocument {
        id: "api".into(),
        title: if r.world.name.is_empty() {
            "ワールドAPI".into()
        } else {
            r.world.name.clone()
        },
        kind: "author".into(),
        url: if r.world.id.is_empty() {
            String::new()
        } else {
            format!("https://vrchat.com/home/world/{}", r.world.id)
        },
        text: format!(
            "{}\n{}\n{}",
            r.world.name,
            r.world.description,
            r.world.tags.join(" ")
        ),
    }];
    sources.retain(|s| !s.text.trim().is_empty());
    sources.extend(r.source_documents.clone());
    sources
}
pub fn material_source_hash(r: &Review) -> String {
    let values = material_sources(r)
        .into_iter()
        .map(|s| serde_json::json!([s.id, s.title, s.kind, s.url, s.text]))
        .collect::<Vec<_>>();
    hash(serde_json::to_string(&values).unwrap().as_bytes())
}
pub fn material_analysis_current(r: &Review) -> bool {
    r.material_analysis
        .as_ref()
        .is_some_and(|a| a.source_hash == material_source_hash(r))
}
pub const TWEET_TAGS: &str = "#VRchat #VRChatワールド紹介";
pub fn tweet_footer(world: &World) -> String {
    format!(
        "World：{}\nhttps://vrchat.com/home/world/{}\n{}",
        world.name.split_whitespace().collect::<Vec<_>>().join(" "),
        world.id,
        TWEET_TAGS
    )
}
#[derive(Clone, Serialize, Deserialize, Debug)]
#[serde(rename_all = "camelCase", default)]
pub struct Sharing {
    pub opening: String,
    pub tweet: String,
    pub hashtag: String,
    pub include_opening: bool,
}
impl Default for Sharing {
    fn default() -> Self {
        Self {
            opening: String::new(),
            tweet: String::new(),
            hashtag: "VRChat".into(),
            include_opening: true,
        }
    }
}
#[derive(Clone, Serialize, Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Review {
    #[serde(default = "review_kind")]
    pub kind: String,
    pub schema_version: u32,
    pub id: String,
    pub revision: i64,
    pub world: World,
    pub visited_at: String,
    pub environment: String,
    pub notes: Notes,
    #[serde(default)]
    pub brief: Brief,
    #[serde(default)]
    pub experience: Experience,
    #[serde(default)]
    pub article_material: ArticleMaterial,
    #[serde(default)]
    pub source_documents: Vec<SourceDocument>,
    #[serde(default)]
    pub material_analysis: Option<MaterialAnalysis>,
    #[serde(default)]
    pub sharing: Sharing,
    pub title: String,
    pub body: String,
    pub categories: Vec<String>,
    pub include_metadata: bool,
    pub status: String,
    pub edit_url: String,
    pub public_url: String,
    pub preview_url: String,
    pub target_blog: String,
    pub updated_at: i64,
}
fn review_kind() -> String {
    "world-review".into()
}
impl Review {
    pub fn validate(&self) -> AppResult<()> {
        if self.schema_version != 1
            || !valid_id(&self.id)
            || self.revision < 0
            || self.revision >= i64::MAX - 1
        {
            return Err("レポートの形式が不正です".into());
        }
        if !matches!(self.kind.as_str(), "world-review" | "article")
            || (self.kind == "article" && (self.include_metadata || !self.world.id.is_empty()))
        {
            return Err("記事種別とワールド情報が一致しません".into());
        }
        if !self.world.id.is_empty() && world_id(&self.world.id)? != self.world.id {
            return Err("ワールドIDが不正です".into());
        }
        if self.sharing.opening.contains("{{photo:") {
            return Err("写真は冒頭文ではなく記事本文に挿入してください".into());
        }
        if self.world.name.len() > 1000
            || self.world.author.len() > 1000
            || self.world.description.len() > 32000
            || self.title.len() > 1000
            || self.body.len() > 200_000
            || serde_json::to_vec(&self.notes)
                .map_err(|e| e.to_string())?
                .len()
                > 100_000
            || serde_json::to_vec(&self.brief)
                .map_err(|e| e.to_string())?
                .len()
                > 32_000
            || serde_json::to_vec(&self.experience)
                .map_err(|e| e.to_string())?
                .len()
                > 32_000
            || serde_json::to_vec(&self.article_material)
                .map_err(|e| e.to_string())?
                .len()
                > 24_000
            || self.sharing.opening.len() > 16_000
            || self.sharing.tweet.len() > 10_000
            || self.sharing.hashtag.chars().count() > 60
            || self.categories.len() > 20
            || self.categories.iter().any(|s| s.len() > 100)
        {
            return Err("入力内容が大きすぎます".into());
        }
        if self.source_documents.len() > 10
            || serde_json::to_vec(&self.source_documents).unwrap().len() > 500_000
        {
            return Err("追加資料は10件・合計500KB以内にしてください".into());
        }
        let mut ids = std::collections::HashSet::new();
        for source in &self.source_documents {
            if !valid_id(&source.id)
                || !ids.insert(&source.id)
                || !matches!(source.kind.as_str(), "experience" | "author" | "reference")
                || source.title.chars().count() > 200
                || source.url.chars().count() > 2000
                || source.text.len() > 48_000
            {
                return Err("追加資料の形式かサイズを確認してください".into());
            }
        }
        if let Some(analysis) = &self.material_analysis {
            if analysis.source_hash.len() != 64
                || !analysis.source_hash.bytes().all(|b| b.is_ascii_hexdigit())
                || analysis.keywords.len() > 30
                || analysis.keywords.iter().any(|s| s.chars().count() > 48)
                || analysis.elements.len() > 40
                || analysis
                    .elements
                    .iter()
                    .any(|s| s.quote.is_empty() || s.quote.chars().count() > 600)
                || serde_json::to_vec(analysis).unwrap().len() > 120_000
            {
                return Err("抽出候補の形式かサイズを確認してください".into());
            }
            if material_analysis_current(self) {
                let sources = material_sources(self);
                if analysis.elements.iter().any(|e| {
                    !sources
                        .iter()
                        .any(|s| s.id == e.source_id && s.text.contains(&e.quote))
                }) || analysis
                    .keywords
                    .iter()
                    .any(|word| word.is_empty() || !sources.iter().any(|s| s.text.contains(word)))
                {
                    return Err("抽出候補が原文と一致しません。資料から再抽出してください".into());
                }
            }
        }
        if self.visited_at.len() != 10
            || !self.visited_at.bytes().enumerate().all(|(i, b)| {
                if i == 4 || i == 7 {
                    b == b'-'
                } else {
                    b.is_ascii_digit()
                }
            })
        {
            return Err("訪問日を入力してください".into());
        }
        Ok(())
    }
}
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Photo {
    pub id: String,
    pub review_id: String,
    pub name: String,
    pub caption: String,
    pub mime: String,
    pub data_url: String,
    pub position: i64,
    pub bytes: usize,
}
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Summary {
    pub id: String,
    pub title: String,
    pub world_name: String,
    pub visited_at: String,
    pub status: String,
    pub updated_at: i64,
    pub photo_count: i64,
}

pub fn md_escape(s: &str) -> String {
    s.chars()
        .flat_map(|c| {
            if "\\`*_{}[]<>()#+-.!|".contains(c) {
                vec!['\\', c]
            } else {
                vec![c]
            }
        })
        .collect::<String>()
        .replace('\n', " ")
        .replace('\r', " ")
}
pub fn article_source(r: &Review, photos: &[Photo], remote: bool) -> AppResult<String> {
    let mut text = String::new();
    if r.sharing.include_opening && !r.sharing.opening.trim().is_empty() {
        text.push_str(r.sharing.opening.trim());
        text.push_str("\n\n");
    }
    if r.include_metadata {
        text.push_str(&format!("## ワールドの基本情報\n\n- ワールド：{}\n- 作者：{}\n- ワールドURL：https://vrchat.com/home/world/{}\n- 訪問日：{}\n- 訪問環境：{}\n- 対応環境：{}\n\n",md_escape(&r.world.name),if r.world.author.is_empty(){"未確認".into()}else{md_escape(&r.world.author)},r.world.id,r.visited_at,md_escape(&r.environment),if r.world.platforms.is_empty(){"未確認".into()}else{r.world.platforms.iter().map(|s|md_escape(s)).collect::<Vec<_>>().join(" / ")}));
    }
    text.push_str(&r.body);
    for p in photos {
        let marker = format!("{{{{photo:{}}}}}", p.id);
        if text.contains(&marker) {
            if remote {
                return Err("写真の公開URLがまだ設定されていません".into());
            }
            text = text.replace(
                &marker,
                &format!("![{}]({})", md_escape(&p.caption), p.data_url),
            );
        }
    }
    if text.contains("{{photo:") {
        return Err("記事内に参照できない写真があります。写真を再挿入してください".into());
    }
    Ok(text)
}
