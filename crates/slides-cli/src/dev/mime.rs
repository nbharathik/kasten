//! What a file is, from its name: the type to send it as.

/// The type to send a file of this name as. Unknown files go out as plain bytes.
pub fn content_type(name: &str) -> &'static str {
    let extension = name
        .rsplit_once('.')
        .map(|(_, e)| e.to_ascii_lowercase())
        .unwrap_or_default();
    match extension.as_str() {
        "html" | "htm" => "text/html; charset=utf-8",
        "js" | "mjs" => "text/javascript; charset=utf-8",
        "css" => "text/css; charset=utf-8",
        "json" | "map" | "deck" | "webmanifest" => "application/json; charset=utf-8",
        "txt" | "md" | "bib" => "text/plain; charset=utf-8",
        "wasm" => "application/wasm",
        "svg" => "image/svg+xml",
        "png" => "image/png",
        "jpg" | "jpeg" => "image/jpeg",
        "gif" => "image/gif",
        "webp" => "image/webp",
        "avif" => "image/avif",
        "ico" => "image/x-icon",
        "woff2" => "font/woff2",
        "woff" => "font/woff",
        "ttf" => "font/ttf",
        "otf" => "font/otf",
        "mp4" => "video/mp4",
        "webm" => "video/webm",
        "pdf" => "application/pdf",
        _ => "application/octet-stream",
    }
}

/// Whether a file of this name is a picture a deck may use.
pub fn is_picture(name: &str) -> bool {
    let extension = name
        .rsplit_once('.')
        .map(|(_, e)| e.to_ascii_lowercase())
        .unwrap_or_default();
    matches!(
        extension.as_str(),
        "png" | "jpg" | "jpeg" | "gif" | "webp" | "avif" | "svg"
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn names_the_types_a_page_needs() {
        assert_eq!(content_type("index.html"), "text/html; charset=utf-8");
        assert_eq!(content_type("engine_bg.WASM"), "application/wasm");
        assert_eq!(content_type("a.b.png"), "image/png");
        assert_eq!(content_type("noext"), "application/octet-stream");
    }

    #[test]
    fn only_pictures_are_pictures() {
        assert!(is_picture("logo.SVG") && is_picture("a.jpeg"));
        assert!(!is_picture("notes.txt") && !is_picture("png"));
    }
}
