//! What a render is asked for and what it gives back.

use serde::Deserialize;

/// A slide that builds up in steps is drawn as it ends, or once for every state it passes through.
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub enum Steps {
    /// Each slide once, as it is after its last step.
    #[default]
    Final,
    /// A picture (or page) for every step of a slide that has steps.
    Each,
}

/// Which slides a set of pictures is taken of.
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub enum Scope {
    /// Every slide that is shown (hidden slides are left out).
    #[default]
    All,
    /// The slide at this index (from 0), even if it is hidden.
    Slide(usize),
}

/// PNG pictures of slides.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct PngOptions {
    pub scope: Scope,
    /// Pixels to the slide unit: a slide of 960 x 540 units at 2 comes out at 1920 x 1080 pixels.
    pub scale: f32,
    pub steps: Steps,
}

impl Default for PngOptions {
    fn default() -> PngOptions {
        PngOptions {
            scope: Scope::All,
            scale: 2.0,
            steps: Steps::Final,
        }
    }
}

/// A deck printed to PDF.
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub struct PdfOptions {
    pub steps: Steps,
    /// Handout pages: the slide on the upper half of a portrait page with its speaker notes under it.
    pub notes: bool,
}

/// The deck as one offline web page.
#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct HtmlOptions {
    /// The file's name; made from the deck's title when left out.
    pub name: Option<String>,
}

/// A picture.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Png {
    pub bytes: Vec<u8>,
    pub width: u32,
    pub height: u32,
    /// What is not as it should be, in words for a person: a picture the deck names that was not found.
    pub warnings: Vec<String>,
}

/// One picture of a set: a slide at a step.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Picture {
    /// Its file's name in an archive, as the editor names it: `slide-03.png`, `slide-03-step-2.png`.
    pub name: String,
    /// The slide's place among the slides shown, from 1.
    pub number: usize,
    /// The slide's index in the deck, from 0.
    pub slide: usize,
    /// The step drawn; `None` for a slide without steps.
    pub step: Option<u32>,
    pub png: Png,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Pdf {
    pub bytes: Vec<u8>,
    pub pages: usize,
    pub warnings: Vec<String>,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct HtmlFile {
    pub name: String,
    pub text: String,
    /// What could not go in the page exactly, in words for a person.
    pub warnings: Vec<String>,
}

// What the page answers, as it sends it.

#[derive(Deserialize)]
pub(crate) struct SlideInfo {
    pub width: u32,
    pub height: u32,
}

#[derive(Deserialize)]
pub(crate) struct GridInfo {
    pub width: u32,
    pub height: u32,
}

#[derive(Deserialize)]
pub(crate) struct PrintInfo {
    pub pages: usize,
}

#[derive(Deserialize)]
pub(crate) struct PageRef {
    pub index: usize,
    pub step: Option<u32>,
    pub number: usize,
    pub name: String,
}

#[derive(Deserialize)]
pub(crate) struct HtmlResult {
    pub name: String,
    pub html: String,
    pub warnings: Vec<String>,
}
