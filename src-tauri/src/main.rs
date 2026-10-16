#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
mod model;
mod secret;
mod services;
mod store;
#[cfg(test)]
mod tests;
mod workspace;
use model::*;
use rusqlite::{params, Connection};
use serde_json::{json, Value};
use std::{path::PathBuf, sync::Mutex};
use tauri::Manager;

pub struct Engine {
    root: PathBuf,
    db: Connection,
    settings: secret::Settings,
    client: reqwest::blocking::Client,
}
pub fn root() -> PathBuf {
    if let Some(p) = std::env::var_os("WORLD_REVIEW_HOME") {
        return PathBuf::from(p);
    }
    let project = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .unwrap()
        .to_path_buf();
    if project.join("package.json").exists() {
        project.join("workspace")
    } else {
        PathBuf::from(std::env::var_os("LOCALAPPDATA").unwrap_or_else(|| ".".into()))
            .join("WorldReviewAssistant/workspace")
    }
}
impl Engine {
    fn new(root: PathBuf) -> AppResult<Self> {
        Ok(Self {
            db: store::open(&root)?,
            settings: secret::Settings::load(&root)?,
            client: services::client()?,
            root,
        })
    }
    fn run(&mut self, action: &str, v: Value) -> AppResult<Value> {
        let string = |k: &str| v[k].as_str().unwrap_or_default();
        match action {
            "bootstrap" => Ok(
                json!({"settings":self.settings.public(),"workspace":self.root.to_string_lossy(),"reviews":store::list(&self.db,"")?,"version":env!("CARGO_PKG_VERSION")}),
            ),
            "list" => Ok(json!(store::list(&self.db, string("query"))?)),
            "read" => {
                let r = store::get(&self.db, string("id"))?;
                Ok(json!({"review":r,"photos":store::photos(&self.db,&r.id)?}))
            }
            "save" => {
                let r: Review = serde_json::from_value(v["review"].clone())
                    .map_err(|_| "保存内容の形式が不正です")?;
                let r = store::save(&mut self.db, r, "edit")?;
                let _ = workspace::mirror(&self.root, &r);
                Ok(json!(r))
            }
            "add-photo" => Ok(json!(store::add_photo(
                &self.db,
                string("id"),
                string("name"),
                string("dataUrl")
            )?)),
            "caption" => {
                let r = store::get(&self.db, string("reviewId"))?;
                if matches!(r.status.as_str(), "publishing" | "publish-unknown") {
                    return Err("投稿結果を確認してから編集してください".into());
                }
                if string("caption").len() > 1000 {
                    return Err("写真の説明が長すぎます".into());
                }
                self.db
                    .execute(
                        "UPDATE photos SET caption=? WHERE id=? AND review_id=?",
                        params![string("caption"), string("id"), string("reviewId")],
                    )
                    .map_err(|e| e.to_string())?;
                Ok(json!({"ok":true}))
            }
            "remove-photo" => {
                let r = store::get(&self.db, string("reviewId"))?;
                if matches!(r.status.as_str(), "publishing" | "publish-unknown") {
                    return Err("投稿結果を確認してから編集してください".into());
                }
                let tx = self.db.transaction().map_err(|e| e.to_string())?;
                tx.execute("DELETE FROM photo_uploads WHERE photo_id IN (SELECT id FROM photos WHERE id=? AND review_id=?)",params![string("id"),string("reviewId")]).map_err(|e|e.to_string())?;
                tx.execute(
                    "DELETE FROM photos WHERE id=? AND review_id=?",
                    params![string("id"), string("reviewId")],
                )
                .map_err(|e| e.to_string())?;
                tx.commit().map_err(|e| e.to_string())?;
                Ok(json!({"ok":true}))
            }
            "fetch-world" => {
                let world = services::fetch_world(&self.client, &mut self.settings, string("url"))?;
                if self.settings.cookies.contains_key("auth") {
                    self.settings.save(&self.root)?;
                }
                Ok(json!(world))
            }
            "identify-world" => {
                let id = world_id(string("url"))?;
                Ok(json!(World {
                    id: id.clone(),
                    url: format!("https://vrchat.com/home/world/{id}"),
                    source: "手入力（未確認の項目は空欄）".into(),
                    ..World::default()
                }))
            }
            "save-settings" => {
                let mut next = self.settings.clone();
                next.update(&v)?;
                next.save(&self.root)?;
                self.settings = next;
                Ok(self.settings.public())
            }
            "clear-secret" => {
                match string("key") {
                    "blog" => self.settings.blog_key.clear(),
                    "photo" => self.settings.photo_key.clear(),
                    "vrchat" => self.settings.cookies.clear(),
                    _ => return Err("設定項目が不正です".into()),
                };
                self.settings.save(&self.root)?;
                Ok(self.settings.public())
            }
            "check-blog" => services::check_blog(&self.client, &self.settings),
            "check-photo" => services::check_photo(&self.client, &self.settings),
            "vrchat-login" => {
                let result = services::login(
                    &self.client,
                    &mut self.settings,
                    string("username"),
                    string("password"),
                )?;
                if result["loggedIn"] == true {
                    self.settings.save(&self.root)?;
                }
                Ok(result)
            }
            "vrchat-verify" => {
                let result = services::verify(
                    &self.client,
                    &mut self.settings,
                    string("method"),
                    string("code"),
                )?;
                if result["loggedIn"] == true {
                    self.settings.save(&self.root)?;
                }
                Ok(result)
            }
            "import-document" => Ok(json!(workspace::import_document(
                &self.root,
                &mut self.db,
                std::path::Path::new(string("path"))
            )?)),
            "confirm-markdown" => {
                self.settings.markdown_confirmed = v["confirmed"]
                    .as_bool()
                    .ok_or("true または false が必要です")?;
                self.settings.save(&self.root)?;
                Ok(self.settings.public())
            }
            "prepare-codex" => workspace::prepare(&self.root, &self.db, string("id")),
            "import-article" => Ok(json!(workspace::import(
                &self.root,
                &mut self.db,
                string("id")
            )?)),
            "publish" => Ok(json!(services::publish(
                &self.root,
                &mut self.db,
                &self.client,
                &self.settings,
                string("id"),
                v["revision"].as_i64().ok_or("記事の版が必要です")?,
                v["draft"].as_bool().ok_or("公開状態が必要です")?
            )?)),
            "reconcile" => Ok(json!(services::reconcile(
                &self.root,
                &mut self.db,
                &self.client,
                &self.settings,
                string("id")
            )?)),
            "reset-publish" => {
                if v["confirmedNoPost"] != true {
                    return Err("ブログ側に記事が存在しないことを確認してください".into());
                }
                let mut r = store::get(&self.db, string("id"))?;
                if !r.edit_url.is_empty() {
                    return Err("編集URLがある記事の投稿状態はリセットできません".into());
                }
                if !matches!(r.status.as_str(), "publishing" | "publish-unknown") {
                    return Err("投稿結果の確認待ちの記事だけをリセットできます".into());
                }
                r.status = "draft".into();
                store::state(&self.db, &r)?;
                workspace::mirror(&self.root, &r)?;
                Ok(json!(r))
            }
            "open-workspace" => {
                let path = if string("id").is_empty() {
                    self.root.clone()
                } else {
                    workspace::folder(&self.root, string("id"))?
                };
                std::fs::create_dir_all(&path).map_err(|e| e.to_string())?;
                open_folder(&path)?;
                Ok(json!({"ok":true}))
            }
            "open-external" => {
                let url = string("url");
                let u = reqwest::Url::parse(url).map_err(|_| "リンクが不正です")?;
                if u.scheme() != "https"
                    || !u.username().is_empty()
                    || u.password().is_some()
                    || u.port_or_known_default() != Some(443)
                    || !matches!(
                        u.host_str(),
                        Some(
                            "vrchat.com"
                                | "help.hatenablog.com"
                                | "blog.hatena.ne.jp"
                                | "f.hatena.ne.jp"
                        )
                    ) && u.host_str() != Some(self.settings.blog_id.as_str())
                {
                    return Err("登録したブログ・VRChat・はてなの公式リンクだけを開けます".into());
                }
                #[cfg(windows)]
                {
                    std::process::Command::new("explorer.exe")
                        .arg(url)
                        .spawn()
                        .map_err(|_| "リンクを開けませんでした")?;
                }
                Ok(json!({"ok":true}))
            }
            "backup" => {
                let dir = self.root.join("backups");
                std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
                let dest = dir.join(format!(
                    "reviews-{}-{}.sqlite3",
                    now(),
                    uuid::Uuid::new_v4().simple()
                ));
                self.db
                    .backup("main", &dest, None)
                    .map_err(|e| e.to_string())?;
                Ok(json!({"path":dest.to_string_lossy()}))
            }
            _ => Err("未対応の操作です".into()),
        }
    }
}
fn open_folder(path: &std::path::Path) -> AppResult<()> {
    #[cfg(windows)]
    {
        std::process::Command::new("explorer.exe")
            .arg(path)
            .spawn()
            .map_err(|_| "フォルダを開けませんでした")?;
    }
    Ok(())
}
#[tauri::command]
async fn command(app: tauri::AppHandle, action: String, payload: Value) -> AppResult<Value> {
    tauri::async_runtime::spawn_blocking(move || {
        let s = app.state::<Mutex<Engine>>();
        let mut engine = s
            .lock()
            .map_err(|_| "処理を再開できませんでした。アプリを再起動してください")?;
        engine.run(&action, payload)
    })
    .await
    .map_err(|_| "処理を完了できませんでした")?
}
fn cli() -> bool {
    let args: Vec<String> = std::env::args().collect();
    if args.get(1).map(String::as_str) != Some("--cli") {
        return false;
    }
    let result = (|| {
        let action = args.get(2).map(String::as_str).unwrap_or("help");
        let id = args.get(3).map(String::as_str).unwrap_or("");
        if action == "help" {
            return Ok(
                json!({"usage":["--cli list","--cli import-document ABSOLUTE_MD_PATH","--cli confirm-markdown true|false","--cli read REVIEW_ID","--cli prepare-codex REVIEW_ID","--cli import-article REVIEW_ID","--cli reconcile REVIEW_ID","--cli publish REVIEW_ID REVISION draft|public"],"workspace":root().to_string_lossy()}),
            );
        }
        if !matches!(
            action,
            "status"
                | "check-blog"
                | "check-photo"
                | "list"
                | "read"
                | "import-document"
                | "confirm-markdown"
                | "prepare-codex"
                | "import-article"
                | "reconcile"
                | "publish"
        ) {
            return Err("CLIで許可されていない操作です".into());
        }
        let mut v = json!({"id":id});
        if action == "import-document" {
            v = json!({"path":id});
        }
        if action == "confirm-markdown" {
            v = json!({"confirmed":match id { "true" => true, "false" => false, _ => return Err("true または false を指定してください".into()) }});
        }
        if action == "publish" {
            let revision = args
                .get(4)
                .and_then(|v| v.parse::<i64>().ok())
                .ok_or("現在のrevisionを指定してください")?;
            let mode = args
                .get(5)
                .map(String::as_str)
                .ok_or("draft または public を明示してください")?;
            if !matches!(mode, "draft" | "public") {
                return Err("draft または public を明示してください".into());
            }
            v["revision"] = json!(revision);
            v["draft"] = json!(mode == "draft");
        }
        Engine::new(root())?.run(
            if action == "status" {
                "bootstrap"
            } else {
                action
            },
            v,
        )
    })();
    match result {
        Ok(v) => {
            println!("{}", serde_json::to_string_pretty(&v).unwrap());
        }
        Err(e) => {
            eprintln!("{e}");
            std::process::exit(1)
        }
    }
    true
}
fn main() {
    if cli() {
        return;
    }
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _, _| {
            if let Some(w) = app.get_webview_window("main") {
                let _ = w.show();
                let _ = w.set_focus();
            }
        }))
        .setup(|app| {
            app.manage(Mutex::new(
                Engine::new(root()).map_err(std::io::Error::other)?,
            ));
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![command])
        .run(tauri::generate_context!())
        .expect("World Review Assistantを起動できませんでした");
}
