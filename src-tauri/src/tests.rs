use super::*;
use crate::model::*;

fn review() -> Review {
    serde_json::from_value(json!({"schemaVersion":1,"id":"2f16901a-457b-4312-b745-6582dfe4700e","revision":0,"world":{"id":"wrld_2f16901a-457b-4312-b745-6582dfe4700e","url":"https://vrchat.com/home/world/wrld_2f16901a-457b-4312-b745-6582dfe4700e","name":"雨の図書室","author":"作者","description":"作者の説明","platforms":[],"capacity":null,"tags":[],"fetchedAt":0,"source":"test"},"visitedAt":"2026-10-16","environment":"PC VR","notes":{"summary":"窓の外の雨を眺めた","scenery":"","sound":"雨音が聞こえた","activities":"","highlights":"静かだった","concerns":"","recommended":""},"title":"雨の図書室を訪れて","body":"窓際で過ごしました。","categories":["VRChat"],"includeMetadata":true,"status":"draft","editUrl":"","publicUrl":"","previewUrl":"","targetBlog":"","updatedAt":0})).unwrap()
}
#[test]
fn only_official_world_urls_are_accepted() {
    let id = "wrld_2f16901a-457b-4312-b745-6582dfe4700e";
    assert_eq!(
        world_id(&format!("https://vrchat.com/home/launch?worldId={id}")).unwrap(),
        id
    );
    for bad in [
        format!("https://evil.example/{id}"),
        format!("https://vrchat.com.evil.example/{id}"),
        format!("https://user:pass@vrchat.com/home/world/{id}"),
        format!("http://vrchat.com/home/world/{id}"),
        format!("https://vrchat.com:444/home/world/{id}"),
        "wrld_../../private".into(),
    ] {
        assert!(world_id(&bad).is_err(), "{bad}");
    }
}
#[test]
fn save_detects_conflicts_and_keeps_history() {
    let tmp = tempfile::tempdir().unwrap();
    let mut db = store::open(tmp.path()).unwrap();
    let first = store::save(&mut db, review(), "first").unwrap();
    assert_eq!(first.revision, 1);
    let mut next = first.clone();
    next.notes.summary = "添削したメモ".into();
    let second = store::save(&mut db, next, "edit").unwrap();
    assert_eq!(second.revision, 2);
    assert!(store::save(&mut db, first, "stale").is_err());
    assert_eq!(
        store::get(&db, &second.id).unwrap().notes.summary,
        "添削したメモ"
    );
    let n: i64 = db
        .query_row("SELECT COUNT(*) FROM history", [], |r| r.get(0))
        .unwrap();
    assert_eq!(n, 2);
    assert_eq!(store::list(&db, "添削した").unwrap().len(), 1);
}
#[test]
fn sql_does_not_interpret_search_as_query() {
    let tmp = tempfile::tempdir().unwrap();
    let mut db = store::open(tmp.path()).unwrap();
    store::save(&mut db, review(), "first").unwrap();
    assert!(store::list(&db, "'; DROP TABLE reviews;--")
        .unwrap()
        .is_empty());
    assert_eq!(store::list(&db, "").unwrap().len(), 1);
}
#[test]
fn codex_roundtrip_preserves_notes_and_blocks_stale_import() {
    let tmp = tempfile::tempdir().unwrap();
    let mut db = store::open(tmp.path()).unwrap();
    let r = store::save(&mut db, review(), "first").unwrap();
    workspace::prepare(tmp.path(), &db, &r.id).unwrap();
    let dir = workspace::folder(tmp.path(), &r.id).unwrap();
    std::fs::write(
        dir.join("article.md"),
        "# 新しいタイトル\n\n雨音を聞きながら過ごしました。\n",
    )
    .unwrap();
    let imported = workspace::import(tmp.path(), &mut db, &r.id).unwrap();
    assert_eq!(imported.title, "新しいタイトル");
    assert_eq!(imported.notes.summary, r.notes.summary);
    assert_eq!(imported.body, "雨音を聞きながら過ごしました。");
    assert!(workspace::import(tmp.path(), &mut db, &r.id).is_err());
    workspace::prepare(tmp.path(), &db, &r.id).unwrap();
    assert!(!dir.join("article.md").exists());
    std::fs::write(dir.join("article.md"), "# 別の記事\n\n本文").unwrap();
    let mut changed = imported;
    changed.notes.sound = "BGMも聞こえた".into();
    store::save(&mut db, changed, "edit").unwrap();
    assert!(workspace::import(tmp.path(), &mut db, &r.id)
        .unwrap_err()
        .contains("変更"));
}
#[test]
fn codex_import_rejects_fabricated_photo_references() {
    let tmp = tempfile::tempdir().unwrap();
    let mut db = store::open(tmp.path()).unwrap();
    let r = store::save(&mut db, review(), "first").unwrap();
    workspace::prepare(tmp.path(), &db, &r.id).unwrap();
    std::fs::write(
        workspace::folder(tmp.path(), &r.id)
            .unwrap()
            .join("article.md"),
        "# タイトル\n\n{{photo:fake}}",
    )
    .unwrap();
    assert!(workspace::import(tmp.path(), &mut db, &r.id).is_err());
}
#[test]
fn metadata_keeps_unconfirmed_platforms_unknown() {
    let r = review();
    let body = article_source(&r, &[], false).unwrap();
    assert!(body.contains("対応環境：未確認"));
    assert!(body.ends_with(&r.body));
    assert!(!body.contains("対応環境：PC"));
}
#[test]
fn xml_roundtrip_handles_namespaces_entities_and_pagination() {
    let xml = r#"<feed xmlns="http://www.w3.org/2005/Atom" xmlns:app="http://www.w3.org/2007/app"><link rel="next" href="https://blog.hatena.ne.jp/a/b/atom/entry?page=2&amp;x=1"/><entry><link rel="edit" href="https://blog.hatena.ne.jp/a/b/atom/entry/123"/><link rel="alternate" href="https://a.hatenablog.com/entry/test"/><app:control><app:draft>yes</app:draft></app:control></entry></feed>"#;
    let entries = services::parse_entries(xml).unwrap();
    assert!(entries[0].draft);
    assert!(entries[0].edit.ends_with("123"));
    assert!(entries.iter().any(|e| e.next.ends_with("?page=2&x=1")));
    let photo = r#"<entry xmlns="http://purl.org/atom/ns#" xmlns:hatena="http://www.hatena.ne.jp/info/xmlns#"><hatena:imageurl>https://cdn-ak.f.st-hatena.com/images/test.jpg</hatena:imageurl></entry>"#;
    assert!(services::parse_entries(photo).unwrap()[0]
        .image
        .ends_with("test.jpg"));
}
#[test]
fn publish_xml_uses_edited_body_without_ai_or_date_changes() {
    let mut r = review();
    r.title = "添削 & <したタイトル>".into();
    r.edit_url = "https://blog.hatena.ne.jp/a/b/atom/entry/123".into();
    let xml = services::entry_xml(&r, "削った本文 & <これだけ>", false);
    assert!(xml.contains("削った本文 &amp; &lt;これだけ&gt;"));
    assert!(xml.contains("<app:draft>no</app:draft>"));
    assert!(!xml.contains("<updated>"));
    assert!(!xml.contains("custom-url"));
    assert!(!xml.contains("窓際で"));
}
#[test]
fn uncertain_publications_block_edit_and_resend() {
    let tmp = tempfile::tempdir().unwrap();
    let mut db = store::open(tmp.path()).unwrap();
    let mut r = store::save(&mut db, review(), "first").unwrap();
    r.status = "publish-unknown".into();
    store::state(&db, &r).unwrap();
    assert!(store::save(&mut db, r.clone(), "edit").is_err());
    let mut s = secret::Settings::initial();
    s.blog_id = "example.hatenablog.com".into();
    s.hatena_id = "sample".into();
    s.blog_key = "fake".into();
    s.markdown_confirmed = true;
    assert!(services::publish(
        tmp.path(),
        &mut db,
        &services::client().unwrap(),
        &s,
        &r.id,
        r.revision,
        false
    )
    .unwrap_err()
    .contains("確認"));
}
#[test]
fn settings_never_return_keys_and_blank_input_keeps_them() {
    let mut s = secret::Settings::initial();
    s.blog_id = "example.hatenablog.com".into();
    s.blog_key = "secret-blog".into();
    s.photo_key = "secret-photo".into();
    s.update(&json!({"hatenaId":"sample","blogId":"example.hatenablog.com","blogKey":"","photoKey":"","markdownConfirmed":true})).unwrap();
    assert_eq!(s.blog_key, "secret-blog");
    let public = s.public().to_string();
    assert!(!public.contains("secret-blog"));
    assert!(!public.contains("secret-photo"));
    assert!(s
        .update(&json!({"blogId":"user:password@evil.example"}))
        .is_err());
}
#[test]
fn accepts_hatena_posting_mail_addresses_without_storing_mail_routing_suffix() {
    let mut s = secret::Settings::initial();
    s.blog_id = "example.hatenablog.com".into();
    s.update(&json!({"hatenaId":"sample","blogId":"sample.hatenablog.com","blogKey":"fakekey.routingtoken@blog.hatena.ne.jp","photoKey":"fakekey@f.hatena.ne.jp"})).unwrap();
    assert_eq!(s.blog_key, "fakekey");
    assert_eq!(s.photo_key, "fakekey");
    assert!(s.update(&json!({"blogKey":"fake@example.com"})).is_err());
}
#[cfg(windows)]
#[test]
fn secrets_are_encrypted_by_windows() {
    let tmp = tempfile::tempdir().unwrap();
    let mut s = secret::Settings::initial();
    s.blog_id = "example.hatenablog.com".into();
    s.blog_key = "fake-secret-for-test".into();
    s.save(tmp.path()).unwrap();
    let bytes = std::fs::read(tmp.path().join("private/settings.bin")).unwrap();
    assert!(!String::from_utf8_lossy(&bytes).contains("fake-secret-for-test"));
    assert_eq!(
        secret::Settings::load(tmp.path()).unwrap().blog_key,
        s.blog_key
    );
}

