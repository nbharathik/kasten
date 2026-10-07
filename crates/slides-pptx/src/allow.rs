//! What an export writes back of a `raw` element: the XML of the object, the parts that XML
//! points at and the addresses it names.
//!
//! An element made by an import carries a copy of what a file held, and a deck is a file anyone may
//! write, so what the element carries is not trusted. An export writes back only what shows
//! something: a chart with its styles and its workbook, a diagram, pictures, sound and video, and
//! links to web pages and mail addresses. Whatever can run, be opened as a program or reach out on
//! its own is left out (an embedded file, an object of another program, a macro, a picture that is
//! fetched when the file opens), and the export says which it left out.

use std::collections::VecDeque;

use crate::rawpart::{Kept, Link, Target};

/// What a kept part is to an export.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum Class {
    /// A chart, or something that belongs to one: its styles, colours, shapes and theme.
    Chart,
    /// A SmartArt diagram: its data, layout, style and colours, and the drawing it is shown with.
    Diagram,
    /// The numbers of a chart.
    Workbook,
    Picture,
    /// Sound or video.
    Media,
}

const CHART_TYPES: &[&str] = &[
    "application/vnd.openxmlformats-officedocument.drawingml.chart+xml",
    "application/vnd.openxmlformats-officedocument.drawingml.chartshapes+xml",
    "application/vnd.openxmlformats-officedocument.themeoverride+xml",
    "application/vnd.ms-office.chartstyle+xml",
    "application/vnd.ms-office.chartcolorstyle+xml",
    "application/vnd.ms-office.chartex+xml",
];

const DIAGRAM_TYPES: &[&str] = &[
    "application/vnd.openxmlformats-officedocument.drawingml.diagramdata+xml",
    "application/vnd.openxmlformats-officedocument.drawingml.diagramlayout+xml",
    "application/vnd.openxmlformats-officedocument.drawingml.diagramstyle+xml",
    "application/vnd.openxmlformats-officedocument.drawingml.diagramcolors+xml",
    "application/vnd.ms-office.drawingml.diagramdrawing+xml",
];

const WORKBOOK_TYPE: &str = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

/// Pictures of the kinds an export writes itself, and the metafiles Office draws with. Not SVG:
/// that is a document of its own, which can carry scripts and addresses.
const PICTURE_TYPES: &[&str] = &[
    "image/png",
    "image/jpeg",
    "image/jpg",
    "image/pjpeg",
    "image/gif",
    "image/bmp",
    "image/x-ms-bmp",
    "image/tiff",
    "image/webp",
    "image/x-emf",
    "image/emf",
    "image/x-wmf",
    "image/wmf",
    "image/vnd.ms-photo",
];

const PICTURE_EXTENSIONS: &[&str] = &[
    "png", "jpg", "jpeg", "jpe", "gif", "bmp", "dib", "tif", "tiff", "webp", "emf", "wmf", "wdp",
    "jxr",
];

const MEDIA_EXTENSIONS: &[&str] = &[
    "mp4", "m4v", "mov", "wmv", "avi", "mpg", "mpeg", "mp3", "m4a", "wav", "wma", "mid", "midi",
    "aif", "aiff", "oga", "ogg", "ogv", "webm", "3gp", "flac", "asf",
];

/// The last word of a relationship type's address: `chart`, `image`, `hyperlink` ...
fn word_of(kind: &str) -> String {
    kind.rsplit('/').next().unwrap_or("").to_ascii_lowercase()
}

/// What the part is, going by its type and its name; None when it is not a kind an export writes.
fn classify(name: &str, content_type: &str) -> Option<Class> {
    let kind = content_type.trim().to_ascii_lowercase();
    let file = name.rsplit('/').next().unwrap_or("");
    let extension = file
        .rsplit_once('.')
        .map(|(_, e)| e.to_ascii_lowercase())
        .unwrap_or_default();
    let xml = extension == "xml";
    if CHART_TYPES.contains(&kind.as_str()) && xml {
        Some(Class::Chart)
    } else if DIAGRAM_TYPES.contains(&kind.as_str()) && xml {
        Some(Class::Diagram)
    } else if kind == WORKBOOK_TYPE && extension == "xlsx" {
        Some(Class::Workbook)
    } else if PICTURE_TYPES.contains(&kind.as_str())
        && PICTURE_EXTENSIONS.contains(&extension.as_str())
    {
        Some(Class::Picture)
    } else if (kind.starts_with("audio/") || kind.starts_with("video/"))
        && MEDIA_EXTENSIONS.contains(&extension.as_str())
    {
        Some(Class::Media)
    } else {
        None
    }
}

/// Whether a relationship of this kind may lead to a part of this class.
fn kind_fits(class: Class, kind: &str) -> bool {
    let word = word_of(kind);
    let words: &[&str] = match class {
        Class::Chart => &[
            "chart",
            "chartex",
            "chartusershapes",
            "chartstyle",
            "chartcolorstyle",
            "themeoverride",
        ],
        Class::Diagram => &[
            "diagramdata",
            "diagramlayout",
            "diagramquickstyle",
            "diagramcolors",
            "diagramdrawing",
        ],
        Class::Workbook => &["package"],
        Class::Picture => &["image", "hdphoto"],
        Class::Media => &["video", "audio", "media"],
    };
    words.contains(&word.as_str())
}

