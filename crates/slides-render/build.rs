//! Embeds the render page in the program. The page is built from `packages/slides-render-page` by
//! `node scripts/build-render-page.mjs`; this turns the files it made into a table of `include_bytes!`, so that
//! `slides` needs nothing beside it. Without a built page the table is empty and the crate still builds: drawing
//! then says how to get the page (see `Error::NoPage`). `SLIDES_RENDER_PAGE_BUILD` names another folder to embed.

use std::env;
use std::fmt::Write as _;
use std::fs;
use std::path::{Path, PathBuf};

/// Every file under `dir`, as (path relative to `dir` with `/`, full path), in a fixed order.
fn walk(root: &Path, dir: &Path, out: &mut Vec<(String, PathBuf)>) {
    let Ok(entries) = fs::read_dir(dir) else {
        return;
    };
    let mut entries: Vec<_> = entries.flatten().collect();
    entries.sort_by_key(|e| e.file_name());
    for entry in entries {
        let path = entry.path();
        if path.is_dir() {
            walk(root, &path, out);
        } else if let Ok(rest) = path.strip_prefix(root) {
            let name: Vec<String> = rest
                .components()
                .map(|c| c.as_os_str().to_string_lossy().into_owned())
                .collect();
            out.push((name.join("/"), path));
        }
    }
}

fn main() {
    println!("cargo:rerun-if-env-changed=SLIDES_RENDER_PAGE_BUILD");
    println!("cargo:rerun-if-changed=build.rs");
    let manifest = PathBuf::from(env::var_os("CARGO_MANIFEST_DIR").unwrap_or_default());
    let dir = env::var_os("SLIDES_RENDER_PAGE_BUILD").map_or_else(
        || manifest.join("../../packages/slides-render-page/dist"),
        PathBuf::from,
    );
    // To Cargo a folder that is not there has always changed, and the crate would be built again on every run; an empty one has not.
    if !dir.exists() {
        let _ = fs::create_dir_all(&dir);
    }
    println!("cargo:rerun-if-changed={}", dir.display());

    let mut files = Vec::new();
    walk(&dir, &dir, &mut files);
    let mut table = String::from(
        "/// The render page: (path, bytes).\npub static FILES: &[(&str, &[u8])] = &[\n",
    );
    let mut count = 0;
    for (name, path) in &files {
        let _ = writeln!(
            table,
            "    ({name:?}, include_bytes!({:?})),",
            path.display().to_string()
        );
        count += 1;
    }
    table.push_str("];\n");
    let out = PathBuf::from(env::var_os("OUT_DIR").unwrap_or_default()).join("page_files.rs");
    if let Err(e) = fs::write(&out, table) {
        panic!("cannot write {}: {e}", out.display());
    }
    if count == 0 {
        println!(
            "cargo:warning=slides-render: no built render page in {} (run `node scripts/build-render-page.mjs`): drawing slides will not work until it is built",
            dir.display()
        );
    }
}
