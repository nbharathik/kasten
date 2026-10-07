//! Operations on the deck as a whole: its title, its theme and its logo.

use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use ts_rs::TS;

use super::util::merge_patch;
use super::{Cx, Op, Scope, op_types};
use crate::error::{Error, Result};
use crate::model::{Base, Deck, Element, Extra, ImageEl, Theme, is_hex};
use crate::themes as catalog;

/// The id of the master element that holds the deck's logo.
pub const LOGO: &str = "master-logo";

op_types! {
    pub struct SetTitle {
        pub title: String,
    }
}

impl Op for SetTitle {
    type Output = ();
    const NAME: &'static str = "set_title";
    const ABOUT: &'static str =
        "Rename the deck. The title shows in the deck list and in the outline.";

    fn scope(&self, _: &Deck) -> Scope {
        Scope::default().with_meta()
    }

    fn run(self, cx: &mut Cx) -> Result<()> {
        cx.deck.title = self.title;
        Ok(())
    }
}

op_types! {
    pub struct ApplyTheme {
        /// `Light`, `Dark`, `Serif` or `Lecture`.
        pub name: String,
    }
}

fn logo_of(theme: &Theme) -> Option<String> {
    theme.master.iter().find_map(|e| match e {
        Element::Image(i) if i.base.id == LOGO && !i.src.is_empty() => Some(i.src.clone()),
        _ => None,
    })
}

fn set_logo(theme: &mut Theme, src: &str) {
    for e in &mut theme.master {
        if let Element::Image(i) = e
            && i.base.id == LOGO
        {
            i.src = src.to_owned();
            return;
        }
    }
    let mut base = Base::new(LOGO).place(836.0, 8.0, 100.0, 40.0);
    base.alt = Some("Logo".to_owned());
    theme.master.push(Element::Image(ImageEl {
        base,
        src: src.to_owned(),
        crop: None,
        mask: None,
        extra: Extra::new(),
    }));
}

impl Op for ApplyTheme {
    type Output = ();
    const NAME: &'static str = "apply_theme";
    const ABOUT: &'static str = "Switch the deck to a built-in theme (Light, Dark, Serif, Lecture). Slides keep their layouts and content and take the new colours, fonts and slot positions; a logo set on the old theme carries over.";

    fn scope(&self, _: &Deck) -> Scope {
        Scope {
            theme: true,
            ..Scope::default()
        }
    }

    fn run(self, cx: &mut Cx) -> Result<()> {
        let mut theme = catalog::by_name(&self.name).ok_or_else(|| {
            Error::bad_input(
                Self::NAME,
                format!(
                    "there is no theme `{}`; the themes are: {}",
                    self.name,
                    catalog::all()
                        .iter()
                        .map(|t| t.name.clone())
                        .collect::<Vec<_>>()
                        .join(", ")
                ),
            )
        })?;
        if let Some(logo) = logo_of(&cx.deck.theme) {
            set_logo(&mut theme, &logo);
        }
        cx.deck.theme = theme;
        Ok(())
    }
}

op_types! {
    pub struct EditTheme {
        /// A JSON merge patch on the theme: `{"colors": {"accent1": "#0b5cad"}, "fonts": {"heading": {"family": "Lato"}}}`. A key set to null is removed.
        pub patch: Value,
    }
}

impl Op for EditTheme {
    type Output = ();
    const NAME: &'static str = "edit_theme";
    const ABOUT: &'static str = "Change the deck's own theme with a JSON merge patch: colours (text1, text2, bg1, bg2, accent1 to accent6 as #rrggbb), fonts, text styles, dimmed opacity, or the layouts and master elements.";

    fn scope(&self, _: &Deck) -> Scope {
        Scope {
            theme: true,
            ..Scope::default()
        }
    }

    fn run(self, cx: &mut Cx) -> Result<()> {
        let mut value =
            serde_json::to_value(&cx.deck.theme).map_err(|e| Error::bad_input(Self::NAME, e))?;
        merge_patch(&mut value, &self.patch);
        let theme: Theme =
            serde_json::from_value(value).map_err(|e| Error::bad_input(Self::NAME, e))?;
        let c = &theme.colors;
        for (name, hex) in [
            ("text1", &c.text1),
            ("text2", &c.text2),
            ("bg1", &c.bg1),
            ("bg2", &c.bg2),
            ("accent1", &c.accent1),
            ("accent2", &c.accent2),
            ("accent3", &c.accent3),
            ("accent4", &c.accent4),
            ("accent5", &c.accent5),
            ("accent6", &c.accent6),
        ] {
            if !is_hex(hex) {
                return Err(Error::bad_input(
                    Self::NAME,
                    format!("colour `{name}` is `{hex}`, which is not #rrggbb"),
                ));
            }
        }
        if !(0.0..=1.0).contains(&theme.dimmed_opacity) {
            return Err(Error::bad_input(
                Self::NAME,
                "dimmedOpacity is between 0 and 1",
            ));
        }
        cx.deck.theme = theme;
        Ok(())
    }
}

op_types! {
    pub struct SetLogo {
        /// An image in the host's image store, such as `assets/logo.png`; empty removes the logo.
        pub src: String,
    }
}

impl Op for SetLogo {
    type Output = ();
    const NAME: &'static str = "set_logo";
    const ABOUT: &'static str = "Set the deck's logo, shown by themes that have a logo slot (Lecture has one top right). The image must already be in the image store.";

    fn scope(&self, _: &Deck) -> Scope {
        Scope {
            theme: true,
            ..Scope::default()
        }
    }

    fn run(self, cx: &mut Cx) -> Result<()> {
        set_logo(&mut cx.deck.theme, &self.src);
        Ok(())
    }
}
