//! Offline cache for Strudel's built-in sounds (DECISIONS V15, T6.6).
//!
//! The drum machines (`strudel.b-cdn.net`), `github:` sample maps (`raw.githubusercontent.com`) and GM soundfonts
//! (`felixroos.github.io`) load over the network at runtime. The web view asks Rust to fetch a URL once; the file lands
//! in `<root>/.cache/sounds/<host>/<path>` and the web view then loads it through the asset protocol, so the app keeps
//! working offline after first use.
//!
//! Everything here takes explicit directories and is unit-tested against a local HTTP server; `commands.rs` adds the
//! Tauri glue (root resolution, asset scope, progress events).

use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex, Once, Weak};
use std::time::Duration;

use reqwest::redirect::Policy;
use serde::Serialize;
use tokio::io::AsyncWriteExt;
use tokio::sync::{Mutex as AsyncMutex, Semaphore};
use tokio::task::JoinSet;
use url::Url;
use walkdir::WalkDir;

use crate::error::{Error, IoContext, Result};

/// `<root>/.cache/sounds`
pub const CACHE_PARTS: [&str; 2] = [".cache", "sounds"];
pub const EVENT_PROGRESS: &str = "sound-cache://progress";

/// Hosts the cache will download from (and follow redirects to). `github.com` is here for its `/raw/` redirects.
pub const ALLOWED_HOSTS: [&str; 4] = [
    "strudel.b-cdn.net",
    "raw.githubusercontent.com",
    "felixroos.github.io",
    "github.com",
];

/// Parallel downloads during a prefetch.
pub const PREFETCH_CONCURRENCY: usize = 6;
/// Largest file we cache (GM soundfonts are a few MB; this only stops a runaway response).
const MAX_FILE_BYTES: u64 = 128 * 1024 * 1024;
/// Most URLs one prefetch call accepts.
pub const MAX_PREFETCH_URLS: usize = 50_000;
const MAX_REDIRECTS: usize = 5;
const CONNECT_TIMEOUT: Duration = Duration::from_secs(10);
const REQUEST_TIMEOUT: Duration = Duration::from_secs(120);
/// Longest file-name stem kept verbatim; longer ones are truncated and get a hash suffix.
const MAX_STEM: usize = 80;
const PART_SUFFIX: &str = ".part";

/// `<root>/.cache/sounds`. Does not create it.
pub fn cache_dir(root: &Path) -> PathBuf {
    CACHE_PARTS
        .iter()
        .fold(root.to_path_buf(), |p, c| p.join(c))
}

// ── Host policy ─────────────────────────────────────────────────────────────

/// Which URLs may be requested, directly or through a redirect.
#[derive(Debug, Clone)]
pub struct HostPolicy {
    hosts: Arc<Vec<String>>,
    /// Tests talk to a loopback server over plain HTTP on an arbitrary port; production is https/443 only.
    insecure_for_tests: bool,
}

impl HostPolicy {
    pub fn builtin() -> Self {
        Self {
            hosts: Arc::new(ALLOWED_HOSTS.iter().map(|h| (*h).to_string()).collect()),
            insecure_for_tests: false,
        }
    }

    #[cfg(test)]
    fn for_tests(hosts: &[&str]) -> Self {
        Self {
            hosts: Arc::new(hosts.iter().map(|h| (*h).to_string()).collect()),
            insecure_for_tests: true,
        }
    }

    pub fn allows(&self, url: &Url) -> bool {
        let scheme_ok = match url.scheme() {
            "https" => true,
            "http" => self.insecure_for_tests,
            _ => false,
        };
        let port_ok = self.insecure_for_tests || url.port_or_known_default() == Some(443);
        let host_ok = url
            .host_str()
            .is_some_and(|h| self.hosts.iter().any(|a| a.eq_ignore_ascii_case(h)));
        scheme_ok && port_ok && host_ok && url.username().is_empty() && url.password().is_none()
    }

    /// Parse `raw` and require it to be allowed; anything else is `invalid_argument`.
    pub fn check(&self, raw: &str) -> Result<Url> {
        let url = Url::parse(raw)
            .map_err(|e| Error::InvalidArgument(format!("invalid sound URL {raw:?}: {e}")))?;
        if self.allows(&url) {
            Ok(url)
        } else {
            Err(Error::InvalidArgument(format!(
                "sound URL not allowed (host must be one of {}, over https): {raw}",
                ALLOWED_HOSTS.join(", ")
            )))
        }
    }
}

// ── Path derivation ─────────────────────────────────────────────────────────

/// FNV-1a 64, hex. Stable across Rust versions (unlike `DefaultHasher`), which matters for an on-disk cache.
fn short_hash(text: &str) -> String {
    let mut h: u64 = 0xcbf2_9ce4_8422_2325;
    for b in text.as_bytes() {
        h ^= u64::from(*b);
        h = h.wrapping_mul(0x0100_0000_01b3);
    }
    format!("{h:016x}")[..10].to_string()
}

