//! Sections: named stretches of the deck. A section starts at a slide and
//! lasts up to the slide before the next section, so it is known by the slide
//! it starts at. These make one, rename one and take one away; the slides are
//! never touched. (`move_slides` and `delete_slides` see to the sections when the
//! slide one starts at goes.)

use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use ts_rs::TS;

use super::{Cx, Op, Scope, op_types};
use crate::error::{Error, Result};
use crate::model::{Deck, Section};

op_types! {
    /// Starts a section at a slide.
    pub struct AddSection {
        /// The slide the section starts at. It lasts up to the slide before the next section.
        pub at: String,
        /// What the section is called.
        pub title: String,
    }

    /// Gives a section another name.
    pub struct RenameSection {
        /// The slide the section starts at.
        pub at: String,
        /// What the section is called now.
        pub title: String,
    }

    /// Takes a section header away.
    pub struct RemoveSection {
        /// The slide the section starts at.
        pub at: String,
    }
}

/// What a section is called, without the space round it; a section has to have a name.
fn named(title: &str) -> Result<String> {
    let title = title.trim();
    if title.is_empty() {
        return Err(Error::refused(
            "A section needs a name: give it a title that is not empty.",
        ));
    }
    Ok(title.to_owned())
}

/// The index of the section that starts at the slide `at`, once the slide is known to be there.
fn section_at(deck: &Deck, at: &str) -> Result<usize> {
    deck.index_of(at).ok_or_else(|| Error::no_slide(at))?;
    deck.sections
        .iter()
        .position(|s| s.starts_at == at)
        .ok_or_else(|| {
            let starts: Vec<String> = deck
                .sections
                .iter()
                .map(|s| format!("`{}` ({})", s.starts_at, s.title))
                .collect();
            let known = if starts.is_empty() {
                "The deck has no sections".to_owned()
            } else {
                format!("Sections start at {}", starts.join(", "))
            };
            Error::refused(format!(
                "Slide `{at}` does not start a section. {known}; add_section starts one."
            ))
        })
}

impl Op for AddSection {
    type Output = ();
    const NAME: &'static str = "add_section";
    const ABOUT: &'static str = "Start a section at a slide: a named stretch of the deck that lasts up to the slide before the next section. The slides are not changed. Refused if a section already starts at that slide (rename_section or remove_section it instead).";

    fn scope(&self, _: &Deck) -> Scope {
        Scope::default().with_meta()
    }

    fn run(self, cx: &mut Cx) -> Result<()> {
        let index = cx
            .deck
            .index_of(&self.at)
            .ok_or_else(|| Error::no_slide(&self.at))?;
        if let Some(section) = cx.deck.sections.iter().find(|s| s.starts_at == self.at) {
            return Err(Error::refused(format!(
                "The section \"{}\" already starts at slide `{}`. Use rename_section to give it another name, or remove_section to take it away.",
                section.title, self.at
            )));
        }
        let title = named(&self.title)?;
        // The sections stay in the order of the slides they start at.
        let before = cx
            .deck
            .sections
            .iter()
            .filter(|s| cx.deck.index_of(&s.starts_at).is_some_and(|at| at < index))
            .count();
        cx.deck.sections.insert(
            before.min(cx.deck.sections.len()),
            Section {
                title,
                starts_at: self.at,
                extra: crate::model::Extra::new(),
            },
        );
        Ok(())
    }
}

impl Op for RenameSection {
    type Output = ();
    const NAME: &'static str = "rename_section";
    const ABOUT: &'static str = "Give the section that starts at a slide another name. Refused if no section starts at that slide.";

    fn scope(&self, _: &Deck) -> Scope {
        Scope::default().with_meta()
    }

    fn run(self, cx: &mut Cx) -> Result<()> {
        let n = section_at(cx.deck, &self.at)?;
        cx.deck.sections[n].title = named(&self.title)?;
        Ok(())
    }
}

impl Op for RemoveSection {
    type Output = ();
    const NAME: &'static str = "remove_section";
    const ABOUT: &'static str = "Take away the section that starts at a slide: its slides stay, and belong to the section before, if there is one. Refused if no section starts at that slide.";

    fn scope(&self, _: &Deck) -> Scope {
        Scope::default().with_meta()
    }

    fn run(self, cx: &mut Cx) -> Result<()> {
        let n = section_at(cx.deck, &self.at)?;
        cx.deck.sections.remove(n);
        Ok(())
    }
}
