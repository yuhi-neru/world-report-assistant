use crate::{model::*, secret::Settings, store, workspace};
use base64::{engine::general_purpose::STANDARD, Engine};
use quick_xml::{events::Event, Reader, XmlVersion};
use reqwest::blocking::{Client, RequestBuilder, Response};
use rusqlite::{params, Connection, OptionalExtension};
use serde_json::{json, Value};
use sha1::{Digest, Sha1};
use std::{io::Read, path::Path, time::Duration};

pub fn client() -> AppResult<Client> {
    let mut headers = reqwest::header::HeaderMap::new();
    headers.insert(
        reqwest::header::ACCEPT,
        reqwest::header::HeaderValue::from_static(
            "application/atom+xml, application/xml, text/xml, application/json, */*",
        ),
    );
    Client::builder()
        .default_headers(headers)
        .timeout(Duration::from_secs(35))
        .redirect(reqwest::redirect::Policy::none())
        .user_agent("WorldReportAssistant/0.1.2 (Windows personal publishing tool)")
        .build()
        .map_err(|_| "通信を初期化できませんでした".into())
}
fn read(response: Response, limit: u64) -> AppResult<String> {
    let mut out = String::new();
    response
        .take(limit + 1)
        .read_to_string(&mut out)
        .map_err(|_| "サーバーからの応答を読み込めませんでした")?;
    if out.len() as u64 > limit {
        return Err("サーバーの応答が大きすぎます".into());
    }
    Ok(out)
}
fn network_error(status: u16, service: &str) -> String {
    match status {
        401|403=>format!("{service}の認証が必要、または権限がありません。設定を確認してください（HTTP {status}）"),
        404=>format!("{service}で対象が見つかりませんでした（HTTP 404）"),
        429=>format!("{service}へのアクセスが制限されました。時間を置いて再試行してください（HTTP 429）"),
        _=>format!("{service}がエラーを返しました（HTTP {status}）。記録はPCに保持しています"),
    }
}
pub fn xml_escape(s: &str) -> String {
    s.replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
        .replace('\'', "&apos;")
}
fn wsse(settings: &Settings) -> AppResult<String> {
    if settings.photo_key.is_empty() {
        return Err("写真を投稿するには設定でフォトライフAPIキーを登録してください".into());
    }
    let mut nonce = uuid::Uuid::new_v4().as_bytes().to_vec();
    nonce.extend_from_slice(&uuid::Uuid::new_v4().as_bytes()[..4]);
    let created = time::OffsetDateTime::now_utc()
        .replace_nanosecond(0)
        .map_err(|e| e.to_string())?
        .format(&time::format_description::well_known::Rfc3339)
        .map_err(|e| e.to_string())?;
    let mut h = Sha1::new();
    h.update(&nonce);
    h.update(created.as_bytes());
    h.update(settings.photo_key.as_bytes());
    Ok(format!(
        "UsernameToken Username=\"{}\", PasswordDigest=\"{}\", Nonce=\"{}\", Created=\"{}\"",
        settings.hatena_id,
        STANDARD.encode(h.finalize()),
        STANDARD.encode(nonce),
        created
    ))
}
#[derive(Default, Clone, Debug)]
pub struct Entry {
    pub edit: String,
    pub public: String,
    pub preview: String,
    pub next: String,
    pub image: String,
    pub draft: bool,
    pub content_type: String,
}
pub fn parse_entries(xml: &str) -> AppResult<Vec<Entry>> {
    let mut reader = Reader::from_str(xml);
    reader.config_mut().trim_text(true);
    let mut current = Entry::default();
    let mut all = Vec::new();
    let mut tag = String::new();
    let mut in_entry = false;
    let mut feed_next = String::new();
    loop {
        match reader.read_event() {
            Ok(Event::Start(e)) | Ok(Event::Empty(e)) => {
                let name = e.local_name().as_ref().to_owned();
                tag = name.clone();
                if name == "entry" {
                    current = Entry::default();
                    in_entry = true;
                }
                if name == "link" {
                    let mut rel = String::new();
                    let mut href = String::new();
                    for a in e.attributes().with_checks(false) {
                        let a = a.map_err(|_| "XMLの属性が不正です")?;
                        let value = a
                            .normalized_value(XmlVersion::Implicit1_0)
                            .map_err(|_| "XMLの文字列が不正です")?
                            .into_owned();
                        match a.key.as_ref() {
                            "rel" => rel = value,
                            "href" => href = value,
                            _ => {}
                        }
                    }
                    if rel == "next" && !in_entry {
                        feed_next = href;
                    } else {
                        match rel.as_str() {
                            "edit" => current.edit = href,
                            "alternate" => current.public = href,
                            "preview" => current.preview = href,
                            "next" => current.next = href,
                            _ => {}
                        }
                    }
                }
                if name == "content" {
                    for a in e.attributes().flatten() {
                        if a.key.as_ref() == "type" {
                            current.content_type = a
                                .normalized_value(XmlVersion::Implicit1_0)
                                .map_err(|_| "XMLの文字列が不正です")?
                                .into_owned();
                        }
                    }
                }
            }
            Ok(Event::Text(e)) => {
                let decoded = e.xml_content(XmlVersion::Implicit1_0);
                let t = quick_xml::escape::unescape(&decoded).map_err(|_| "XMLを読み込めません")?;
                match tag.as_str() {
                    "imageurl" => current.image.push_str(&t),
                    "draft" => current.draft = t == "yes",
                    _ => {}
                }
            }
            Ok(Event::End(e)) => {
                if e.local_name().as_ref() == "entry" {
                    all.push(current.clone());
                    current = Entry::default();
                    in_entry = false;
                }
                tag.clear();
            }
            Ok(Event::GeneralRef(e)) => {
                let encoded = format!("&{};", e.as_ref());
                let value =
                    quick_xml::escape::unescape(&encoded).map_err(|_| "XMLの文字参照が不正です")?;
                if tag == "imageurl" {
                    current.image.push_str(&value);
                }
            }
            Ok(Event::CData(e)) => {
                if tag == "imageurl" {
                    current
                        .image
                        .push_str(&e.xml_content(XmlVersion::Implicit1_0));
                }
            }
            Ok(Event::Eof) => break,
            Err(_) => return Err("サーバーのXML応答を読み込めませんでした".into()),
            _ => {}
        }
    }
    if all.is_empty() {
        all.push(current);
    }
    if !feed_next.is_empty() {
        all.push(Entry {
            next: feed_next,
            ..Entry::default()
        });
    }
    Ok(all)
}
fn cookie_apply(r: RequestBuilder, s: &Settings) -> RequestBuilder {
    if s.cookies.is_empty() {
        r
    } else {
        r.header(
            reqwest::header::COOKIE,
            s.cookies
                .iter()
                .map(|(k, v)| format!("{k}={v}"))
                .collect::<Vec<_>>()
                .join("; "),
        )
    }
}
fn receive_cookies(r: &Response, s: &mut Settings) {
    for h in r.headers().get_all(reqwest::header::SET_COOKIE) {
        if let Some((name, value)) = h
            .to_str()
            .ok()
            .and_then(|s| s.split(';').next())
            .and_then(|s| s.split_once('='))
        {
            if matches!(name, "auth" | "twoFactorAuth")
                && value.len() < 4096
                && value
                    .bytes()
                    .all(|b| b.is_ascii_alphanumeric() || b"_-./=+".contains(&b))
            {
                s.cookies.insert(name.into(), value.into());
            }
        }
    }
}
fn encode(s: &str) -> String {
    s.bytes()
        .map(|b| {
            if b.is_ascii_alphanumeric() || b"-_.~".contains(&b) {
                (b as char).to_string()
            } else {
                format!("%{b:02X}")
            }
        })
        .collect()
}
fn vrc_json(
    client: &Client,
    settings: &mut Settings,
    path: &str,
    basic: Option<(&str, &str)>,
    body: Option<Value>,
) -> AppResult<Value> {
    let url = format!("https://api.vrchat.cloud/api/1/{path}");
    let mut r = cookie_apply(
        if body.is_some() {
            client.post(url)
        } else {
            client.get(url)
        },
        settings,
    );
    if !settings.api_contact.is_empty() {
        r = r.header(
            reqwest::header::USER_AGENT,
            format!("WorldReportAssistant/0.1.2 {}", settings.api_contact),
        );
    }
    if let Some((u, p)) = basic {
        r = r.basic_auth(encode(u), Some(encode(p)));
    }
    if let Some(body) = body {
        r = r.json(&body);
    }
    let response = r
        .send()
        .map_err(|_| "VRChatへ接続できませんでした。ネットワークを確認してください")?;
    receive_cookies(&response, settings);
    let status = response.status().as_u16();
    if !(200..300).contains(&status) {
        return Err(network_error(status, "VRChat"));
    }
    serde_json::from_str(&read(response, 4 * 1024 * 1024)?)
        .map_err(|_| "VRChatからの情報を読み込めませんでした".into())
}
fn auth_status(v: &Value) -> AppResult<Value> {
    let methods = v["requiresTwoFactorAuth"]
        .as_array()
        .cloned()
        .unwrap_or_default();
    let logged = v["id"].as_str().is_some_and(|s| s.starts_with("usr_")) && methods.is_empty();
    if !logged && methods.is_empty() {
        return Err("VRChatの認証を完了できませんでした".into());
    }
    Ok(
        json!({"loggedIn":logged,"displayName":if logged{v["displayName"].as_str().unwrap_or("")}else{""},"methods":methods}),
    )
}
pub fn login(
    client: &Client,
    s: &mut Settings,
    username: &str,
    password: &str,
) -> AppResult<Value> {
    if username.is_empty() || password.is_empty() || username.len() > 256 || password.len() > 1024 {
        return Err("VRChatのログイン用ユーザー名とパスワードを入力してください".into());
    }
    s.cookies.clear();
    let v = vrc_json(client, s, "auth/user", Some((username, password)), None)?;
    auth_status(&v)
}
pub fn verify(client: &Client, s: &mut Settings, method: &str, code: &str) -> AppResult<Value> {
    if !matches!(method, "totp" | "emailOtp" | "otp")
        || code.len() > 32
        || code.len() < 6
        || !code.bytes().all(|b| b.is_ascii_alphanumeric() || b == b'-')
    {
        return Err("認証方法とコードを確認してください".into());
    }
    vrc_json(
        client,
        s,
        &format!("auth/twofactorauth/{method}/verify"),
        None,
        Some(json!({"code":code})),
    )?;
    let v = vrc_json(client, s, "auth/user", None, None)?;
    auth_status(&v)
}
pub fn fetch_world(client: &Client, s: &mut Settings, input: &str) -> AppResult<World> {
    let id = world_id(input)?;
    let v = vrc_json(client, s, &format!("worlds/{id}"), None, None)?;
    if v["id"] != id || v["releaseStatus"] != "public" {
        return Err("公開ワールドの情報だけを取得できます".into());
    }
    let name = v["name"]
        .as_str()
        .filter(|s| !s.trim().is_empty())
        .ok_or("ワールド名を取得できませんでした")?;
    let mut platforms = Vec::<String>::new();
    if let Some(packages) = v["unityPackages"].as_array() {
        for p in packages {
            let p = match p["platform"].as_str() {
                Some("standalonewindows") => Some("PC"),
                Some("android") => Some("Android / Quest"),
                Some("ios") => Some("iOS"),
                _ => None,
            };
            if let Some(p) = p {
                if !platforms.iter().any(|s| s == p) {
                    platforms.push(p.into());
                }
            }
        }
    }
    Ok(World {
        id: id.clone(),
        url: format!("https://vrchat.com/home/world/{id}"),
        name: name.chars().take(200).collect(),
        author: v["authorName"]
            .as_str()
            .unwrap_or("")
            .chars()
            .take(200)
            .collect(),
        description: v["description"]
            .as_str()
            .unwrap_or("")
            .chars()
            .take(8000)
            .collect(),
        platforms,
        capacity: v["capacity"].as_u64(),
        tags: v["tags"]
            .as_array()
            .map(|a| {
                a.iter()
                    .filter_map(|v| v.as_str()?.strip_prefix("author_tag_").map(str::to_owned))
                    .take(40)
                    .collect()
            })
            .unwrap_or_default(),
        fetched_at: now(),
        source: "VRChat API（作者の記載）".into(),
    })
}
pub fn check_blog(client: &Client, s: &Settings) -> AppResult<Value> {
    let base = s.blog_base()?;
    let r = client
        .get(&base)
        .basic_auth(&s.hatena_id, Some(&s.blog_key))
        .send()
        .map_err(|_| "はてなブログへ接続できませんでした")?;
    let status = r.status().as_u16();
    if !(200..300).contains(&status) {
        return Err(network_error(status, "はてなブログ"));
    }
    let entries = parse_entries(&read(r, 4 * 1024 * 1024)?)?;
    Ok(
        json!({"ok":true,"message":"ブログへの接続を確認できました。記事の作成・変更は行っていません。","latestContentType":entries.iter().find(|e|!e.content_type.is_empty()).map(|e|e.content_type.clone())}),
    )
}
pub fn check_photo(client: &Client, s: &Settings) -> AppResult<Value> {
    if s.hatena_id.is_empty() {
        return Err("はてなIDを設定してください".into());
    }
    let r = client
        .get("https://f.hatena.ne.jp/atom/feed")
        .header("X-WSSE", wsse(s)?)
        .send()
        .map_err(|_| "はてなフォトライフへ接続できませんでした")?;
    let status = r.status().as_u16();
    if status != 200 {
        return Err(network_error(status, "はてなフォトライフ"));
    }
    parse_entries(&read(r, 4 * 1024 * 1024)?)?;
    Ok(
        json!({"ok":true,"message":"写真サービスへの接続を確認できました。写真の追加・変更は行っていません。"}),
    )
}
fn valid_edit(url: &str, s: &Settings) -> AppResult<()> {
    let prefix = format!("{}/", s.blog_base()?);
    if !url.starts_with(&prefix)
        || url[prefix.len()..].is_empty()
        || !url[prefix.len()..]
            .bytes()
            .all(|b| b.is_ascii_alphanumeric())
    {
        return Err("記事の編集URLと投稿先が一致しません".into());
    }
    Ok(())
}
fn valid_photo_url(s: &str) -> bool {
    reqwest::Url::parse(s).is_ok_and(|u| {
        u.scheme() == "https"
            && matches!(
                u.host_str(),
                Some(
                    "cdn-ak.f.st-hatena.com"
                        | "cdn.image.st-hatena.com"
                        | "f.st-hatena.com"
                        | "img.f.hatena.ne.jp"
                        | "f.hatena.ne.jp"
                )
            )
            && u.username().is_empty()
            && u.password().is_none()
    })
}
fn upload_photo(client: &Client, s: &Settings, p: &Photo) -> AppResult<String> {
    let bytes = p
        .data_url
        .split_once(',')
        .ok_or("写真を読み込めませんでした")?
        .1;
    let title = if p.caption.is_empty() {
        &p.name
    } else {
        &p.caption
    };
    let xml=format!("<?xml version=\"1.0\" encoding=\"utf-8\"?><entry xmlns=\"http://purl.org/atom/ns#\" xmlns:dc=\"http://purl.org/dc/elements/1.1/\"><title>{}</title><content mode=\"base64\" type=\"{}\">{}</content><dc:subject>Hatena Blog</dc:subject><generator>World Report Assistant</generator></entry>",xml_escape(title),p.mime,bytes);
    let post_url = "https://f.hatena.ne.jp/atom/post";
    #[cfg(test)]
    let post_url = s.test_photo_post.as_deref().unwrap_or(post_url);
    let r = client
        .post(post_url)
        .header("X-WSSE", wsse(s)?)
        .header("Content-Type", "application/atom+xml; charset=utf-8")
        .body(xml)
        .send()
        .map_err(|_| {
            "写真の送信結果を確認できませんでした。写真がフォトライフに追加されている場合があります"
        })?;
    let status = r.status().as_u16();
    if status != 201 {
        return Err(network_error(status, "はてなフォトライフ"));
    }
    let entries = parse_entries(&read(r, 512 * 1024)?)?;
    let mut url = entries.first().map(|e| e.image.clone()).unwrap_or_default();
    if url.starts_with("http://") {
        url = url.replacen("http://", "https://", 1);
    }
    if !valid_photo_url(&url) {
        return Err("写真は送信されましたが、画像URLを確認できませんでした".into());
    }
    Ok(url)
}
pub fn entry_xml(r: &Review, body: &str, draft: bool) -> String {
    format!("<?xml version=\"1.0\" encoding=\"utf-8\"?><entry xmlns=\"http://www.w3.org/2005/Atom\" xmlns:app=\"http://www.w3.org/2007/app\" xmlns:hatenablog=\"http://www.hatena.ne.jp/info/xmlns#hatenablog\"><title>{}</title><content type=\"text/x-markdown\">{}</content>{}<app:control><app:draft>{}</app:draft></app:control>{}</entry>",xml_escape(&r.title),xml_escape(body),r.categories.iter().filter(|c|!c.trim().is_empty()).map(|c|format!("<category term=\"{}\"/>",xml_escape(c))).collect::<String>(),if draft{"yes"}else{"no"},if r.edit_url.is_empty(){format!("<hatenablog:custom-url>world-review-{}</hatenablog:custom-url>",r.id)}else{String::new()})
}
pub fn publish(
    root: &Path,
    db: &mut Connection,
    client: &Client,
    s: &Settings,
    id: &str,
    revision: i64,
    draft: bool,
) -> AppResult<Review> {
    let mut r = store::get(db, id)?;
    r.validate()?;
    let base = s.blog_base()?;
    if r.revision != revision {
        return Err("記事が更新されています。最新のプレビューを確認してください".into());
    }
    if matches!(r.status.as_str(), "publishing" | "publish-unknown") {
        return Err("前回の投稿結果を先に確認してください。重複投稿は行いません".into());
    }
    if !s.markdown_confirmed {
        return Err(
            "はてなブログの既定の編集モードをMarkdownにして、設定の確認欄をオンにしてください"
                .into(),
        );
    }
    if r.title.trim().is_empty()
        || r.body.trim().is_empty()
        || (r.kind == "world-review" && (r.world.id.is_empty() || r.world.name.trim().is_empty()))
    {
        return Err("ワールド・タイトル・本文が必要です".into());
    }
    if !r.target_blog.is_empty() && r.target_blog != base {
        return Err("この記録の投稿先と現在のブログ設定が異なります".into());
    }
    let photos = store::photos(db, id)?;
    // Validate every placeholder before uploading anything.
    article_source(&r, &photos, false)?;
    let referenced: Vec<_> = photos
        .iter()
        .filter(|p| r.body.contains(&format!("{{{{photo:{}}}}}", p.id)))
        .collect();
    if !referenced.is_empty() && s.photo_key.is_empty() {
        return Err("写真を投稿するにはフォトライフAPIキーを設定してください".into());
    }
    if !r.edit_url.is_empty() {
        valid_edit(&r.edit_url, s)?;
    }
    let before = r.status.clone();
    let original_target = r.target_blog.clone();
    r.status = "publishing".into();
    r.target_blog = base.clone();
    let reserved=db.execute("UPDATE reviews SET status='publishing',data=? WHERE id=? AND revision=? AND status IN ('draft','published','remote-draft')",params![serde_json::to_string(&r).unwrap(),id,revision]).map_err(|e|e.to_string())?;
    if reserved != 1 {
        return Err(
            "別の操作で記事が更新、または投稿されています。最新の記録を開き直してください".into(),
        );
    }
    let preparation = (|| -> AppResult<(String, i64)> {
        let mut rendered = r.clone();
        for p in referenced {
            let cached: Option<String> = db
                .query_row(
                    "SELECT url FROM photo_uploads WHERE photo_id=? AND owner=?",
                    params![p.id, s.hatena_id],
                    |r| r.get(0),
                )
                .optional()
                .map_err(|e| e.to_string())?;
            let url = if let Some(url) = cached {
                url
            } else {
                let url = upload_photo(client, s, p)?;
                db.execute(
                    "INSERT INTO photo_uploads VALUES(?,?,?)",
                    params![p.id, s.hatena_id, url],
                )
                .map_err(|e| e.to_string())?;
                url
            };
            if !valid_photo_url(&url) {
                return Err("保存された写真の公開URLが不正です".into());
            }
            rendered.body = rendered.body.replace(
                &format!("{{{{photo:{}}}}}", p.id),
                &format!("![{}]({})", md_escape(&p.caption), url),
            );
        }
        let body = article_source(&rendered, &[], true)?;
        let xml = entry_xml(&r, &body, draft);
        db.execute("INSERT INTO publications(review_id,revision,target,phase,payload,created_at) VALUES(?,?,?,?,?,?)",params![id,revision,base,"prepared",serde_json::to_string(&json!({"title":r.title,"markdown":body,"draft":draft})).unwrap(),now()]).map_err(|e|e.to_string())?;
        Ok((xml, db.last_insert_rowid()))
    })();
    let (xml, attempt) = match preparation {
        Ok(v) => v,
        Err(e) => {
            r.status = before;
            r.target_blog = original_target;
            store::state(db, &r)?;
            return Err(e);
        }
    };
    let request = if r.edit_url.is_empty() {
        client.post(&base)
    } else {
        client.put(&r.edit_url)
    };
    let response = request
        .basic_auth(&s.hatena_id, Some(&s.blog_key))
        .header("Content-Type", "application/atom+xml; charset=utf-8")
        .body(xml)
        .send();
    let response = match response {
        Ok(v) => v,
        Err(_) => {
            r.status = "publish-unknown".into();
            store::state(db, &r)?;
            return Err("投稿結果を確認できませんでした。重複を防ぐため再送を止めています。『投稿結果を確認』を実行してください".into());
        }
    };
    let status = response.status().as_u16();
    if !(200..300).contains(&status) {
        r.status = if status >= 500 {
            "publish-unknown".into()
        } else {
            before
        };
        store::state(db, &r)?;
        db.execute(
            "UPDATE publications SET phase=? WHERE id=?",
            params![if status >= 500 { "unknown" } else { "rejected" }, attempt],
        )
        .map_err(|e| e.to_string())?;
        return Err(network_error(status, "はてなブログ"));
    }
    if let Some(location) = response
        .headers()
        .get("Location")
        .and_then(|v| v.to_str().ok())
    {
        if valid_edit(location, s).is_ok() {
            r.edit_url = location.into();
        }
    }
    // Persist a confirmed Location immediately, even if reading the response body fails.
    r.status = "publish-unknown".into();
    store::state(db, &r)?;
    let text = read(response, 4 * 1024 * 1024)?;
    let entries = parse_entries(&text)?;
    let entry = entries
        .first()
        .ok_or("投稿の応答を確認できませんでした。『投稿結果を確認』を実行してください")?;
    if valid_edit(&entry.edit, s).is_ok() {
        r.edit_url = entry.edit.clone();
    }
    if r.edit_url.is_empty() {
        return Err("記事は送信されましたが編集URLを確認できませんでした。『投稿結果を確認』を実行してください".into());
    }
    r.public_url = entry.public.clone();
    r.preview_url = entry.preview.clone();
    r.status = if entry.draft {
        "remote-draft".into()
    } else {
        "published".into()
    };
    r.updated_at = now();
    store::state(db, &r)?;
    db.execute(
        "UPDATE publications SET phase='confirmed' WHERE id=?",
        [attempt],
    )
    .map_err(|e| e.to_string())?;
    let _ = workspace::mirror(root, &r);
    Ok(r)
}
pub fn reconcile(
    root: &Path,
    db: &mut Connection,
    client: &Client,
    s: &Settings,
    id: &str,
) -> AppResult<Review> {
    let mut r = store::get(db, id)?;
    let base = s.blog_base()?;
    if !r.target_blog.is_empty() && r.target_blog != base {
        return Err("設定した投稿先がこの記録の投稿先と異なります".into());
    }
    let slug = format!("/entry/world-review-{}", r.id);
    let mut next = if r.edit_url.is_empty() {
        base.clone()
    } else {
        valid_edit(&r.edit_url, s)?;
        r.edit_url.clone()
    };
    for _ in 0..15 {
        let u = reqwest::Url::parse(&next).map_err(|_| "確認用URLが不正です")?;
        let origin = reqwest::Url::parse(&base).map_err(|_| "投稿先の形式が不正です")?;
        if u.origin() != origin.origin()
            || !(u.path() == origin.path() || valid_edit(&next, s).is_ok())
        {
            return Err("確認用URLが投稿先と一致しません".into());
        }
        let response = client
            .get(&next)
            .basic_auth(&s.hatena_id, Some(&s.blog_key))
            .send()
            .map_err(|_| "はてなブログへ接続できませんでした")?;
        let status = response.status().as_u16();
        if status != 200 {
            return Err(network_error(status, "はてなブログ"));
        }
        let entries = parse_entries(&read(response, 4 * 1024 * 1024)?)?;
        if let Some(e) = entries.iter().find(|e| {
            !e.edit.is_empty()
                && ((!r.edit_url.is_empty() && e.edit == r.edit_url) || e.public.contains(&slug))
        }) {
            valid_edit(&e.edit, s)?;
            r.edit_url = e.edit.clone();
            r.public_url = e.public.clone();
            r.preview_url = e.preview.clone();
            r.status = if e.draft {
                "remote-draft".into()
            } else {
                "published".into()
            };
            r.target_blog = base;
            r.updated_at = now();
            store::state(db, &r)?;
            let _ = workspace::mirror(root, &r);
            return Ok(r);
        }
        match entries.iter().find(|e| !e.next.is_empty()) {
            Some(e) => {
                next = e.next.clone();
                std::thread::sleep(Duration::from_millis(300));
            }
            None => break,
        }
    }
    Err("直近の記事から投稿結果を確認できませんでした。ブログ管理画面で確認してください。自動再送は行っていません".into())
}
