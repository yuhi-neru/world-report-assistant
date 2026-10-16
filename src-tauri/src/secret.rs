use crate::model::AppResult;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::{collections::BTreeMap, path::Path};

#[derive(Default, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase", default)]
pub struct Settings {
    pub hatena_id: String,
    pub blog_id: String,
    pub blog_key: String,
    pub photo_key: String,
    pub markdown_confirmed: bool,
    pub api_contact: String,
    pub cookies: BTreeMap<String, String>,
    #[cfg(test)]
    #[serde(skip)]
    pub test_blog_base: Option<String>,
    #[cfg(test)]
    #[serde(skip)]
    pub test_photo_post: Option<String>,
}
impl Settings {
    pub fn initial() -> Self {
        Self::default()
    }
    pub fn public(&self) -> Value {
        json!({"hatenaId":self.hatena_id,"blogId":self.blog_id,"hasBlogKey":!self.blog_key.is_empty(),"hasPhotoKey":!self.photo_key.is_empty(),"markdownConfirmed":self.markdown_confirmed,"apiContact":self.api_contact,"vrchatSaved":self.cookies.contains_key("auth")})
    }
    pub fn load(root: &Path) -> AppResult<Self> {
        let p = root.join("private/settings.bin");
        if !p.exists() {
            return Ok(Self::initial());
        }
        let bytes = std::fs::read(p).map_err(|_| "設定ファイルを読み込めませんでした")?;
        serde_json::from_slice(&protect(&bytes, false)?)
            .map_err(|_| "保存した設定を復元できませんでした".into())
    }
    pub fn save(&self, root: &Path) -> AppResult<()> {
        std::fs::create_dir_all(root.join("private")).map_err(|e| e.to_string())?;
        let enc = protect(&serde_json::to_vec(self).map_err(|e| e.to_string())?, true)?;
        let tmp = root.join("private/settings.tmp");
        std::fs::write(&tmp, enc).map_err(|_| "設定を保存できませんでした")?;
        std::fs::rename(tmp, root.join("private/settings.bin"))
            .map_err(|_| "設定を確定できませんでした".into())
    }
    pub fn update(&mut self, v: &Value) -> AppResult<()> {
        let s = |key: &str| v[key].as_str().unwrap_or_default().trim().to_owned();
        let id = s("hatenaId");
        let blog = s("blogId");
        if !id
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || b"_-".contains(&b))
            || id.len() > 64
        {
            return Err("はてなIDの形式を確認してください".into());
        }
        if !blog.is_empty() {
            let u = reqwest::Url::parse(&format!("https://{blog}/"))
                .map_err(|_| "ブログIDはドメイン名だけを入力してください")?;
            if u.host_str() != Some(blog.as_str())
                || blog.len() > 253
                || !blog.contains('.')
                || !u.username().is_empty()
                || u.password().is_some()
                || u.port().is_some()
            {
                return Err("ブログIDは管理画面のAtomPub欄にあるブログIDを入力してください".into());
            }
        }
        let contact = s("apiContact");
        if contact.len() > 256 || contact.chars().any(char::is_control) {
            return Err("連絡先の形式を確認してください".into());
        }
        self.hatena_id = id;
        self.blog_id = blog;
        self.api_contact = contact;
        self.markdown_confirmed = v["markdownConfirmed"].as_bool().unwrap_or(false);
        for (key, target) in [
            ("blogKey", &mut self.blog_key),
            ("photoKey", &mut self.photo_key),
        ] {
            let mut val = s(key);
            if val.contains('@') {
                let (local, domain) = val
                    .split_once('@')
                    .ok_or("投稿用メールアドレスの形式を確認してください")?;
                if !matches!(domain, "f.hatena.ne.jp" | "blog.hatena.ne.jp") {
                    return Err(
                        "はてなの投稿用メールアドレス、またはAPIキーを入力してください".into(),
                    );
                }
                val = local.split(['.', '+']).next().unwrap_or_default().into();
            }
            if val.len() > 512
                || !val
                    .bytes()
                    .all(|b| b.is_ascii_alphanumeric() || b"_-".contains(&b))
            {
                return Err("APIキーの形式を確認してください".into());
            }
            if !val.is_empty() {
                *target = val;
            }
        }
        Ok(())
    }
    pub fn blog_base(&self) -> AppResult<String> {
        if self.hatena_id.is_empty() || self.blog_id.is_empty() || self.blog_key.is_empty() {
            return Err("設定ではてなID・ブログID・ブログAPIキーを登録してください".into());
        }
        #[cfg(test)]
        if let Some(url) = &self.test_blog_base {
            return Ok(url.clone());
        }
        Ok(format!(
            "https://blog.hatena.ne.jp/{}/{}/atom/entry",
            self.hatena_id, self.blog_id
        ))
    }
}

#[cfg(windows)]
pub fn protect(bytes: &[u8], encrypt: bool) -> AppResult<Vec<u8>> {
    use windows_sys::Win32::{
        Foundation::LocalFree,
        Security::Cryptography::{
            CryptProtectData, CryptUnprotectData, CRYPTPROTECT_UI_FORBIDDEN, CRYPT_INTEGER_BLOB,
        },
    };
    let input = CRYPT_INTEGER_BLOB {
        cbData: bytes.len().try_into().map_err(|_| "設定が大きすぎます")?,
        pbData: bytes.as_ptr() as *mut u8,
    };
    let mut output = CRYPT_INTEGER_BLOB {
        cbData: 0,
        pbData: std::ptr::null_mut(),
    };
    unsafe {
        let ok = if encrypt {
            CryptProtectData(
                &input,
                std::ptr::null(),
                std::ptr::null(),
                std::ptr::null(),
                std::ptr::null(),
                CRYPTPROTECT_UI_FORBIDDEN,
                &mut output,
            )
        } else {
            CryptUnprotectData(
                &input,
                std::ptr::null_mut(),
                std::ptr::null(),
                std::ptr::null(),
                std::ptr::null(),
                CRYPTPROTECT_UI_FORBIDDEN,
                &mut output,
            )
        };
        if ok == 0 {
            return Err(
                "Windowsの暗号化設定を読み書きできません。元のWindowsユーザーで起動してください"
                    .into(),
            );
        }
        let result = std::slice::from_raw_parts(output.pbData, output.cbData as usize).to_vec();
        LocalFree(output.pbData as *mut _);
        Ok(result)
    }
}
#[cfg(not(windows))]
pub fn protect(_bytes: &[u8], _encrypt: bool) -> AppResult<Vec<u8>> {
    Err("秘密情報の保存はWindows版で利用できます".into())
}
