//! The web clipper: fetches a page over https or http, with
//! the app's web client (public pages connect without a proxy), and keeps its
//! article as an inbox card through kasten-core. A page elsewhere never
//! leads the fetch to this computer or the local network.

use std::time::Duration;

use kasten_core::{Instant, NoteFile};
use reqwest::Url;
use reqwest::header::{ACCEPT, CONTENT_TYPE};
use tauri::State;

use crate::chat::address::private;
use crate::chat::commands::ChatState;
use crate::commands::notes::{HUMAN, OpenVault};

/// Pages bigger than this are not web articles.
const MAX_PAGE: usize = 8 * 1024 * 1024;
const WAIT: Duration = Duration::from_secs(30);

/// An address as a person types it: `example.com/x` is `https://example.com/x`.
fn address(url: &str) -> Result<String, String> {
    let url = url.trim();
    if url.is_empty() {
        return Err("Which page? Paste its address".into());
    }
    let url = if url.contains("://") {
        url.to_owned()
    } else {
        format!("https://{url}")
    };
    if !(url.starts_with("https://") || url.starts_with("http://"))
        || url.contains(char::is_whitespace)
    {
        return Err(format!("“{url}” is not a web address"));
    }
    Ok(url)
}

/// Whether the page the person asked for is on this computer or the local
/// network by the address they typed: an address like `192.168.1.20`, or a
/// name only a local network knows (`nas`, `printer.local`). Such a page is
/// theirs to clip, and the fetch may stay there. A public-looking name is
/// fetched as public however its name resolves, so a name that leads to a
/// local address, now or on a second look, is refused.
fn asked_for_local(url: &str) -> bool {
    Url::parse(url).is_ok_and(|parsed| private(&parsed))
}

#[tauri::command]
pub async fn clip_url(
    vault: State<'_, OpenVault>,
    chat: State<'_, ChatState>,
    url: String,
) -> Result<NoteFile, String> {
    let kasten = vault.require()?;
    let url = address(&url)?;
    let client = if asked_for_local(&url) {
        chat.local_web()?
    } else {
        chat.web()?
    };
    let mut response = client
        .get(&url)
        .header(ACCEPT, "text/html,application/xhtml+xml;q=0.9,*/*;q=0.5")
        .timeout(WAIT)
        .send()
        .await
        .map_err(|e| format!("Could not reach {url}: {e}"))?;
    let status = response.status();
    if !status.is_success() {
        return Err(format!("{url} answered {status}"));
    }
    let kind = response
        .headers()
        .get(CONTENT_TYPE)
        .and_then(|v| v.to_str().ok())
        .unwrap_or("")
        .to_lowercase();
    if !kind.is_empty() && !kind.contains("html") {
        return Err(format!(
            "That address is not a web page but {}",
            kind.split(';').next().unwrap_or(&kind)
        ));
    }
    let landed = response.url().to_string();
    // Read in pieces up to the limit, so a huge answer is never held whole.
    let too_big = || "That page is too big to keep".to_owned();
    if response
        .content_length()
        .is_some_and(|n| n > MAX_PAGE as u64)
    {
        return Err(too_big());
    }
    let mut bytes = Vec::new();
    while let Some(piece) = response
        .chunk()
        .await
        .map_err(|e| format!("The page stopped coming: {e}"))?
    {
        if bytes.len() + piece.len() > MAX_PAGE {
            return Err(too_big());
        }
        bytes.extend_from_slice(&piece);
    }
    // Reading the page is work for a thread of its own, and a slip in it
    // is an answer, not a crash.
    tauri::async_runtime::spawn_blocking(move || {
        crate::crash::caught(|| {
            let page = String::from_utf8_lossy(&bytes);
            kasten
                .clip(&HUMAN, &landed, &page, Instant::now())
                .map_err(|e| e.to_string())
        })
    })
    .await
    .map_err(crate::crash::joined)?
}

#[cfg(test)]
mod tests {
    use super::{address, asked_for_local};

    #[test]
    fn reads_addresses_as_people_type_them() {
        assert_eq!(address(" example.com/a ").unwrap(), "https://example.com/a");
        assert_eq!(address("http://example.com").unwrap(), "http://example.com");
        assert!(address("ftp://example.com").is_err());
        assert!(address("").is_err());
        assert!(address("two words").is_err());
    }

    #[test]
    fn knows_a_page_asked_for_on_this_computer_or_the_local_network() {
        assert!(asked_for_local("http://localhost:8080/wiki"));
        assert!(asked_for_local("http://192.168.1.20/notes"));
        assert!(asked_for_local("http://nas/"));
        assert!(!asked_for_local("https://93.184.215.14/article"));
        // A public-looking name counts as public, even one whose name
        // leads here: its fetch then refuses the local address.
        assert!(!asked_for_local("http://localtest.me/"));
        assert!(!asked_for_local("https://example.com/"));
    }
}
