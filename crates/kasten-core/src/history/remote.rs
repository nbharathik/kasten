//! Which backup remotes Kasten pushes to. Every note goes
//! there, so only addresses that keep them private: `https://` and SSH, or
//! a folder on this computer. No password or token may sit in the address,
//! where the config file would keep it and history would copy it; git's
//! credential helper or an SSH key signs in instead.

use crate::error::{Error, Result};

/// Whether `url` is a remote Kasten pushes to. The reason never repeats
/// the address, which may hold a secret.
pub fn check_remote(url: &str) -> Result<()> {
    let refuse = |why: &str| Err(Error::Invalid(format!("The backup remote {why}")));
    if url.trim().is_empty() {
        return refuse("is empty");
    }
    if url.chars().any(|c| c.is_whitespace() || c.is_control()) {
        return refuse("has a space or a control character in it");
    }
    if url.starts_with('-') {
        return refuse("cannot start with a dash");
    }
    let lower = url.to_ascii_lowercase();
    let authority = |scheme: &str| url[scheme.len()..].split('/').next().unwrap_or("");
    if lower.starts_with("https://") {
        let host = authority("https://");
        if host.contains('@') {
            return refuse(
                "cannot hold a user name, password or token; git's credential helper signs in instead",
            );
        }
        if host.is_empty() {
            return refuse("names no server");
        }
        return Ok(());
    }
    if lower.starts_with("ssh://") {
        let host = authority("ssh://");
        if host
            .rsplit_once('@')
            .is_some_and(|(user, _)| user.contains(':'))
        {
            return refuse("cannot hold a password; an SSH key signs in instead");
        }
        return Ok(());
    }
    if lower.contains("://") || lower.contains("::") {
        return refuse(
            "starts with https:// or ssh://, or is a folder on this computer: other kinds send notes unprotected",
        );
    }
    if url.starts_with("\\\\") || url.starts_with("//") {
        return refuse("cannot be a network share, which may sign in as you without asking");
    }
    let bytes = url.as_bytes();
    let drive = bytes.len() > 2
        && bytes[0].is_ascii_alphabetic()
        && bytes[1] == b':'
        && matches!(bytes[2], b'\\' | b'/');
    if drive || url.starts_with('/') {
        return Ok(());
    }
    // SSH's short form, `[user@]host:path`: a colon before any slash. A
    // `user:password@host` form would put the password into the vault's
    // settings, and so into history.
    if let Some((_, rest)) = url.split_once(':')
        && rest
            .split_once('@')
            .is_some_and(|(between, _)| !between.contains('/'))
    {
        return refuse("cannot hold a password; an SSH key signs in instead");
    }
    if url
        .split_once(':')
        .is_some_and(|(host, path)| !host.is_empty() && !host.contains('/') && !path.is_empty())
    {
        return Ok(());
    }
    refuse("is a folder given by its full path, or starts with https:// or ssh://")
}