fn sanitize_chars(text: &str) -> String {
    text.chars()
        .map(|c| {
            if c.is_ascii_alphanumeric() || matches!(c, '.' | '_' | '-') {
                c
            } else {
                '_'
            }
        })
        .collect()
}

/// A single path segment as a safe file name. Percent-decodes, replaces anything outside `[A-Za-z0-9._-]`, never
/// starts with a dot, and is never `.`/`..`. Whenever that changed the name, or a query string is present, a hash
/// of the *original* segment (plus query) is appended before the extension so distinct URLs stay distinct.
fn segment_name(raw: &str, query: Option<&str>) -> String {
    let decoded = percent_encoding_decode(raw);
    let mut name = sanitize_chars(&decoded);
    if name.starts_with('.') {
        name.replace_range(0..1, "_");
    }
    if name.is_empty() {
        name = "index".into();
    }
    let mut changed = name != raw || query.is_some();

    let (stem, ext) = match name.rsplit_once('.') {
        Some((stem, ext)) if !stem.is_empty() && !ext.is_empty() && ext.len() <= 8 => {
            (stem.to_string(), format!(".{ext}"))
        }
        _ => (name.clone(), String::new()),
    };
    let mut stem = stem;
    if stem.len() > MAX_STEM {
        stem.truncate(MAX_STEM);
        changed = true;
    }
    if changed {
        let key = format!("{raw}?{}", query.unwrap_or(""));
        format!("{stem}~{}{ext}", short_hash(&key))
    } else {
        format!("{stem}{ext}")
    }
}

/// Minimal percent-decoding (`%XX`, lossy UTF-8); invalid escapes stay literal.
fn percent_encoding_decode(text: &str) -> String {
    let bytes = text.as_bytes();
    let mut out = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'%'
            && i + 2 < bytes.len()
            && let (Some(h), Some(l)) = (hex_val(bytes[i + 1]), hex_val(bytes[i + 2]))
        {
            out.push(h * 16 + l);
            i += 3;
            continue;
        }
        out.push(bytes[i]);
        i += 1;
    }
    String::from_utf8_lossy(&out).into_owned()
}

fn hex_val(b: u8) -> Option<u8> {
    match b {
        b'0'..=b'9' => Some(b - b'0'),
        b'a'..=b'f' => Some(b - b'a' + 10),
        b'A'..=b'F' => Some(b - b'A' + 10),
        _ => None,
    }
}

/// Where `url` is cached under `dir`: `<dir>/<host>/<sanitized path>`; the last segment carries the hash suffix
/// described on `segment_name`. A trailing slash or empty path maps to `index`. Always strictly inside `dir`.
pub fn cache_path(dir: &Path, url: &Url) -> PathBuf {
    let host = sanitize_chars(&url.host_str().unwrap_or("unknown").to_ascii_lowercase());
    let host = match url.port() {
        Some(port) => format!("{host}_{port}"),
        None => host,
    };
    let mut path = dir.join(host);
    let mut segments: Vec<&str> = url
        .path_segments()
        .map(|s| s.filter(|seg| !seg.is_empty()).collect())
        .unwrap_or_default();
    let trailing_slash = url.path().ends_with('/');
    if segments.is_empty() || trailing_slash {
        segments.push("");
    }
    let last = segments.len() - 1;
    for (i, seg) in segments.iter().enumerate() {
        let query = if i == last { url.query() } else { None };
        path.push(segment_name(seg, query));
    }
    path
}

// ── Cache ───────────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Copy, Default, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct CacheStatus {
    pub files: u64,
    pub bytes: u64,
}

/// `sound-cache://progress` payload and the result of a prefetch. `done` counts finished files, failures included.
#[derive(Debug, Clone, Copy, Default, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct Progress {
    pub done: usize,
    pub total: usize,
    pub failed: usize,
}

fn install_crypto_provider() {
    static ONCE: Once = Once::new();
    ONCE.call_once(|| {
        let _ = rustls::crypto::ring::default_provider().install_default();
    });
}

/// Downloader with per-file dedupe. Cheap to share: wrap in an `Arc`.
pub struct SoundCache {
    client: reqwest::Client,
    policy: HostPolicy,
    /// One lock per destination file so concurrent requests for the same URL share a single download.
    locks: Mutex<HashMap<PathBuf, Weak<AsyncMutex<()>>>>,
    temp_counter: AtomicU64,
}

impl SoundCache {
    pub fn new() -> Result<Self> {
        Self::build(HostPolicy::builtin(), false)
    }

    #[cfg(test)]
    fn for_tests(policy: HostPolicy) -> Self {
        Self::build(policy, true).expect("client")
    }

