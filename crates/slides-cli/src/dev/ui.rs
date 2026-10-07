//! The page itself: the built editor, served from a folder.

use std::fs;
use std::path::{Component, Path, PathBuf};

use super::http::Response;
use super::mime::content_type;

/// Where the built page is, if it can be found: the folder named by
/// `--ui` or `SLIDES_UI`, else `packages/slides-dev/dist` in a checkout the
/// program was built from or is run in, else `ui/` beside the program.
pub fn find(named: Option<&str>) -> Option<PathBuf> {
    let from_env = std::env::var("SLIDES_UI").ok();
    let mut candidates: Vec<PathBuf> = named
        .map(PathBuf::from)
        .into_iter()
        .chain(from_env.map(PathBuf::from))
        .collect();
    if candidates.is_empty() {
        let here = std::env::current_dir().ok();
        let exe = std::env::current_exe()
            .ok()
            .and_then(|p| p.parent().map(Path::to_path_buf));
        for start in [here, exe.clone()].into_iter().flatten() {
            candidates.extend(
                start
                    .ancestors()
                    .map(|a| a.join("packages/slides-dev/dist")),
            );
        }
        candidates.extend(exe.map(|e| e.join("ui")));
    }
    candidates
        .into_iter()
        .find(|c| c.join("index.html").is_file())
        .and_then(|c| c.canonicalize().ok())
}

/// The path as a chain of plain names, or None if it tries to leave the folder.
fn inside(path: &str) -> Option<PathBuf> {
    let mut clean = PathBuf::new();
    for part in Path::new(path.trim_start_matches('/')).components() {
        match part {
            Component::Normal(name) if !name.to_string_lossy().contains(['\\', '\0']) => {
                clean.push(name)
            }
            Component::CurDir => {}
            _ => return None,
        }
    }
    Some(clean)
}

/// The file at `path` under `root`. A path that names no file goes to the
/// page itself, unless it looks like a file, so that a mistyped script is
/// an error and not a page.
pub fn serve(root: Option<&Path>, path: &str) -> Response {
    let Some(root) = root else {
        return Response::bytes(
            404,
            "text/plain; charset=utf-8",
            b"There is no page to show. Build it with `pnpm --filter @kasten-slides/dev build`, or run it with `pnpm --filter @kasten-slides/dev dev`, which talks to this server.\n".to_vec(),
        );
    };
    let Some(relative) = inside(path) else {
        return Response::error(403, "that path is not allowed");
    };
    let mut file = root.join(&relative);
    if file.is_dir() {
        file = file.join("index.html");
    }
    let wants_file = relative.extension().is_some();
    if !file.is_file() {
        if wants_file {
            return Response::error(404, "not found");
        }
        file = root.join("index.html");
    }
    // A link inside the folder that points out of it is out of bounds.
    let Ok(real) = file.canonicalize() else {
        return Response::error(404, "not found");
    };
    if !real.starts_with(root) {
        return Response::error(403, "that path is not allowed");
    }
    match fs::read(&real) {
        Ok(bytes) => Response::bytes(200, content_type(&real.to_string_lossy()), bytes)
            .with("Cache-Control", "no-cache"),
        Err(_) => Response::error(404, "not found"),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn page(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("slides-ui-{}-{name}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(dir.join("assets")).unwrap();
        fs::write(dir.join("index.html"), "<html>page</html>").unwrap();
        fs::write(dir.join("assets/app.js"), "1").unwrap();
        dir.canonicalize().unwrap()
    }

    #[test]
    fn serves_files_and_falls_back_to_the_page() {
        let root = page("serve");
        assert_eq!(serve(Some(&root), "/").body, b"<html>page</html>");
        assert_eq!(serve(Some(&root), "/assets/app.js").body, b"1");
        assert_eq!(serve(Some(&root), "/deck/talk").body, b"<html>page</html>");
        assert_eq!(serve(Some(&root), "/assets/missing.js").status, 404);
    }

    #[test]
    fn stays_inside_its_folder() {
        let root = page("inside");
        assert_eq!(serve(Some(&root), "/../secret.txt").status, 403);
        assert_eq!(serve(Some(&root), "/assets/../../x").status, 403);
        assert_eq!(serve(None, "/").status, 404);
    }
}
