//! What an import tells the person: how many slides and pictures came, what
//! became `raw` (kept, but not editable) and everything that was changed or
//! left out on the way. Nothing is dropped without a line here.

use std::collections::HashSet;

/// Something an import could not do exactly, and what it did instead.
#[derive(Clone, Debug, PartialEq, Eq, Hash)]
pub struct Warning {
    /// The slide it concerns, by id.
    pub slide: Option<String>,
    /// The element it concerns, by id.
    pub element: Option<String>,
    pub message: String,
}

/// An object kept as `raw`: it exports back as it was, but the editor cannot change it.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct RawNote {
    pub slide: String,
    pub element: String,
    /// What it was, such as `pptx:chart`.
    pub original: String,
}

/// The outcome of an import, beyond the deck itself.
#[derive(Clone, Debug, Default, PartialEq)]
pub struct ImportReport {
    pub slides: usize,
    /// Slides the file marks as hidden.
    pub hidden: usize,
    /// Pictures returned with the deck.
    pub pictures: usize,
    pub raw: Vec<RawNote>,
    pub warnings: Vec<Warning>,
}

/// The most warnings kept, so a hostile file cannot make the report the biggest thing in memory.
const MOST_WARNINGS: usize = 2000;

/// Collects an import's warnings, each said once.
#[derive(Default)]
pub struct Collector {
    warnings: Vec<Warning>,
    seen: HashSet<Warning>,
    overflow: usize,
    pub raw: Vec<RawNote>,
}

impl Collector {
    pub fn warn(&mut self, slide: Option<&str>, element: Option<&str>, message: impl Into<String>) {
        let warning = Warning {
            slide: slide.map(str::to_owned),
            element: element.map(str::to_owned),
            message: message.into(),
        };
        if self.seen.contains(&warning) {
            return;
        }
        if self.warnings.len() >= MOST_WARNINGS {
            self.overflow += 1;
            return;
        }
        self.seen.insert(warning.clone());
        self.warnings.push(warning);
    }

    /// The warnings, with a last line saying how many more there were.
    pub fn finish(mut self) -> (Vec<Warning>, Vec<RawNote>) {
        if self.overflow > 0 {
            self.warnings.push(Warning {
                slide: None,
                element: None,
                message: format!("{} more warnings were left out", self.overflow),
            });
        }
        (self.warnings, self.raw)
    }

    /// How many warnings there are.
    #[cfg(test)]
    pub fn count(&self) -> usize {
        self.warnings.len()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_warning_that_repeats_is_told_once_and_a_flood_is_cut_off() {
        let mut c = Collector::default();
        c.warn(Some("s-1"), None, "a");
        c.warn(Some("s-1"), None, "a");
        c.warn(Some("s-2"), None, "a");
        assert_eq!(c.count(), 2);
        for n in 0..MOST_WARNINGS + 10 {
            c.warn(None, None, format!("problem {n}"));
        }
        let (warnings, _) = c.finish();
        assert_eq!(warnings.len(), MOST_WARNINGS + 1);
        assert!(
            warnings
                .last()
                .is_some_and(|w| w.message.contains("more warnings"))
        );
    }
}
