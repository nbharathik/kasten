//! Opening a `.pptx`: a zip of parts read on demand, under limits, so a file
//! that is small on disk cannot fill memory when it is read. Parts are found
//! by name, relationships are followed by their ids, and an entry whose name
//! could leave the package (`../`, a rooted path, a backslash) is ignored.

use std::collections::HashMap;
use std::io::{Cursor, Read};

use zip::ZipArchive;

use super::ImportError;
use super::dom::{self, Doc};

/// How much of a file is read.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Limits {
    /// The most bytes any one part may hold once unpacked.
    pub part: u64,
    /// The most bytes all the parts read may hold.
    pub total: u64,
    /// The most entries the zip may list.
    pub entries: usize,
}

impl Default for Limits {
    fn default() -> Limits {
        Limits {
            part: 64 * 1024 * 1024,
            total: 512 * 1024 * 1024,
            entries: 10_000,
        }
    }
}

/// A relationship of a part: how it names another part, or an address outside the file.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Rel {
    pub id: String,
    /// The last word of the relationship's type: `slide`, `image`, `hyperlink` ...
    pub kind: String,
    /// The full type address.
    pub type_uri: String,
    pub target: String,
    pub external: bool,
}

/// The relationships of one part.
#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct Rels {
    pub items: Vec<Rel>,
}

impl Rels {
    pub fn get(&self, id: &str) -> Option<&Rel> {
        self.items.iter().find(|r| r.id == id)
    }

    /// The relationships of one kind.
    pub fn of_kind<'a>(&'a self, kind: &'a str) -> impl Iterator<Item = &'a Rel> {
        self.items.iter().filter(move |r| r.kind == kind)
    }

    fn parse(doc: &Doc) -> Rels {
        let items = doc
            .root
            .elements()
            .filter(|n| n.name.rsplit(':').next() == Some("Relationship"))
            .filter_map(|n| {
                let type_uri = n.attr("Type")?.to_owned();
                Some(Rel {
                    id: n.attr("Id")?.to_owned(),
                    kind: type_uri.rsplit('/').next().unwrap_or("").to_owned(),
                    type_uri,
                    target: n.attr("Target")?.to_owned(),
                    external: n.attr("TargetMode") == Some("External"),
                })
            })
            .collect();
        Rels { items }
    }
}

/// The name of the part a relationship of `owner` points at, or None for a target that leaves the package.
pub fn resolve(owner: &str, target: &str) -> Option<String> {
    let target = percent_decode(target);
    let mut path: Vec<&str> = match target.strip_prefix('/') {
        Some(_) => Vec::new(),
        None => owner
            .rsplit_once('/')
            .map_or(Vec::new(), |(dir, _)| dir.split('/').collect()),
    };
    for part in target.split('/') {
        match part {
            ".." => {
                path.pop()?;
            }
            "." | "" => {}
            other => path.push(other),
        }
    }
    Some(path.join("/"))
}

fn percent_decode(text: &str) -> String {
    if !text.contains('%') {
        return text.to_owned();
    }
    let bytes = text.as_bytes();
    let mut out = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'%'
            && let Some(hex) = text.get(i + 1..i + 3)
            && let Ok(byte) = u8::from_str_radix(hex, 16)
        {
            out.push(byte);
            i += 3;
        } else {
            out.push(bytes[i]);
            i += 1;
        }
    }
    String::from_utf8_lossy(&out).into_owned()
}

/// Whether an entry name stays inside the package.
fn safe(name: &str) -> bool {
    !name.is_empty()
        && !name.starts_with('/')
        && !name.contains(['\\', '\0'])
        && !name.split('/').any(|part| part == "..")
        && !name.as_bytes().get(1).is_some_and(|c| *c == b':')
}

/// The content types a package lists.
#[derive(Clone, Debug, Default)]
struct ContentTypes {
    defaults: HashMap<String, String>,
    overrides: HashMap<String, String>,
}

/// An opened `.pptx`.
pub struct Package<'a> {
    archive: ZipArchive<Cursor<&'a [u8]>>,
    /// Lower-cased part name to its index in the zip and its name as written.
    index: HashMap<String, (usize, String)>,
    limits: Limits,
    read_total: u64,
    types: ContentTypes,
    /// Names of entries that were ignored because they could leave the package.
    pub ignored: Vec<String>,
}

/// Why a part could not be read.
#[derive(Debug)]
pub enum ReadError {
    Missing(String),
    Damaged(String),
    /// A limit was passed; the import stops.
    TooLarge(String),
}

impl ReadError {
    pub fn message(&self) -> String {
        match self {
            ReadError::Missing(name) => format!("the part `{name}` is not in the file"),
            ReadError::Damaged(m) | ReadError::TooLarge(m) => m.clone(),
        }
    }
}