fn server(responses: Vec<Option<String>>) -> (String, std::thread::JoinHandle<Vec<String>>) {
    use std::{
        io::{Read, Write},
        net::TcpListener,
    };
    let listener = TcpListener::bind("127.0.0.1:0").unwrap();
    let base = format!("http://{}/entry", listener.local_addr().unwrap());
    let h = std::thread::spawn(move || {
        let mut requests = Vec::new();
        for response in responses {
            let (mut stream, _) = listener.accept().unwrap();
            stream
                .set_read_timeout(Some(std::time::Duration::from_secs(5)))
                .unwrap();
            let mut bytes = Vec::new();
            let mut block = [0u8; 8192];
            let mut end = None;
            let mut length = 0;
            loop {
                let n = stream.read(&mut block).unwrap();
                if n == 0 {
                    break;
                }
                bytes.extend_from_slice(&block[..n]);
                if end.is_none() {
                    if let Some(pos) = bytes.windows(4).position(|b| b == b"\r\n\r\n") {
                        end = Some(pos + 4);
                        let head = String::from_utf8_lossy(&bytes[..pos]).to_lowercase();
                        length = head
                            .lines()
                            .find_map(|l| {
                                l.strip_prefix("content-length:")
                                    .and_then(|v| v.trim().parse::<usize>().ok())
                            })
                            .unwrap_or(0);
                    }
                }
                if end.is_some_and(|e| bytes.len() >= e + length) {
                    break;
                }
            }
            requests.push(String::from_utf8_lossy(&bytes).into_owned());
            if let Some(response) = response {
                let body = response.replace(
                    "SERVER",
                    &format!("http://{}", listener.local_addr().unwrap()),
                );
                write!(stream,"HTTP/1.1 201 Created\r\nContent-Type: application/atom+xml\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",body.len(),body).unwrap();
            }
        }
        requests
    });
    (base, h)
}
#[test]
fn publication_uploads_only_referenced_photos_and_sends_edited_text() {
    let photo_xml="<entry xmlns:hatena=\"http://www.hatena.ne.jp/info/xmlns#\"><hatena:imageurl>https://cdn-ak.f.st-hatena.com/images/test.jpg</hatena:imageurl></entry>";
    let article_xml="<entry xmlns=\"http://www.w3.org/2005/Atom\" xmlns:app=\"http://www.w3.org/2007/app\"><link rel=\"edit\" href=\"SERVER/entry/123\"/><link rel=\"alternate\" href=\"https://example.hatenablog.com/entry/test\"/><app:control><app:draft>no</app:draft></app:control></entry>";
    let (base, server) = server(vec![Some(photo_xml.into()), Some(article_xml.into())]);
    let tmp = tempfile::tempdir().unwrap();
    let mut db = store::open(tmp.path()).unwrap();
    let mut r = store::save(&mut db, review(), "first").unwrap();
    let data="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jf5sAAAAASUVORK5CYII=";
    let photo = store::add_photo(&db, &r.id, "test.png", data).unwrap();
    store::add_photo(&db, &r.id, "not-used.png", data).unwrap();
    r.body = format!("本人が添削した本文だけ。\n\n{{{{photo:{}}}}}", photo.id);
    r = store::save(&mut db, r, "edited").unwrap();
    let mut s = secret::Settings::initial();
    s.blog_id = "example.hatenablog.com".into();
    s.hatena_id = "fake-user".into();
    s.blog_key = "fake-blog-key".into();
    s.photo_key = "fake-photo-key".into();
    s.markdown_confirmed = true;
    s.test_photo_post = Some(base.replace("/entry", "/photo"));
    s.test_blog_base = Some(base);
    let published = services::publish(
        tmp.path(),
        &mut db,
        &services::client().unwrap(),
        &s,
        &r.id,
        r.revision,
        false,
    )
    .unwrap();
    assert_eq!(published.status, "published");
    assert!(published.edit_url.ends_with("/123"));
    assert_eq!(store::photos(&db, &r.id).unwrap().len(), 2);
    let requests = server.join().unwrap();
    assert_eq!(requests.len(), 2);
    assert!(requests[0].to_lowercase().contains("x-wsse:"));
    assert!(requests[0].contains("<dc:subject>Hatena Blog</dc:subject>"));
    assert!(requests[1].contains("本人が添削した本文だけ。"));
    assert!(requests[1].contains("https://cdn-ak.f.st-hatena.com/images/test.jpg"));
    assert!(!requests[1].contains("{{photo:"));
    assert!(!requests[1].contains("窓際で過ごしました"));
    assert!(requests[1].contains("<app:draft>no</app:draft>"));
}
#[test]
fn dropped_connection_keeps_durable_uncertain_state_and_stops_duplicate_posts() {
    let (base, server) = server(vec![None]);
    let tmp = tempfile::tempdir().unwrap();
    let mut db = store::open(tmp.path()).unwrap();
    let r = store::save(&mut db, review(), "first").unwrap();
    let mut s = secret::Settings::initial();
    s.blog_id = "example.hatenablog.com".into();
    s.hatena_id = "fake-user".into();
    s.blog_key = "fake-blog-key".into();
    s.markdown_confirmed = true;
    s.test_blog_base = Some(base);
    let c = services::client().unwrap();
    assert!(services::publish(tmp.path(), &mut db, &c, &s, &r.id, r.revision, false).is_err());
    assert_eq!(store::get(&db, &r.id).unwrap().status, "publish-unknown");
    assert!(
        services::publish(tmp.path(), &mut db, &c, &s, &r.id, r.revision, false)
            .unwrap_err()
            .contains("確認")
    );
    assert_eq!(server.join().unwrap().len(), 1);
    drop(db);
    let db = store::open(tmp.path()).unwrap();
    assert_eq!(store::get(&db, &r.id).unwrap().status, "publish-unknown");
}