/// Whether a part of class `to` may hang from `from`: the shape itself (None) or another part.
fn may_hang(from: Option<Class>, to: Class) -> bool {
    matches!(
        (from, to),
        (
            None,
            Class::Chart | Class::Diagram | Class::Picture | Class::Media
        ) | (
            Some(Class::Chart),
            Class::Chart | Class::Workbook | Class::Picture
        ) | (Some(Class::Diagram), Class::Diagram | Class::Picture)
    )
}

/// A name or an address from a file, short and plain enough to put in a sentence.
pub fn shown(text: &str) -> String {
    let plain: String = text
        .chars()
        .map(|c| if c.is_control() || c == '`' { ' ' } else { c })
        .take(80)
        .collect();
    let more = if text.chars().count() > 80 { "…" } else { "" };
    format!("{}{more}", plain.trim())
}

/// Whether an address outside the file may be written back: a web page, a mail or phone address,
/// never a file, a share or a program.
pub fn allowed_address(address: &str) -> bool {
    let lower = address.trim().to_ascii_lowercase();
    ["http://", "https://", "mailto:", "tel:"]
        .iter()
        .any(|scheme| lower.starts_with(scheme))
}

/// Why a relationship to an address outside the file is not written back; None when it is. Only a
/// hyperlink to a web page or a mail or phone address is: anything else of that kind (a linked
/// picture, a linked object, a linked video) is fetched or opened by whoever opens the file.
pub fn refuse_address(kind: &str, address: &str) -> Option<String> {
    let word = word_of(kind);
    if word != "hyperlink" {
        return Some(format!(
            "an address outside the file that is not a hyperlink (a `{}` link) is fetched or opened by whoever opens the file",
            shown(&word)
        ));
    }
    (!allowed_address(address))
        .then(|| "it is not a web page, a mail address or a phone number".to_owned())
}

/// The walk over a record's links, from the shape outwards.
struct Walk<'a> {
    record: &'a Kept,
    classes: Vec<Option<Class>>,
    why: Vec<Option<String>>,
    queue: VecDeque<usize>,
}

impl Walk<'_> {
    /// Follows a link from the shape (`from` None) or from a part that is written. The first way
    /// in that suits the part is the one that counts.
    fn follow(&mut self, from: Option<Class>, link: &Link) {
        let Target::Part(at) = link.to else {
            return;
        };
        let Some(part) = self.record.parts.get(at) else {
            return;
        };
        if self.classes[at].is_some() {
            return;
        }
        let refusal = match classify(&part.name, &part.content_type) {
            None => "it is not a kind of part an export writes back".to_owned(),
            Some(class) if !kind_fits(class, &link.kind) => format!(
                "it is reached as a `{}`, which is not how a {} is",
                shown(&word_of(&link.kind)),
                noun(class)
            ),
            Some(class) if !may_hang(from, class) => {
                format!("a {} does not belong there", noun(class))
            }
            Some(class) => {
                self.classes[at] = Some(class);
                self.queue.push_back(at);
                return;
            }
        };
        self.why[at].get_or_insert(refusal);
    }
}

/// The verdict on each part of a record, part for part: None when it may be written back, or why
/// it may not. A part is written only when something that is written points at it, by the kind of
/// relationship that kind of part has.
pub fn judge(record: &Kept) -> Vec<Option<String>> {
    let count = record.parts.len();
    let mut walk = Walk {
        record,
        classes: vec![None; count],
        why: vec![None; count],
        queue: VecDeque::new(),
    };
    for link in &record.links {
        walk.follow(None, link);
    }
    while let Some(at) = walk.queue.pop_front() {
        let class = walk.classes[at];
        for link in &record.parts[at].links {
            walk.follow(class, link);
        }
    }
    (0..count)
        .map(|at| match walk.classes[at] {
            Some(_) => None,
            None => Some(
                walk.why[at]
                    .take()
                    .unwrap_or_else(|| "nothing that is written back points at it".to_owned()),
            ),
        })
        .collect()
}

fn noun(class: Class) -> &'static str {
    match class {
        Class::Chart => "chart part",
        Class::Diagram => "diagram part",
        Class::Workbook => "workbook",
        Class::Picture => "picture",
        Class::Media => "sound or video",
    }
}

/// A sentence for each part and each address of the record that is left out, for the export to
/// report.
pub fn dropped(record: &Kept, verdicts: &[Option<String>]) -> Vec<String> {
    let mut out: Vec<String> = record
        .parts
        .iter()
        .zip(verdicts)
        .filter_map(|(part, why)| {
            why.as_ref().map(|why| {
                format!(
                    "`{}` ({}) was left out: {why}",
                    shown(&part.name),
                    shown(&part.content_type)
                )
            })
        })
        .collect();
    // The addresses of a part that is left out go with it, and need no word of their own.
    let written = record
        .parts
        .iter()
        .zip(verdicts)
        .filter(|(_, why)| why.is_none())
        .flat_map(|(part, _)| &part.links);
    for link in record.links.iter().chain(written) {
        if let Target::External(address) = &link.to
            && let Some(why) = refuse_address(&link.kind, address)
        {
            out.push(format!(
                "the link to `{}` was left out: {why}",
                shown(address)
            ));
        }
    }
    out
}

#[cfg(test)]
mod tests;