impl<'a> Package<'a> {
    pub fn open(bytes: &'a [u8], limits: Limits) -> Result<Package<'a>, ImportError> {
        if bytes.starts_with(&[0xD0, 0xCF, 0x11, 0xE0]) {
            return Err(ImportError::Unsupported(
                "this is an older PowerPoint file (.ppt) or a password-protected one; \
                 save it as a .pptx without a password and import that"
                    .to_owned(),
            ));
        }
        let archive = ZipArchive::new(Cursor::new(bytes)).map_err(|e| {
            ImportError::NotAPresentation(format!("it is not a PowerPoint file: {e}"))
        })?;
        if archive.len() > limits.entries {
            return Err(ImportError::TooLarge(format!(
                "the file lists {} entries; the most read is {}",
                archive.len(),
                limits.entries
            )));
        }
        let mut package = Package {
            archive,
            index: HashMap::new(),
            limits,
            read_total: 0,
            types: ContentTypes::default(),
            ignored: Vec::new(),
        };
        for i in 0..package.archive.len() {
            let Some(name) = package.archive.name_for_index(i).map(str::to_owned) else {
                continue;
            };
            if name.ends_with('/') {
                continue;
            }
            if !safe(&name) {
                package.ignored.push(name);
                continue;
            }
            package
                .index
                .entry(name.to_ascii_lowercase())
                .or_insert((i, name));
        }
        if !package.has("[Content_Types].xml") {
            return Err(ImportError::NotAPresentation(
                "it is a zip file, but not a PowerPoint one (there is no [Content_Types].xml)"
                    .to_owned(),
            ));
        }
        package.read_content_types();
        Ok(package)
    }

    fn read_content_types(&mut self) {
        let Ok(doc) = self.dom("[Content_Types].xml") else {
            return;
        };
        for node in doc.root.elements() {
            let local = node.name.rsplit(':').next().unwrap_or("");
            match (local, node.attr("ContentType")) {
                ("Default", Some(t)) => {
                    if let Some(ext) = node.attr("Extension") {
                        self.types
                            .defaults
                            .insert(ext.to_ascii_lowercase(), t.to_owned());
                    }
                }
                ("Override", Some(t)) => {
                    if let Some(part) = node.attr("PartName") {
                        self.types.overrides.insert(
                            part.trim_start_matches('/').to_ascii_lowercase(),
                            t.to_owned(),
                        );
                    }
                }
                _ => {}
            }
        }
    }

    pub fn has(&self, name: &str) -> bool {
        self.index.contains_key(&name.to_ascii_lowercase())
    }

    /// The part's name as the file spells it.
    pub fn real_name(&self, name: &str) -> Option<&str> {
        self.index
            .get(&name.to_ascii_lowercase())
            .map(|(_, real)| real.as_str())
    }

    /// The content type the file gives a part.
    pub fn content_type(&self, name: &str) -> Option<String> {
        let lower = name.to_ascii_lowercase();
        if let Some(t) = self.types.overrides.get(&lower) {
            return Some(t.clone());
        }
        let ext = lower.rsplit_once('.')?.1;
        self.types.defaults.get(ext).cloned()
    }

    /// The bytes of a part.
    pub fn read(&mut self, name: &str) -> Result<Vec<u8>, ReadError> {
        let Some((at, real)) = self.index.get(&name.to_ascii_lowercase()).cloned() else {
            return Err(ReadError::Missing(name.to_owned()));
        };
        let part_limit = self.limits.part;
        let remaining = self.limits.total.saturating_sub(self.read_total);
        let mut file = self
            .archive
            .by_index(at)
            .map_err(|e| ReadError::Damaged(format!("the part `{real}` cannot be read: {e}")))?;
        if file.size() > part_limit {
            return Err(ReadError::TooLarge(format!(
                "the part `{real}` is {} bytes unpacked; the most read is {part_limit}",
                file.size()
            )));
        }
        let mut out = Vec::with_capacity(usize::try_from(file.size().min(1 << 24)).unwrap_or(0));
        // A zip can claim a small size and hold more: read no further than the limit allows.
        let cap = part_limit.min(remaining);
        let read = (&mut file)
            .take(cap + 1)
            .read_to_end(&mut out)
            .map_err(|e| ReadError::Damaged(format!("the part `{real}` cannot be unpacked: {e}")))?
            as u64;
        if read > part_limit {
            return Err(ReadError::TooLarge(format!(
                "the part `{real}` unpacks to more than {part_limit} bytes"
            )));
        }
        if read > remaining {
            return Err(ReadError::TooLarge(format!(
                "the file unpacks to more than {} bytes",
                self.limits.total
            )));
        }
        self.read_total += read;
        Ok(out)
    }

    /// A part read as XML.
    pub fn dom(&mut self, name: &str) -> Result<Doc, ReadError> {
        let bytes = self.read(name)?;
        dom::parse(&bytes).map_err(|e| ReadError::Damaged(format!("the part `{name}`: {e}")))
    }

    /// The relationships of a part; none when it has none or they cannot be read.
    pub fn rels_of(&mut self, part: &str) -> Rels {
        let path = match part.rsplit_once('/') {
            Some((dir, file)) => format!("{dir}/_rels/{file}.rels"),
            None => format!("_rels/{part}.rels"),
        };
        match self.dom(&path) {
            Ok(doc) => Rels::parse(&doc),
            Err(_) => Rels::default(),
        }
    }

    /// The part a relationship of `owner` points at, if it is inside the package and there.
    pub fn target(&self, owner: &str, rel: &Rel) -> Option<String> {
        if rel.external {
            return None;
        }
        let name = resolve(owner, &rel.target)?;
        self.real_name(&name).map(str::to_owned)
    }

    /// How many bytes have been read so far.
    #[cfg(test)]
    pub fn total_read(&self) -> u64 {
        self.read_total
    }
}

#[cfg(test)]
pub(crate) mod tests;