#[test]
fn standalone_document_does_not_create_a_fictitious_world() {
    let tmp = tempfile::tempdir().unwrap();
    let mut db = store::open(tmp.path()).unwrap();
    let path = tmp.path().join("announcement.md");
    std::fs::write(&path, "# テンプレートの公開\n\n使い方を説明します。\n").unwrap();
    let r = workspace::import_document(tmp.path(), &mut db, &path).unwrap();
    assert_eq!(r.kind, "article");
    assert!(r.world.id.is_empty());
    assert!(!r.include_metadata);
    assert_eq!(
        article_source(&r, &[], false).unwrap(),
        "使い方を説明します。"
    );
    let worlds: i64 = db
        .query_row("SELECT COUNT(*) FROM worlds", [], |r| r.get(0))
        .unwrap();
    assert_eq!(worlds, 0);
    let mut invalid = r.clone();
    invalid.include_metadata = true;
    assert!(invalid.validate().is_err());
    let mut changed = r.clone();
    changed.kind = "world-review".into();
    assert!(store::save(&mut db, changed, "invalid-kind").is_err());
    assert_eq!(review().kind, "world-review"); // Old records remain readable.
    std::fs::write(&path, "no title").unwrap();
    assert!(workspace::import_document(tmp.path(), &mut db, &path).is_err());
}