    fn build(policy: HostPolicy, no_proxy: bool) -> Result<Self> {
        install_crypto_provider();
        let redirect_policy = policy.clone();
        let mut builder = reqwest::Client::builder()
            .user_agent(concat!("Phyllo/", env!("CARGO_PKG_VERSION")))
            .connect_timeout(CONNECT_TIMEOUT)
            .timeout(REQUEST_TIMEOUT)
            .redirect(Policy::custom(move |attempt| {
                if attempt.previous().len() >= MAX_REDIRECTS {
                    attempt.error("too many redirects")
                } else if redirect_policy.allows(attempt.url()) {
                    attempt.follow()
                } else {
                    let target = attempt.url().to_string();
                    attempt.error(format!("redirect to a host that is not allowed: {target}"))
                }
            }));
        if no_proxy {
            builder = builder.no_proxy();
        }
        let client = builder
            .build()
            .map_err(|e| Error::Network(format!("cannot create HTTP client: {e}")))?;
        Ok(Self {
            client,
            policy,
            locks: Mutex::new(HashMap::new()),
            temp_counter: AtomicU64::new(0),
        })
    }

    pub fn policy(&self) -> &HostPolicy {
        &self.policy
    }

    fn lock_for(&self, dest: &Path) -> Arc<AsyncMutex<()>> {
        let mut locks = self.locks.lock().unwrap_or_else(|e| e.into_inner());
        if let Some(lock) = locks.get(dest).and_then(Weak::upgrade) {
            return lock;
        }
        locks.retain(|_, w| w.strong_count() > 0);
        let lock = Arc::new(AsyncMutex::new(()));
        locks.insert(dest.to_path_buf(), Arc::downgrade(&lock));
        lock
    }

    /// The cached file for `url`, downloading it first if needed. Concurrent calls for one URL download once.
    pub async fn fetch(&self, dir: &Path, url: &str) -> Result<PathBuf> {
        let url = self.policy.check(url)?;
        let dest = cache_path(dir, &url);
        if is_cached(&dest) {
            return Ok(dest);
        }
        let lock = self.lock_for(&dest);
        let _guard = lock.lock().await;
        if is_cached(&dest) {
            return Ok(dest);
        }
        self.download(&url, &dest).await?;
        Ok(dest)
    }

    async fn download(&self, url: &Url, dest: &Path) -> Result<()> {
        let net = |e: reqwest::Error| Error::Network(format!("{url}: {}", error_chain(&e)));
        let mut response = self.client.get(url.clone()).send().await.map_err(net)?;
        let status = response.status();
        if !status.is_success() {
            return Err(Error::Network(format!("{url}: HTTP {status}")));
        }
        let expected = if response
            .headers()
            .contains_key(reqwest::header::CONTENT_ENCODING)
        {
            None
        } else {
            response.content_length()
        };
        if expected.is_some_and(|len| len > MAX_FILE_BYTES) {
            return Err(Error::Network(format!(
                "{url}: file is larger than the cache limit"
            )));
        }

        let parent = dest.parent().unwrap_or(dest);
        tokio::fs::create_dir_all(parent).await.at(parent)?;
        let tmp = self.temp_path(dest);
        let outcome = async {
            let mut file = tokio::fs::File::create(&tmp).await.at(&tmp)?;
            let mut total: u64 = 0;
            while let Some(chunk) = response.chunk().await.map_err(net)? {
                total += chunk.len() as u64;
                if total > MAX_FILE_BYTES {
                    return Err(Error::Network(format!(
                        "{url}: file is larger than the cache limit"
                    )));
                }
                file.write_all(&chunk).await.at(&tmp)?;
            }
            if let Some(len) = expected
                && len != total
            {
                return Err(Error::Network(format!(
                    "{url}: truncated download ({total} of {len} bytes)"
                )));
            }
            file.flush().await.at(&tmp)?;
            file.sync_all().await.at(&tmp)?;
            drop(file);
            // Atomic within one directory: readers see either no file or the whole file.
            tokio::fs::rename(&tmp, dest).await.at(dest)
        }
        .await;
        if outcome.is_err() {
            let _ = tokio::fs::remove_file(&tmp).await;
        }
        outcome
    }

    fn temp_path(&self, dest: &Path) -> PathBuf {
        let n = self.temp_counter.fetch_add(1, Ordering::Relaxed);
        let name = dest
            .file_name()
            .map(|n| n.to_string_lossy())
            .unwrap_or_default();
        dest.with_file_name(format!(".{name}.{}.{n}{PART_SUFFIX}", std::process::id()))
    }

