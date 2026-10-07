//! The pictures a deck uses, apart from where they are kept: their SHA-256,
//! the sidecar that remembers where each came from, their size read from
//! the header, and thumbnails. A vault (Kasten) and a folder (`slides dev`)
//! keep the files and share this, so a picture pasted in either is described
//! the same way.
//!
//! Nothing here reads or writes a file or knows the time: a host passes bytes
//! and a clock in, and keeps what comes out.

pub mod clean;
pub mod deck;
pub mod id;
pub mod probe;
pub mod sha256;
pub mod sidecar;
pub mod thumb;
pub mod time;

pub use probe::{Kind, dimensions, is_picture_name, mime_of};
pub use sha256::{sha256, sha256_hex};
pub use sidecar::{Clip, Sidecar, picture_path, sidecar_path};
pub use thumb::{SIZES, thumbnail};