#[test]
fn document_edit_keeps_publication_identity_and_detects_stale_versions() {
    let tmp = tempfile::tempdir().unwrap();
    let mut db = store::open(tmp.path()).unwrap();
    let path = tmp.path().join("notice.md");
    std::fs::write(&path, "# Before\n\nOriginal text").unwrap();
    let mut r = workspace::import_document(tmp.path(), &mut db, &path).unwrap();
    r.edit_url = "https://example.test/entry/1".into();
    r.public_url = "https://example.test/report".into();
    r.status = "published".into();
    store::state(&db, &r).unwrap();
    std::fs::write(&path, "# After\n\nRenamed text").unwrap();
    let next = workspace::edit_document(tmp.path(), &mut db, &path, &r.id, r.revision).unwrap();
    assert_eq!(next.id, r.id);
    assert_eq!(next.edit_url, r.edit_url);
    assert_eq!(next.public_url, r.public_url);
    assert_eq!(next.status, "published");
    assert_eq!(next.title, "After");
    assert!(workspace::edit_document(tmp.path(), &mut db, &path, &r.id, r.revision).is_err());
}

#[test]
fn legacy_brief_and_copy_roundtrip_preserves_input_and_puts_opening_first() {
    let tmp = tempfile::tempdir().unwrap();
    let mut db = store::open(tmp.path()).unwrap();
    let mut r = review();
    assert_eq!(r.sharing.hashtag, "VRChat");
    assert!(r.sharing.include_opening);
    r.notes = Notes::default();
    r.brief.what = "夜の庭園".into();
    r.brief.who = "散歩が好きな人".into();
    r.brief.how = "庭を歩ける".into();
    r.brief.why = "花の照明がきれい".into();
    r.world.platforms = vec!["PC".into(), "Android / Quest".into()];
    r.sharing.hashtag = "ワールド紹介".into();
    let r = store::save(&mut db, r, "brief").unwrap();
    workspace::prepare(tmp.path(), &db, &r.id).unwrap();
    let dir = workspace::folder(tmp.path(), &r.id).unwrap();
    let input: serde_json::Value =
        serde_json::from_slice(&std::fs::read(dir.join("input.json")).unwrap()).unwrap();
    assert_eq!(input["review"]["brief"]["what"], "夜の庭園");
    assert!(std::fs::read_to_string(dir.join("request.md"))
        .unwrap()
        .contains("sharing.json"));
    std::fs::write(
        dir.join("article.md"),
        "# 庭園の記録\n\n## 訪問メモ\n\n庭を歩いた。",
    )
    .unwrap();
    std::fs::write(dir.join("sharing.json"), r#"{"opening":"夜の庭園です。散歩が好きな人におすすめです。","tweet":"夜の庭園で散歩。花の照明がきれい。"}"#).unwrap();
    let r = workspace::import(tmp.path(), &mut db, &r.id).unwrap();
    assert_eq!(r.sharing.hashtag, "ワールド紹介");
    let source = article_source(&r, &[], false).unwrap();
    assert!(source.starts_with("夜の庭園です。"));
    assert!(source.find("夜の庭園です。").unwrap() < source.find("ワールドの基本情報").unwrap());
    assert_eq!(source.matches("夜の庭園です。").count(), 1);
    assert!(!r.body.contains("夜の庭園です。"));
    let tweet = std::fs::read_to_string(dir.join("tweet.txt")).unwrap();
    assert!(tweet.contains(&format!("https://vrchat.com/home/world/{}", r.world.id)));
    assert_eq!(tweet.matches('#').count(), 2);
    assert!(tweet.ends_with("#VRchat #VRChatワールド紹介\n"));
    assert!(!tweet.contains("#ワールド紹介"));
    assert!(tweet.contains("World：雨の図書室"));
    assert_eq!(r.brief.why, "花の照明がきれい");
    assert!(r.experience.result.is_empty());
    assert!(tweet.contains("対応：PC / Quest単機 / スマホ(Android)"));
    assert!(!tweet.contains("iOS"));
    workspace::prepare(tmp.path(), &db, &r.id).unwrap();
    assert!(!dir.join("sharing.json").exists());
    assert!(std::fs::read_dir(&dir).unwrap().any(|e| e
        .unwrap()
        .file_name()
        .to_string_lossy()
        .starts_with("sharing.previous.")));
}

#[test]
fn invalid_copy_cannot_partially_replace_an_article_and_manual_edits_block_stale_copy() {
    let tmp = tempfile::tempdir().unwrap();
    let mut db = store::open(tmp.path()).unwrap();
    let r = store::save(&mut db, review(), "first").unwrap();
    workspace::prepare(tmp.path(), &db, &r.id).unwrap();
    let dir = workspace::folder(tmp.path(), &r.id).unwrap();
    std::fs::write(dir.join("article.md"), "# New title\n\nNew body").unwrap();
    std::fs::write(dir.join("sharing.json"), "not json").unwrap();
    assert!(workspace::import(tmp.path(), &mut db, &r.id).is_err());
    assert_eq!(store::get(&db, &r.id).unwrap().revision, r.revision);
    assert_eq!(store::get(&db, &r.id).unwrap().title, r.title);
    std::fs::write(
        dir.join("sharing.json"),
        r#"{"opening":"new opening","tweet":"new tweet"}"#,
    )
    .unwrap();
    let mut edited = r.clone();
    edited.sharing.tweet = "本人が添削したツイート".into();
    let edited = store::save(&mut db, edited, "manual-copy").unwrap();
    assert!(workspace::import(tmp.path(), &mut db, &r.id)
        .unwrap_err()
        .contains("変更"));
    assert_eq!(
        store::get(&db, &r.id).unwrap().sharing.tweet,
        edited.sharing.tweet
    );
}

#[test]
fn platform_copy_lists_known_targets_without_inventing_unsupported_devices() {
    for (values, expected) in [
        (vec![], ""),
        (vec!["unknown"], ""),
        (vec!["PC"], "対応：PC"),
        (vec!["Android / Quest"], "対応：Quest単機 / スマホ(Android)"),
        (vec!["ios"], "対応：スマホ(iOS)"),
        (
            vec!["standalonewindows", "android", "iOS", "Android / Quest"],
            "対応：PC / Quest単機 / スマホ(Android) / スマホ(iOS)",
        ),
    ] {
        assert_eq!(
            platform_line(&values.into_iter().map(String::from).collect::<Vec<_>>()),
            expected
        );
    }
}

#[test]
fn sar_only_material_roundtrip_and_changed_result_invalidates_generated_copy() {
    let tmp = tempfile::tempdir().unwrap();
    let mut db = store::open(tmp.path()).unwrap();
    let mut r = review();
    assert!(r.experience.scene.is_empty()); // Pre-SAR JSON remains readable.
    r.notes = Notes::default();
    r.experience = Experience {
        scene: "夜の喫茶店".into(),
        action: "窓際に座る".into(),
        result: "雨音を聞ける".into(),
    };
    let r = store::save(&mut db, r, "sar").unwrap();
    assert_eq!(
        store::get(&db, &r.id).unwrap().experience.result,
        "雨音を聞ける"
    );
    workspace::prepare(tmp.path(), &db, &r.id).unwrap();
    let dir = workspace::folder(tmp.path(), &r.id).unwrap();
    let input: serde_json::Value =
        serde_json::from_slice(&std::fs::read(dir.join("input.json")).unwrap()).unwrap();
    assert_eq!(input["review"]["experience"]["action"], "窓際に座る");
    assert_eq!(input["communication"]["framework"], "SAR-v1");
    assert!(input["communication"]["footer"]
        .as_str()
        .unwrap()
        .ends_with(TWEET_TAGS));
    let request = std::fs::read_to_string(dir.join("request.md")).unwrap();
    assert!(request.contains("原則3行"));
    assert!(request.contains("3行にするための体験を捏造しません"));
    std::fs::write(dir.join("article.md"), "# 喫茶店の記録\n\n窓際に座った。").unwrap();
    std::fs::write(dir.join("sharing.json"), r#"{"opening":"夜の喫茶店で窓際に座り、雨音を聞けます。","tweet":"夜の喫茶店。\n窓際に座る。\n雨音を聞ける。"}"#).unwrap();
    let imported = workspace::import(tmp.path(), &mut db, &r.id).unwrap();
    assert_eq!(imported.sharing.tweet.lines().count(), 3);
    assert_eq!(imported.experience.result, "雨音を聞ける");
    workspace::prepare(tmp.path(), &db, &r.id).unwrap();
    std::fs::write(dir.join("article.md"), "# Stale\n\nStale").unwrap();
    let mut edited = imported;
    edited.experience.result = "雨音は未確認".into();
    let edited = store::save(&mut db, edited, "sar-edit").unwrap();
    assert!(workspace::import(tmp.path(), &mut db, &r.id)
        .unwrap_err()
        .contains("変更"));
    assert_ne!(store::get(&db, &r.id).unwrap().title, "Stale");
    assert_eq!(
        store::get(&db, &r.id).unwrap().sharing.tweet,
        edited.sharing.tweet
    );
}

#[test]
fn article_material_preferences_roundtrip_and_changes_block_stale_import() {
    let tmp = tempfile::tempdir().unwrap();
    let mut db = store::open(tmp.path()).unwrap();
    let mut r = review();
    assert!(r.article_material.omit.is_empty());
    r.article_material = ArticleMaterial {
        visit_context: "一人で訪問".into(),
        focus: "散策の順序を中心に".into(),
        omit: "仕掛けの結末".into(),
    };
    let old_summary = r.notes.summary.clone();
    let r = store::save(&mut db, r, "article-material").unwrap();
    assert_eq!(
        store::get(&db, &r.id).unwrap().article_material.focus,
        "散策の順序を中心に"
    );
    workspace::prepare(tmp.path(), &db, &r.id).unwrap();
    let dir = workspace::folder(tmp.path(), &r.id).unwrap();
    let input: serde_json::Value =
        serde_json::from_slice(&std::fs::read(dir.join("input.json")).unwrap()).unwrap();
    assert_eq!(input["review"]["articleMaterial"]["omit"], "仕掛けの結末");
    let request = std::fs::read_to_string(dir.join("request.md")).unwrap();
    assert!(request.contains("入力欄の順番や数をそのまま見出しにせず"));
    assert!(request.contains("共有文へ漏らしたりしない"));
    std::fs::write(dir.join("article.md"), "# 本文の確認\n\n窓際に座った。").unwrap();
    let imported = workspace::import(tmp.path(), &mut db, &r.id).unwrap();
    assert_eq!(imported.notes.summary, old_summary);
    assert_eq!(imported.article_material.visit_context, "一人で訪問");
    for field in ["focus", "omit", "context"] {
        workspace::prepare(tmp.path(), &db, &r.id).unwrap();
        std::fs::write(dir.join("article.md"), "# Stale\n\nStale").unwrap();
        let mut changed = store::get(&db, &r.id).unwrap();
        match field {
            "focus" => changed.article_material.focus.push_str("追記"),
            "omit" => changed.article_material.omit.push_str("追記"),
            _ => changed.article_material.visit_context.push_str("追記"),
        }
        store::save(&mut db, changed, "material-edit").unwrap();
        assert!(workspace::import(tmp.path(), &mut db, &r.id)
            .unwrap_err()
            .contains("変更"));
    }
    assert_ne!(store::get(&db, &r.id).unwrap().title, "Stale");
}

// Older versions prepared JSON outputs. Keep that input fixture separate from chat requests.
fn use_legacy_tweet_output(dir: &std::path::Path) {
    let path = dir.join("input.json");
    let mut input: serde_json::Value =
        serde_json::from_slice(&std::fs::read(&path).unwrap()).unwrap();
    input["outputs"] = json!({"tweet":"tweet.json"});
    std::fs::write(path, serde_json::to_vec_pretty(&input).unwrap()).unwrap();
}

#[test]
fn tweet_only_uses_existing_body_preserves_article_files_and_imports_no_opening() {
    let tmp = tempfile::tempdir().unwrap();
    let mut db = store::open(tmp.path()).unwrap();
    let mut r = review();
    r.notes = Notes::default();
    r.sharing.opening = "添削済みの冒頭".into();
    r.sharing.include_opening = false;
    let r = store::save(&mut db, r, "existing-article").unwrap();
    let dir = workspace::folder(tmp.path(), &r.id).unwrap();
    std::fs::create_dir_all(&dir).unwrap();
    std::fs::write(dir.join("article.md"), "Keep this original article file").unwrap();
    std::fs::write(dir.join("sharing.json"), "Keep this original sharing file").unwrap();
    std::fs::write(dir.join("tweet.json"), "Old tweet output").unwrap();
    workspace::prepare_tweet(tmp.path(), &db, &r.id).unwrap();
    assert_eq!(
        std::fs::read_to_string(dir.join("article.md")).unwrap(),
        "Keep this original article file"
    );
    assert_eq!(
        std::fs::read_to_string(dir.join("sharing.json")).unwrap(),
        "Keep this original sharing file"
    );
    assert_eq!(
        std::fs::read_to_string(dir.join("tweet.json")).unwrap(),
        "Old tweet output"
    );
    let input: serde_json::Value =
        serde_json::from_slice(&std::fs::read(dir.join("input.json")).unwrap()).unwrap();
    assert_eq!(input["generationMode"], "tweet-only");
    assert_eq!(input["outputs"], json!({"chat":"complete-tweet"}));
    assert_eq!(input["review"]["body"], r.body);
    let request = std::fs::read_to_string(dir.join("request.md")).unwrap();
    assert!(request.contains("チャット本文に直接表示"));
    assert!(request.contains("communication.footer"));
    assert!(workspace::import(tmp.path(), &mut db, &r.id)
        .unwrap_err()
        .contains("ツイート専用"));
    std::fs::write(
        dir.join("tweet.json"),
        r#"{"tweet":"新しいツイート本文。"}"#,
    )
    .unwrap();
    assert!(workspace::import_tweet(tmp.path(), &mut db, &r.id)
        .unwrap_err()
        .contains("チャット出力"));
    use_legacy_tweet_output(&dir);
    let imported = workspace::import_tweet(tmp.path(), &mut db, &r.id).unwrap();
    assert_eq!(imported.sharing.tweet, "新しいツイート本文。");
    assert_eq!(imported.body, r.body);
    assert_eq!(imported.title, r.title);
    assert_eq!(imported.sharing.opening, r.sharing.opening);
    assert_eq!(imported.sharing.include_opening, r.sharing.include_opening);
    assert_eq!(
        std::fs::read_to_string(dir.join("article.md")).unwrap(),
        "Keep this original article file"
    );
}

#[test]
fn sar_only_tweet_needs_no_article_and_rejects_invalid_or_stale_outputs() {
    let tmp = tempfile::tempdir().unwrap();
    let mut db = store::open(tmp.path()).unwrap();
    let mut r = review();
    r.notes = Notes::default();
    r.body.clear();
    r.title.clear();
    r.experience.scene = "雨の図書室".into();
    let mut r = store::save(&mut db, r, "sar-only").unwrap();
    let dir = workspace::folder(tmp.path(), &r.id).unwrap();
    workspace::prepare_tweet(tmp.path(), &db, &r.id).unwrap();
    use_legacy_tweet_output(&dir);
    assert!(!dir.join("article.md").exists());
    assert!(workspace::import_tweet(tmp.path(), &mut db, &r.id).is_err());
    for invalid in [
        "not json",
        r#"{"tweet":""}"#,
        r#"{"tweet":"x","opening":"unexpected"}"#,
    ] {
        std::fs::write(dir.join("tweet.json"), invalid).unwrap();
        assert!(workspace::import_tweet(tmp.path(), &mut db, &r.id).is_err());
        assert_eq!(store::get(&db, &r.id).unwrap().revision, r.revision);
    }
    std::fs::write(dir.join("tweet.json"), r#"{"tweet":"雨の図書室。"}"#).unwrap();
    r = workspace::import_tweet(tmp.path(), &mut db, &r.id).unwrap();
    assert!(r.body.is_empty());
    assert!(r.title.is_empty());
    assert!(r.sharing.opening.is_empty());
    for field in ["sar", "body", "tweet"] {
        workspace::prepare_tweet(tmp.path(), &db, &r.id).unwrap();
        use_legacy_tweet_output(&dir);
        std::fs::write(dir.join("tweet.json"), r#"{"tweet":"Old output"}"#).unwrap();
        let mut changed = store::get(&db, &r.id).unwrap();
        match field {
            "sar" => changed.experience.action.push_str("散策"),
            "body" => changed.body.push_str("添削した本文"),
            _ => changed.sharing.tweet.push_str("添削"),
        }
        store::save(&mut db, changed, "manual").unwrap();
        assert!(workspace::import_tweet(tmp.path(), &mut db, &r.id)
            .unwrap_err()
            .contains("変更"));
    }
    workspace::prepare(tmp.path(), &db, &r.id).unwrap();
    assert!(workspace::import_tweet(tmp.path(), &mut db, &r.id)
        .unwrap_err()
        .contains("先に"));
}
