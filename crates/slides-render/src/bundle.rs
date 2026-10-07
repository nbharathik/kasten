//! The page the browser is pointed at: the built files of `packages/slides-render-page`. They are embedded in the
//! program (`build.rs`), so a plain install of `slides` has them; `SLIDES_RENDER_PAGE` names a folder to use
//! instead (a page under development), and a `render-page` folder beside the program is the last resort for a build
//! that did not embed it.

use std::borrow::Cow;
use std::ffi::OsString;
use std::fs;
use std::path::{Path, PathBuf};

mod embedded {
    include!(concat!(env!("OUT_DIR"), "/page_files.rs"));
}

/// One file of the page, ready to be sent.
#[derive(Debug)]
pub struct PageFile {
    pub bytes: Cow<'static, [u8]>,
    pub content_type: &'static str,
}

/// Where the page's files come from.
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum Page {
    /// The files built into the program.
    Embedded,
    /// The files of a folder, read when asked for.
    Folder(PathBuf),
}

/// The media type of a file of the page, from its name.
pub fn content_type(path: &str) -> &'static str {
    match path
        .rsplit_once('.')
        .map(|(_, ext)| ext.to_ascii_lowercase())
        .as_deref()
    {
        Some("html") => "text/html; charset=utf-8",
        Some("js" | "mjs") => "text/javascript; charset=utf-8",
        Some("css") => "text/css; charset=utf-8",
        Some("wasm") => "application/wasm",
        Some("woff2") => "font/woff2",
        Some("json") => "application/json",
        Some("svg") => "image/svg+xml",
        Some("png") => "image/png",
        _ => "application/octet-stream",
    }
}

/// The path of a request as a path in the page: no leading slash, `index.html` for the root; `None` when it tries
/// to leave the page (`..`, a backslash, an empty part).
pub fn page_path(request: &str) -> Option<String> {
    let path = request.trim_start_matches('/');
    if path.is_empty() {
        return Some("index.html".to_owned());
    }
    if path.contains(['\\', '\0'])
        || path
            .split('/')
            .any(|part| part.is_empty() || part == "." || part == "..")
    {
        return None;
    }
    Some(path.to_owned())
}

/// The files built into the program.
pub fn embedded_files() -> &'static [(&'static str, &'static [u8])] {
    embedded::FILES
}

/// How many bytes of the page are built into the program.
pub fn embedded_size() -> usize {
    embedded::FILES.iter().map(|(_, bytes)| bytes.len()).sum()
}

impl Page {
    /// The page this program has, if it has one.
    pub fn locate() -> Option<Page> {
        let beside = std::env::current_exe()
            .ok()
            .and_then(|exe| exe.parent().map(|dir| dir.join("render-page")));
        Page::locate_with(|name| std::env::var_os(name), beside)
    }

    /// The same with the environment and the folder beside the program given.
    pub fn locate_with(
        get: impl Fn(&str) -> Option<OsString>,
        beside: Option<PathBuf>,
    ) -> Option<Page> {
        let has_index = |dir: &Path| dir.join("index.html").is_file();
        if let Some(dir) = get("SLIDES_RENDER_PAGE")
            .filter(|v| !v.is_empty())
            .map(PathBuf::from)
        {
            return has_index(&dir).then_some(Page::Folder(dir));
        }
        if embedded::FILES
            .iter()
            .any(|(path, _)| *path == "index.html")
        {
            return Some(Page::Embedded);
        }
        beside.filter(|dir| has_index(dir)).map(Page::Folder)
    }

    /// The file at `request` (a path such as `/assets/app.js`), or `None` when the page has none.
    pub fn get(&self, request: &str) -> Option<PageFile> {
        let path = page_path(request)?;
        match self {
            Page::Embedded => {
                embedded::FILES
                    .iter()
                    .find(|(name, _)| *name == path)
                    .map(|(name, bytes)| PageFile {
                        bytes: Cow::Borrowed(*bytes),
                        content_type: content_type(name),
                    })
            }
            Page::Folder(dir) => {
                let file = dir.join(&path);
                fs::metadata(&file).ok().filter(fs::Metadata::is_file)?;
                Some(PageFile {
                    bytes: Cow::Owned(fs::read(file).ok()?),
                    content_type: content_type(&path),
                })
            }
        }
    }

    /// Where the page is from, in words.
    pub fn describe(&self) -> String {
        match self {
            Page::Embedded => format!(
                "built into the program ({} files, {} bytes)",
                embedded::FILES.len(),
                embedded_size()
            ),
            Page::Folder(dir) => format!("the folder {}", dir.display()),
        }
    }
}

#[cfg(test)]
mod tests;
