//! Errors every core op can return, with messages fit for people.

use std::fmt;
use std::io;

#[derive(Debug)]
pub enum Error {
    Io(io::Error),
    /// No note at this vault path.
    NotFound(String),
    /// A path outside the vault, or into its private folders.
    InvalidPath(String),
    /// An argument the op cannot use.
    Invalid(String),
    /// The vault's git history failed.
    Git(String),
    /// The search index failed; it can always be rebuilt from the files.
    Index(String),
}

pub type Result<T> = std::result::Result<T, Error>;

impl fmt::Display for Error {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Error::Io(err) => write!(f, "{err}"),
            Error::NotFound(path) => write!(f, "No note at {path}"),
            Error::InvalidPath(path) => write!(f, "Not a note path in this vault: {path}"),
            Error::Invalid(why) => f.write_str(why),
            Error::Git(why) => write!(f, "History: {why}"),
            Error::Index(why) => write!(f, "Index: {why}"),
        }
    }
}

impl std::error::Error for Error {}

impl From<io::Error> for Error {
    fn from(err: io::Error) -> Self {
        Error::Io(err)
    }
}