    /// Download every URL into the cache with bounded concurrency, calling `on_progress` after each file.
    /// Every URL is validated first, so one disallowed URL rejects the whole call before any download starts.
    /// Individual download failures are counted in `failed`, not returned.
    pub async fn prefetch(
        self: &Arc<Self>,
        dir: &Path,
        urls: &[String],
        on_progress: impl Fn(Progress) + Send + Sync + 'static,
    ) -> Result<Progress> {
        if urls.len() > MAX_PREFETCH_URLS {
            return Err(Error::InvalidArgument(format!(
                "too many URLs ({}; the limit is {MAX_PREFETCH_URLS})",
                urls.len()
            )));
        }
        let mut unique: Vec<String> = Vec::with_capacity(urls.len());
        let mut seen = std::collections::HashSet::new();
        for raw in urls {
            let url = self.policy.check(raw)?;
            if seen.insert(url.to_string()) {
                unique.push(raw.clone());
            }
        }

        let on_progress = Arc::new(on_progress);
        let total = unique.len();
        let permits = Arc::new(Semaphore::new(PREFETCH_CONCURRENCY));
        let progress = Arc::new(Mutex::new(Progress {
            done: 0,
            total,
            failed: 0,
        }));
        on_progress(Progress {
            done: 0,
            total,
            failed: 0,
        });

        let mut tasks = JoinSet::new();
        for raw in unique {
            let cache = Arc::clone(self);
            let permits = Arc::clone(&permits);
            let progress = Arc::clone(&progress);
            let on_progress = Arc::clone(&on_progress);
            let dir = dir.to_path_buf();
            tasks.spawn(async move {
                let _permit = permits.acquire().await;
                let ok = cache.fetch(&dir, &raw).await.is_ok();
                let snapshot = {
                    let mut p = progress.lock().unwrap_or_else(|e| e.into_inner());
                    p.done += 1;
                    if !ok {
                        p.failed += 1;
                    }
                    *p
                };
                on_progress(snapshot);
            });
        }
        while let Some(joined) = tasks.join_next().await {
            joined.map_err(|e| Error::Internal(format!("prefetch task: {e}")))?;
        }
        let last = *progress.lock().unwrap_or_else(|e| e.into_inner());
        Ok(last)
    }
}

fn is_cached(path: &Path) -> bool {
    std::fs::metadata(path).is_ok_and(|m| m.is_file() && m.len() > 0)
}

/// `reqwest` errors hide the useful cause (DNS, TLS, refused) one level down.
fn error_chain(err: &dyn std::error::Error) -> String {
    let mut text = err.to_string();
    let mut source = err.source();
    while let Some(inner) = source {
        text.push_str(": ");
        text.push_str(&inner.to_string());
        source = inner.source();
    }
    text
}

/// Count the finished files under `dir` (partial `.part` downloads excluded). A missing directory is empty.
pub fn status(dir: &Path) -> Result<CacheStatus> {
    if !dir.exists() {
        return Ok(CacheStatus::default());
    }
    let mut out = CacheStatus::default();
    for entry in WalkDir::new(dir) {
        let entry = entry.map_err(|e| Error::Internal(format!("{}: {e}", dir.display())))?;
        if !entry.file_type().is_file()
            || entry.file_name().to_string_lossy().ends_with(PART_SUFFIX)
        {
            continue;
        }
        out.files += 1;
        out.bytes += entry.metadata().map(|m| m.len()).unwrap_or(0);
    }
    Ok(out)
}

