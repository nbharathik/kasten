//! What can stop an export. Anything less than that, such as a missing
//! picture, is a `Warning` and the export goes on.

use std::fmt;

#[derive(Debug)]
pub enum Error {
    /// The deck cannot be written as a presentation, and why.
    Invalid(String),
    /// The zip could not be written.
    Zip(String),
}

impl fmt::Display for Error {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Error::Invalid(message) => write!(f, "the deck cannot be exported: {message}"),
            Error::Zip(message) => write!(f, "the file could not be written: {message}"),
        }
    }
}

impl std::error::Error for Error {}

impl From<zip::result::ZipError> for Error {
    fn from(e: zip::result::ZipError) -> Error {
        Error::Zip(e.to_string())
    }
}

impl From<std::io::Error> for Error {
    fn from(e: std::io::Error) -> Error {
        Error::Zip(e.to_string())
    }
}
