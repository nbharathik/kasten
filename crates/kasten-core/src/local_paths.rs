//! Checks for the private files opened outside the note path resolver.
//! Reject links and Windows reparse points before touching their contents.

use std::fs;
use std::io;
use std::path::Path;

/// Resolve the folder explicitly selected by the caller, including existing
/// ancestor aliases (for example macOS's /var). Missing suffixes stay missing.
/// Callers must still validate private paths beneath this boundary.
pub fn resolve_root(path: &Path) -> io::Result<std::path::PathBuf> {
    let absolute = std::path::absolute(path)?;
    let mut existing = absolute.as_path();
    let mut suffix = Vec::new();
    loop {
        match existing.canonicalize() {
            Ok(mut resolved) => {
                for part in suffix.into_iter().rev() {
                    resolved.push(part);
                }
                return Ok(resolved);
            }
            Err(error) if error.kind() == io::ErrorKind::NotFound => {
                let Some(name) = existing.file_name() else {
                    return Err(error);
                };
                suffix.push(name.to_owned());
                existing = existing.parent().ok_or(error)?;
            }
            Err(error) => return Err(error),
        }
    }
}

fn plain(path: &Path, metadata: &fs::Metadata) -> io::Result<()> {
    #[cfg(windows)]
    let reparse = {
        use std::os::windows::fs::MetadataExt;
        metadata.file_attributes() & 0x400 != 0 // FILE_ATTRIBUTE_REPARSE_POINT
    };
    #[cfg(not(windows))]
    let reparse = false;
    if metadata.file_type().is_symlink() || reparse || !(metadata.is_file() || metadata.is_dir()) {
        return Err(io::Error::new(
            io::ErrorKind::PermissionDenied,
            format!(
                "{} is a link or special file; use a plain local path",
                path.display()
            ),
        ));
    }
    Ok(())
}

/// Validate an existing path and its ancestors, allowing missing components.
pub fn check(path: &Path) -> io::Result<()> {
    for ancestor in path.ancestors() {
        if ancestor.as_os_str().is_empty() {
            continue;
        }
        match fs::symlink_metadata(ancestor) {
            Ok(metadata) => plain(ancestor, &metadata)?,
            Err(error) if error.kind() == io::ErrorKind::NotFound => {}
            Err(error) => return Err(error),
        }
    }
    Ok(())
}

/// Validate a private tree, including SQLite sidecars and nested proposals.
pub(crate) fn check_tree(path: &Path) -> io::Result<()> {
    check(path)?;
    if path.is_dir() {
        for entry in fs::read_dir(path)? {
            check_tree(&entry?.path())?;
        }
    }
    Ok(())
}
