//! A deck an agent brings in from a file, with the pictures it comes with,
//! as `Kasten::agent_import_deck` takes it and answers.

/// What an agent asks to have imported.
#[derive(Debug, Clone)]
pub struct DeckImport<'a> {
    /// The deck's title, which its file is named after.
    pub title: &'a str,
    /// The project folder it goes in; the library when none.
    pub project: Option<&'a str>,
    /// The tool's name: the commit's `Kasten-Op`.
    pub tool: &'a str,
    /// The pictures, each with the name it should be kept under in `assets/`.
    pub pictures: &'a [(&'a str, &'a [u8])],
    /// How many bytes were sent to ask for it.
    pub sent: usize,
}

/// What an import made.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ImportedDeck {
    /// The new deck's path.
    pub path: String,
    /// Where each picture is kept, in the order they were given: a picture
    /// the vault held already is named by the file that holds it.
    pub pictures: Vec<String>,
}