/// Delete the whole cache directory. Refuses a path that is not a `.cache/sounds` directory.
pub fn clear(dir: &Path) -> Result<()> {
    if !dir.ends_with(Path::new(CACHE_PARTS[0]).join(CACHE_PARTS[1])) {
        return Err(Error::InvalidArgument(format!(
            "not a sound cache directory: {}",
            dir.display()
        )));
    }
    match std::fs::remove_dir_all(dir) {
        Ok(()) => Ok(()),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(e) => Err(e).at(dir),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::{BufRead, BufReader, Read, Write};
    use std::net::TcpListener;
    use std::sync::atomic::AtomicUsize;

    // ── allowlist ──

    fn builtin() -> HostPolicy {
        HostPolicy::builtin()
    }

    #[test]
    fn allowlist_accepts_the_builtin_hosts_over_https() {
        for raw in [
            "https://strudel.b-cdn.net/tidal-drum-machines.json",
            "https://raw.githubusercontent.com/tidalcycles/Dirt-Samples/master/bd/BT0A0A7.wav",
            "https://felixroos.github.io/webaudiofontdata/sound/0000_JCLive_sf2_file.js",
            "https://github.com/u/r/raw/main/x.wav",
            "https://STRUDEL.b-cdn.net/x.json",
        ] {
            assert!(builtin().check(raw).is_ok(), "{raw}");
        }
    }

    #[test]
    fn allowlist_rejects_everything_else_as_invalid_argument() {
        for raw in [
            "http://strudel.b-cdn.net/x.json",
            "https://evil.example/x.json",
            "https://strudel.b-cdn.net.evil.example/x.json",
            "https://evil.example/https://strudel.b-cdn.net/x.json",
            "https://user:pw@strudel.b-cdn.net/x.json",
            "https://strudel.b-cdn.net:8443/x.json",
            "https://127.0.0.1/x.json",
            "file:///etc/passwd",
            "ftp://strudel.b-cdn.net/x",
            "not a url",
            "",
        ] {
            let err = builtin().check(raw).unwrap_err();
            assert_eq!(err.code(), "invalid_argument", "{raw}");
        }
    }

    // ── path derivation ──

    fn path_for(raw: &str) -> PathBuf {
        cache_path(Path::new("/c"), &Url::parse(raw).unwrap())
    }

    #[test]
    fn path_is_host_plus_path() {
        assert_eq!(
            path_for("https://strudel.b-cdn.net/tidal-drum-machines/machines/RolandTR909/bd.wav"),
            Path::new("/c/strudel.b-cdn.net/tidal-drum-machines/machines/RolandTR909/bd.wav")
        );
        assert_eq!(
            path_for("https://strudel.b-cdn.net/piano.json"),
            Path::new("/c/strudel.b-cdn.net/piano.json")
        );
    }

    #[test]
    fn unsafe_characters_are_replaced_and_hashed() {
        let p = path_for("https://strudel.b-cdn.net/VCSL/Clap%20Hands/a%20b.wav");
        let rel = p.strip_prefix("/c/strudel.b-cdn.net/VCSL").unwrap();
        let parts: Vec<String> = rel
            .components()
            .map(|c| c.as_os_str().to_string_lossy().into_owned())
            .collect();
        assert_eq!(parts.len(), 2);
        assert!(
            parts[0].starts_with("Clap_Hands~") && !parts[0].contains(' '),
            "{parts:?}"
        );
        assert!(
            parts[1].starts_with("a_b~") && parts[1].ends_with(".wav"),
            "{parts:?}"
        );
        // "a b" and "a_b" must not collide.
        assert_ne!(
            path_for("https://strudel.b-cdn.net/a%20b.wav"),
            path_for("https://strudel.b-cdn.net/a_b.wav")
        );
    }

    #[test]
    fn query_strings_get_a_hash_suffix_before_the_extension() {
        let a = path_for("https://strudel.b-cdn.net/x.json?v=1");
        let b = path_for("https://strudel.b-cdn.net/x.json?v=2");
        let plain = path_for("https://strudel.b-cdn.net/x.json");
        assert_ne!(a, b);
        assert_ne!(a, plain);
        let name = a.file_name().unwrap().to_string_lossy().into_owned();
        assert!(name.starts_with("x~") && name.ends_with(".json"), "{name}");
        assert_eq!(
            a,
            path_for("https://strudel.b-cdn.net/x.json?v=1"),
            "stable"
        );
    }

    #[test]
    fn traversal_and_dotfiles_stay_inside_the_cache() {
        for raw in [
            "https://strudel.b-cdn.net/%2e%2e/%2e%2e/etc/passwd",
            "https://strudel.b-cdn.net/a/..%2f..%2fb",
            "https://strudel.b-cdn.net/..%5c..%5cx",
            "https://strudel.b-cdn.net/a/../../b",
            "https://strudel.b-cdn.net/.hidden/.env",
            "https://strudel.b-cdn.net/%00x",
        ] {
            let p = path_for(raw);
            assert!(p.starts_with("/c/strudel.b-cdn.net"), "{raw} -> {p:?}");
            for c in p.strip_prefix("/c").unwrap().components() {
                let s = c.as_os_str().to_string_lossy();
                assert!(!s.starts_with('.') && s != "..", "{raw} -> {p:?}");
            }
        }
    }

    #[test]
    fn trailing_slash_and_long_names_are_handled() {
        // Hashed, so a real `/dir/index` URL can't be mistaken for the directory URL.
        for (raw, dir) in [
            ("https://strudel.b-cdn.net/dir/", "/c/strudel.b-cdn.net/dir"),
            ("https://strudel.b-cdn.net/", "/c/strudel.b-cdn.net"),
        ] {
            let p = path_for(raw);
            assert_eq!(p.parent().unwrap(), Path::new(dir), "{raw}");
            assert!(
                p.file_name()
                    .unwrap()
                    .to_string_lossy()
                    .starts_with("index~")
            );
        }
        assert_ne!(
            path_for("https://strudel.b-cdn.net/dir/"),
            path_for("https://strudel.b-cdn.net/dir/index")
        );
        let long = format!("https://strudel.b-cdn.net/{}.wav", "x".repeat(300));
        let name = path_for(&long)
            .file_name()
            .unwrap()
            .to_string_lossy()
            .into_owned();
        assert!(name.len() < 110 && name.ends_with(".wav"), "{name}");
    }

    // ── local test server ──

    struct Reply {
        status: u16,
        headers: Vec<(String, String)>,
        body: Vec<u8>,
        delay_ms: u64,
        /// Declared Content-Length when it should lie about the body.
        declared_len: Option<usize>,
    }

    impl Reply {
        fn ok(body: &[u8]) -> Self {
            Self {
                status: 200,
                headers: vec![],
                body: body.to_vec(),
                delay_ms: 0,
                declared_len: None,
            }
        }
    }

    struct TestServer {
        port: u16,
        hits: Arc<AtomicUsize>,
    }

    impl TestServer {
        fn start(handler: impl Fn(&str) -> Reply + Send + Sync + 'static) -> Self {
            let listener = TcpListener::bind("127.0.0.1:0").unwrap();
            let port = listener.local_addr().unwrap().port();
            let hits = Arc::new(AtomicUsize::new(0));
            let handler = Arc::new(handler);
            let count = Arc::clone(&hits);
            std::thread::spawn(move || {
                for stream in listener.incoming() {
                    let Ok(mut stream) = stream else { continue };
                    let handler = Arc::clone(&handler);
                    let count = Arc::clone(&count);
                    std::thread::spawn(move || {
                        let mut reader = BufReader::new(stream.try_clone().unwrap());
                        let mut request_line = String::new();
                        reader.read_line(&mut request_line).unwrap();
                        loop {
                            let mut line = String::new();
                            if reader.read_line(&mut line).unwrap_or(0) == 0 || line == "\r\n" {
                                break;
                            }
                        }
                        let path = request_line.split_whitespace().nth(1).unwrap_or("/");
                        count.fetch_add(1, Ordering::SeqCst);
                        let reply = handler(path);
                        std::thread::sleep(Duration::from_millis(reply.delay_ms));
                        let mut head =
                            format!("HTTP/1.1 {} X\r\nConnection: close\r\n", reply.status);
                        for (k, v) in &reply.headers {
                            head.push_str(&format!("{k}: {v}\r\n"));
                        }
                        head.push_str(&format!(
                            "Content-Length: {}\r\n\r\n",
                            reply.declared_len.unwrap_or(reply.body.len())
                        ));
                        let _ = stream.write_all(head.as_bytes());
                        let _ = stream.write_all(&reply.body);
                        let _ = stream.flush();
                        // Half-close so a short body reads as EOF, then wait for the client to hang up.
                        let _ = stream.shutdown(std::net::Shutdown::Write);
                        let mut sink = [0u8; 64];
                        while stream.read(&mut sink).unwrap_or(0) > 0 {}
                    });
                }
            });
            Self { port, hits }
        }

        fn url(&self, path: &str) -> String {
            format!("http://127.0.0.1:{}{path}", self.port)
        }

        fn hits(&self) -> usize {
            self.hits.load(Ordering::SeqCst)
        }
    }

    fn test_cache() -> Arc<SoundCache> {
        Arc::new(SoundCache::for_tests(HostPolicy::for_tests(&["127.0.0.1"])))
    }

    fn files_under(dir: &Path) -> Vec<String> {
        let mut out: Vec<String> = WalkDir::new(dir)
            .into_iter()
            .filter_map(|e| e.ok())
            .filter(|e| e.file_type().is_file())
            .map(|e| e.file_name().to_string_lossy().into_owned())
            .collect();
        out.sort();
        out
    }

    // ── download behaviour ──

    #[tokio::test]
    async fn downloads_once_then_serves_from_disk() {
        let server = TestServer::start(|_| Reply::ok(b"RIFFdata"));
        let dir = tempfile::tempdir().unwrap();
        let cache = test_cache();
        let url = server.url("/kits/bd.wav");

        let path = cache.fetch(dir.path(), &url).await.unwrap();
        assert_eq!(std::fs::read(&path).unwrap(), b"RIFFdata");
        assert!(path.starts_with(dir.path().join(format!("127.0.0.1_{}", server.port))));
        let again = cache.fetch(dir.path(), &url).await.unwrap();
        assert_eq!(again, path);
        assert_eq!(server.hits(), 1);
        assert_eq!(
            files_under(dir.path()),
            vec!["bd.wav"],
            "no temp files left"
        );
    }

    #[tokio::test]
    async fn concurrent_requests_for_one_url_share_one_download() {
        let server = TestServer::start(|_| Reply {
            delay_ms: 200,
            ..Reply::ok(b"shared")
        });
        let dir = tempfile::tempdir().unwrap();
        let cache = test_cache();
        let url = server.url("/slow.wav");

        let mut tasks = JoinSet::new();
        for _ in 0..10 {
            let cache = Arc::clone(&cache);
            let url = url.clone();
            let dir = dir.path().to_path_buf();
            tasks.spawn(async move { cache.fetch(&dir, &url).await.unwrap() });
        }
        let mut paths = Vec::new();
        while let Some(p) = tasks.join_next().await {
            paths.push(p.unwrap());
        }
        assert!(paths.iter().all(|p| p == &paths[0]));
        assert_eq!(std::fs::read(&paths[0]).unwrap(), b"shared");
        assert_eq!(server.hits(), 1);
        assert!(
            cache
                .locks
                .lock()
                .unwrap()
                .values()
                .all(|w| w.strong_count() == 0)
        );
    }

    #[tokio::test]
    async fn failed_downloads_leave_nothing_behind_and_can_retry() {
        let ok = Arc::new(std::sync::atomic::AtomicBool::new(false));
        let flag = Arc::clone(&ok);
        let server = TestServer::start(move |path| match path {
            "/trunc.wav" => Reply {
                declared_len: Some(100),
                ..Reply::ok(b"short")
            },
            "/missing.wav" => Reply {
                status: 404,
                ..Reply::ok(b"nope")
            },
            _ if flag.load(Ordering::SeqCst) => Reply::ok(b"fine"),
            _ => Reply {
                status: 503,
                ..Reply::ok(b"")
            },
        });
        let dir = tempfile::tempdir().unwrap();
        let cache = test_cache();

        for path in ["/trunc.wav", "/missing.wav", "/flaky.wav"] {
            let err = cache
                .fetch(dir.path(), &server.url(path))
                .await
                .unwrap_err();
            assert_eq!(err.code(), "network", "{path}: {err}");
        }
        assert_eq!(files_under(dir.path()), Vec::<String>::new());

        ok.store(true, Ordering::SeqCst);
        let path = cache
            .fetch(dir.path(), &server.url("/flaky.wav"))
            .await
            .unwrap();
        assert_eq!(std::fs::read(path).unwrap(), b"fine");
    }

    /// Real TLS (rustls + ring + platform verifier) against Strudel's CDN. Run with `cargo test -- --ignored`.
    #[tokio::test]
    #[ignore = "needs network access"]
    async fn live_fetch_from_the_strudel_cdn() {
        let dir = tempfile::tempdir().unwrap();
        let cache = Arc::new(SoundCache::new().unwrap());
        let path = cache
            .fetch(dir.path(), "https://strudel.b-cdn.net/piano.json")
            .await
            .unwrap();
        let json: serde_json::Value =
            serde_json::from_slice(&std::fs::read(path).unwrap()).unwrap();
        assert!(json.is_object());
    }

    #[tokio::test]
    async fn rejects_disallowed_urls_without_touching_the_network() {
        let dir = tempfile::tempdir().unwrap();
        let cache = Arc::new(SoundCache::new().unwrap());
        let err = cache
            .fetch(dir.path(), "https://evil.example/x.wav")
            .await
            .unwrap_err();
        assert_eq!(err.code(), "invalid_argument");
        assert!(!dir.path().join("evil.example").exists());
    }

    #[tokio::test]
    async fn follows_redirects_only_to_allowed_hosts() {
        let server = TestServer::start(|path| match path {
            "/to-ok" => Reply {
                status: 302,
                headers: vec![("Location".into(), "/final.wav".into())],
                ..Reply::ok(b"")
            },
            "/final.wav" => Reply::ok(b"redirected"),
            // `localhost` resolves to the same server but is not on the allowlist.
            "/to-evil" => Reply {
                status: 302,
                headers: vec![("Location".into(), "http://localhost:1/x.wav".into())],
                ..Reply::ok(b"")
            },
            "/loop" => Reply {
                status: 302,
                headers: vec![("Location".into(), "/loop".into())],
                ..Reply::ok(b"")
            },
            _ => Reply {
                status: 404,
                ..Reply::ok(b"")
            },
        });
        let dir = tempfile::tempdir().unwrap();
        let cache = test_cache();

        let path = cache
            .fetch(dir.path(), &server.url("/to-ok"))
            .await
            .unwrap();
        assert_eq!(std::fs::read(path).unwrap(), b"redirected");
        for p in ["/to-evil", "/loop"] {
            let err = cache.fetch(dir.path(), &server.url(p)).await.unwrap_err();
            assert_eq!(err.code(), "network", "{p}");
        }
    }

    #[tokio::test]
    async fn query_urls_are_cached_separately() {
        let server = TestServer::start(|path| Reply::ok(path.as_bytes()));
        let dir = tempfile::tempdir().unwrap();
        let cache = test_cache();
        let a = cache
            .fetch(dir.path(), &server.url("/m.json?v=1"))
            .await
            .unwrap();
        let b = cache
            .fetch(dir.path(), &server.url("/m.json?v=2"))
            .await
            .unwrap();
        assert_ne!(a, b);
        assert_eq!(std::fs::read(a).unwrap(), b"/m.json?v=1");
        assert_eq!(std::fs::read(b).unwrap(), b"/m.json?v=2");
    }

    // ── prefetch / status / clear ──

    #[tokio::test]
    async fn prefetch_reports_progress_counts_failures_and_skips_cached() {
        let server = TestServer::start(|path| {
            if path.contains("bad") {
                Reply {
                    status: 404,
                    ..Reply::ok(b"")
                }
            } else {
                Reply::ok(b"0123456789")
            }
        });
        let dir = tempfile::tempdir().unwrap();
        let cache = test_cache();
        let mut urls: Vec<String> = (0..20)
            .map(|i| server.url(&format!("/s/{i}.wav")))
            .collect();
        urls.push(server.url("/s/bad.wav"));
        urls.push(server.url("/s/0.wav")); // duplicate

        let events = Arc::new(Mutex::new(Vec::<Progress>::new()));
        let sink = Arc::clone(&events);
        let result = cache
            .prefetch(dir.path(), &urls, move |p| sink.lock().unwrap().push(p))
            .await
            .unwrap();
        assert_eq!(
            result,
            Progress {
                done: 21,
                total: 21,
                failed: 1
            }
        );
        let events = events.lock().unwrap().clone();
        assert_eq!(
            events.first(),
            Some(&Progress {
                done: 0,
                total: 21,
                failed: 0
            })
        );
        assert_eq!(events.last(), Some(&result));
        assert_eq!(events.len(), 22);
        assert!(events.windows(2).all(|w| w[0].done <= w[1].done));
        assert_eq!(
            status(dir.path()).unwrap(),
            CacheStatus {
                files: 20,
                bytes: 200
            }
        );

        let before = server.hits();
        let again = cache
            .prefetch(dir.path(), &urls[..20], |_| {})
            .await
            .unwrap();
        assert_eq!(
            again,
            Progress {
                done: 20,
                total: 20,
                failed: 0
            }
        );
        assert_eq!(
            server.hits(),
            before,
            "cached files are not requested again"
        );
    }

    #[tokio::test]
    async fn prefetch_uses_bounded_concurrency() {
        let active = Arc::new(AtomicUsize::new(0));
        let peak = Arc::new(AtomicUsize::new(0));
        let (a, p) = (Arc::clone(&active), Arc::clone(&peak));
        let server = TestServer::start(move |_| {
            let now = a.fetch_add(1, Ordering::SeqCst) + 1;
            p.fetch_max(now, Ordering::SeqCst);
            std::thread::sleep(Duration::from_millis(60));
            a.fetch_sub(1, Ordering::SeqCst);
            Reply::ok(b"x")
        });
        let dir = tempfile::tempdir().unwrap();
        let cache = test_cache();
        let urls: Vec<String> = (0..24).map(|i| server.url(&format!("/{i}.wav"))).collect();
        cache.prefetch(dir.path(), &urls, |_| {}).await.unwrap();
        let peak = peak.load(Ordering::SeqCst);
        assert!(peak <= PREFETCH_CONCURRENCY, "peak {peak}");
        assert!(peak > 1, "downloads should overlap, peak {peak}");
    }

    #[tokio::test]
    async fn prefetch_rejects_the_whole_call_for_one_disallowed_url() {
        let server = TestServer::start(|_| Reply::ok(b"x"));
        let dir = tempfile::tempdir().unwrap();
        let cache = test_cache();
        let urls = vec![
            server.url("/a.wav"),
            "https://evil.example/b.wav".to_string(),
        ];
        let err = cache.prefetch(dir.path(), &urls, |_| {}).await.unwrap_err();
        assert_eq!(err.code(), "invalid_argument");
        assert_eq!(server.hits(), 0);
    }

    #[test]
    fn status_ignores_partial_files_and_missing_dirs() {
        let dir = tempfile::tempdir().unwrap();
        assert_eq!(
            status(&dir.path().join("nope")).unwrap(),
            CacheStatus::default()
        );
        std::fs::create_dir_all(dir.path().join("h/sub")).unwrap();
        std::fs::write(dir.path().join("h/a.wav"), b"123").unwrap();
        std::fs::write(dir.path().join("h/sub/b.wav"), b"12345").unwrap();
        std::fs::write(dir.path().join("h/.c.wav.1.0.part"), b"partial").unwrap();
        assert_eq!(
            status(dir.path()).unwrap(),
            CacheStatus { files: 2, bytes: 8 }
        );
    }

    #[test]
    fn clear_removes_the_cache_and_refuses_other_directories() {
        let root = tempfile::tempdir().unwrap();
        let dir = cache_dir(root.path());
        std::fs::create_dir_all(dir.join("h")).unwrap();
        std::fs::write(dir.join("h/a.wav"), b"1").unwrap();
        std::fs::write(root.path().join("keep.phyllo"), b"{}").unwrap();

        clear(&dir).unwrap();
        assert!(!dir.exists());
        assert!(root.path().join("keep.phyllo").exists());
        clear(&dir).unwrap(); // idempotent

        let err = clear(root.path()).unwrap_err();
        assert_eq!(err.code(), "invalid_argument");
        assert!(root.path().join("keep.phyllo").exists());
    }

    #[test]
    fn cache_dir_is_under_the_root() {
        assert_eq!(
            cache_dir(Path::new("/m/Phyllo")),
            Path::new("/m/Phyllo/.cache/sounds")
        );
    }
}
