use crate::model::*;
use base64::{engine::general_purpose::STANDARD, Engine};
use rusqlite::{params, Connection, OptionalExtension};
use std::path::Path;

pub fn open(root: &Path) -> AppResult<Connection> {
    std::fs::create_dir_all(root.join("data")).map_err(|e| e.to_string())?;
    let db = Connection::open(root.join("data/reviews.sqlite3")).map_err(|e| e.to_string())?;
    db.busy_timeout(std::time::Duration::from_secs(5))
        .map_err(|e| e.to_string())?;
    db.execute_batch("PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;
    CREATE TABLE IF NOT EXISTS worlds(id TEXT PRIMARY KEY,name TEXT NOT NULL,author TEXT NOT NULL,data TEXT NOT NULL,updated_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS reviews(id TEXT PRIMARY KEY,world_id TEXT,title TEXT NOT NULL,body TEXT NOT NULL,visited_at TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'draft',revision INTEGER NOT NULL,data TEXT NOT NULL,updated_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS photos(id TEXT PRIMARY KEY,review_id TEXT NOT NULL REFERENCES reviews(id),name TEXT NOT NULL,caption TEXT NOT NULL,mime TEXT NOT NULL,bytes BLOB NOT NULL,position INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS photo_uploads(photo_id TEXT NOT NULL REFERENCES photos(id),owner TEXT NOT NULL,url TEXT NOT NULL,PRIMARY KEY(photo_id,owner));
    CREATE TABLE IF NOT EXISTS history(id INTEGER PRIMARY KEY,review_id TEXT NOT NULL,revision INTEGER NOT NULL,data TEXT NOT NULL,reason TEXT NOT NULL,created_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS publications(id INTEGER PRIMARY KEY,review_id TEXT NOT NULL,revision INTEGER NOT NULL,target TEXT NOT NULL,phase TEXT NOT NULL,payload TEXT NOT NULL,created_at INTEGER NOT NULL);
    CREATE INDEX IF NOT EXISTS reviews_updated ON reviews(updated_at DESC);
    CREATE INDEX IF NOT EXISTS photos_review ON photos(review_id,position);
    PRAGMA user_version=1;").map_err(|e|e.to_string())?;
    Ok(db)
}
pub fn get(db: &Connection, id: &str) -> AppResult<Review> {
    let raw: String = db
        .query_row("SELECT data FROM reviews WHERE id=?", [id], |r| r.get(0))
        .map_err(|_| "レポートが見つかりません")?;
    serde_json::from_str(&raw).map_err(|e| e.to_string())
}
pub fn save(db: &mut Connection, mut r: Review, reason: &str) -> AppResult<Review> {
    r.validate()?;
    let tx = db.transaction().map_err(|e| e.to_string())?;
    let prev: Option<String> = tx
        .query_row("SELECT data FROM reviews WHERE id=?", [&r.id], |r| r.get(0))
        .optional()
        .map_err(|e| e.to_string())?;
    if let Some(raw) = prev {
        let prev: Review = serde_json::from_str(&raw).map_err(|e| e.to_string())?;
        if prev.kind != r.kind {
            return Err("保存済みの記事種別は変更できません".into());
        }
        if prev.revision != r.revision {
            return Err("別の操作で更新されています。記録を開き直してください".into());
        }
        if matches!(prev.status.as_str(), "publishing" | "publish-unknown") {
            return Err(
                "投稿結果の確認が必要です。先に『投稿結果を確認』を実行してください".into(),
            );
        }
        r.status = prev.status;
        r.edit_url = prev.edit_url;
        r.public_url = prev.public_url;
        r.preview_url = prev.preview_url;
        r.target_blog = prev.target_blog;
    } else {
        r.status = "draft".into();
        r.edit_url.clear();
        r.public_url.clear();
        r.preview_url.clear();
        r.target_blog.clear();
    }
    r.revision += 1;
    r.updated_at = now();
    let data = serde_json::to_string(&r).map_err(|e| e.to_string())?;
    if !r.world.id.is_empty() {
        tx.execute("INSERT INTO worlds VALUES(?1,?2,?3,?4,?5) ON CONFLICT(id) DO UPDATE SET name=excluded.name,author=excluded.author,data=excluded.data,updated_at=excluded.updated_at",params![r.world.id,r.world.name,r.world.author,serde_json::to_string(&r.world).unwrap(),r.world.fetched_at]).map_err(|e|e.to_string())?;
    }
    tx.execute("INSERT INTO reviews VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9) ON CONFLICT(id) DO UPDATE SET world_id=excluded.world_id,title=excluded.title,body=excluded.body,visited_at=excluded.visited_at,status=excluded.status,revision=excluded.revision,data=excluded.data,updated_at=excluded.updated_at",params![r.id,r.world.id,r.title,r.body,r.visited_at,r.status,r.revision,data,r.updated_at]).map_err(|e|e.to_string())?;
    tx.execute(
        "INSERT INTO history(review_id,revision,data,reason,created_at) VALUES(?,?,?,?,?)",
        params![r.id, r.revision, data, reason, now()],
    )
    .map_err(|e| e.to_string())?;
    tx.commit().map_err(|e| e.to_string())?;
    Ok(r)
}
pub fn state(db: &Connection, r: &Review) -> AppResult<()> {
    db.execute(
        "UPDATE reviews SET status=?,data=? WHERE id=?",
        params![r.status, serde_json::to_string(r).unwrap(), r.id],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}
pub fn list(db: &Connection, query: &str) -> AppResult<Vec<Summary>> {
    let mut s=db.prepare("SELECT r.id,r.title,json_extract(r.data,'$.world.name'),r.visited_at,r.status,r.updated_at,(SELECT count(*) FROM photos p WHERE p.review_id=r.id) FROM reviews r WHERE ?1='' OR instr(lower(r.title||' '||r.body||' '||r.data),lower(?1))>0 ORDER BY r.updated_at DESC,r.rowid DESC LIMIT 300").map_err(|e|e.to_string())?;
    let rows = s
        .query_map([query], |r| {
            Ok(Summary {
                id: r.get(0)?,
                title: r.get(1)?,
                world_name: r.get(2)?,
                visited_at: r.get(3)?,
                status: r.get(4)?,
                updated_at: r.get(5)?,
                photo_count: r.get(6)?,
            })
        })
        .map_err(|e| e.to_string())?;
    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())
}
pub fn photos(db: &Connection, id: &str) -> AppResult<Vec<Photo>> {
    let mut s=db.prepare("SELECT id,name,caption,mime,bytes,position FROM photos WHERE review_id=? ORDER BY position,rowid").map_err(|e|e.to_string())?;
    let rows = s
        .query_map([id], |r| {
            let data: Vec<u8> = r.get(4)?;
            let mime: String = r.get(3)?;
            Ok(Photo {
                id: r.get(0)?,
                review_id: id.into(),
                name: r.get(1)?,
                caption: r.get(2)?,
                data_url: format!("data:{mime};base64,{}", STANDARD.encode(&data)),
                mime,
                position: r.get(5)?,
                bytes: data.len(),
            })
        })
        .map_err(|e| e.to_string())?;
    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())
}
pub fn add_photo(db: &Connection, id: &str, name: &str, data_url: &str) -> AppResult<Photo> {
    let r = get(db, id)?;
    if matches!(r.status.as_str(), "publishing" | "publish-unknown") {
        return Err("投稿結果を確認してから写真を変更してください".into());
    }
    let current = photos(db, id)?;
    if current.len() >= 20 {
        return Err("写真は1記事20枚までです".into());
    }
    let (head, encoded) = data_url.split_once(",").ok_or("写真の形式が不正です")?;
    let mime = match head {
        "data:image/jpeg;base64" => "image/jpeg",
        "data:image/png;base64" => "image/png",
        "data:image/webp;base64" => "image/webp",
        _ => return Err("JPEG・PNG・WebPの写真を選択してください".into()),
    };
    let data = STANDARD
        .decode(encoded)
        .map_err(|_| "写真を読み込めませんでした")?;
    if data.len() > 8 * 1024 * 1024 || data.len() < 12 {
        return Err("写真のサイズは8MB以下にしてください".into());
    }
    let valid = match mime {
        "image/jpeg" => data.starts_with(&[255, 216, 255]),
        "image/png" => data.starts_with(b"\x89PNG\r\n\x1a\n"),
        _ => data.starts_with(b"RIFF") && data.get(8..12) == Some(b"WEBP"),
    };
    if !valid {
        return Err("画像の内容と形式が一致しません".into());
    }
    let p = Photo {
        id: uuid::Uuid::new_v4().to_string(),
        review_id: id.into(),
        name: name.chars().take(160).collect(),
        caption: String::new(),
        mime: mime.into(),
        data_url: data_url.into(),
        position: current.last().map(|p| p.position + 1).unwrap_or(0),
        bytes: data.len(),
    };
    db.execute(
        "INSERT INTO photos VALUES(?,?,?,?,?,?,?)",
        params![p.id, id, p.name, p.caption, mime, data, p.position],
    )
    .map_err(|e| e.to_string())?;
    Ok(p)
}
