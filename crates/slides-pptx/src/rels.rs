//! Relationships: how a part names the parts and addresses it uses. Ids are
//! handed out in the order they are first asked for, so the same deck always
//! gets the same ids.

use std::borrow::Cow;

use crate::xml::Xml;

pub const NS_RELS: &str = "http://schemas.openxmlformats.org/package/2006/relationships";
/// The address of an Office relationship type.
macro_rules! office {
    ($name:literal) => {
        concat!(
            "http://schemas.openxmlformats.org/officeDocument/2006/relationships/",
            $name
        )
    };
}

pub const OFFICE_DOCUMENT: &str = office!("officeDocument");
pub const CORE_PROPERTIES: &str =
    "http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties";
pub const EXTENDED_PROPERTIES: &str = office!("extended-properties");
pub const SLIDE_MASTER: &str = office!("slideMaster");
pub const SLIDE_LAYOUT: &str = office!("slideLayout");
pub const SLIDE: &str = office!("slide");
pub const NOTES_MASTER: &str = office!("notesMaster");
pub const NOTES_SLIDE: &str = office!("notesSlide");
pub const THEME: &str = office!("theme");
pub const PRES_PROPS: &str = office!("presProps");
pub const VIEW_PROPS: &str = office!("viewProps");
pub const TABLE_STYLES: &str = office!("tableStyles");
pub const IMAGE: &str = office!("image");
pub const HYPERLINK: &str = office!("hyperlink");

#[derive(Clone, Debug, PartialEq)]
struct Rel {
    id: String,
    kind: Cow<'static, str>,
    target: String,
    external: bool,
}

/// The relationships of one part.
#[derive(Clone, Debug, Default, PartialEq)]
pub struct Rels {
    items: Vec<Rel>,
}

impl Rels {
    pub fn new() -> Rels {
        Rels::default()
    }

    /// The id of the relationship of this kind to this target, made if it is new.
    pub fn add(&mut self, kind: &'static str, target: &str) -> String {
        self.add_as(kind, target, false)
    }

    /// The same for an address outside the file, such as a web page.
    pub fn add_external(&mut self, kind: &'static str, target: &str) -> String {
        self.add_as(kind, target, true)
    }

    fn add_as(&mut self, kind: &'static str, target: &str, external: bool) -> String {
        if let Some(found) = self
            .items
            .iter()
            .find(|r| r.kind == kind && r.target == target && r.external == external)
        {
            return found.id.clone();
        }
        let id = format!("rId{}", self.items.len() + 1);
        self.items.push(Rel {
            id: id.clone(),
            kind: Cow::Borrowed(kind),
            target: target.to_owned(),
            external,
        });
        id
    }

    /// A relationship of any kind an imported file had, under the id its part uses for it (`id`), or
    /// the next free one. Returns the id.
    pub fn add_kept(
        &mut self,
        id: Option<&str>,
        kind: &str,
        target: &str,
        external: bool,
    ) -> String {
        let id = match id {
            Some(id) => id.to_owned(),
            None => (self.items.len() + 1..)
                .map(|n| format!("rId{n}"))
                .find(|candidate| !self.items.iter().any(|r| &r.id == candidate))
                .unwrap_or_default(),
        };
        if self.items.iter().any(|r| r.id == id) {
            return id;
        }
        self.items.push(Rel {
            id: id.clone(),
            kind: Cow::Owned(kind.to_owned()),
            target: target.to_owned(),
            external,
        });
        id
    }

    pub fn is_empty(&self) -> bool {
        self.items.is_empty()
    }

    /// The part `.rels` file.
    pub fn to_xml(&self) -> Vec<u8> {
        let mut x = Xml::document();
        x.open("Relationships").attr("xmlns", NS_RELS);
        for rel in &self.items {
            x.open("Relationship")
                .attr("Id", &rel.id)
                .attr("Type", &rel.kind)
                .attr("Target", &rel.target);
            if rel.external {
                x.attr("TargetMode", "External");
            }
            x.close();
        }
        x.close();
        x.finish()
    }
}

/// A web address as a URI: what a URI may not hold is written as percent
/// escapes of its UTF-8, and what it may hold is kept.
pub fn uri(address: &str) -> String {
    const KEEP: &str = "-._~:/?#[]@!$&'()*+,;=%";
    let mut out = String::with_capacity(address.len());
    for byte in address.trim().bytes() {
        if byte.is_ascii_alphanumeric() || KEEP.as_bytes().contains(&byte) {
            out.push(char::from(byte));
        } else {
            out.push_str(&format!("%{byte:02X}"));
        }
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn ids_follow_the_order_of_first_use_and_repeat_for_the_same_target() {
        let mut rels = Rels::new();
        assert_eq!(
            rels.add(SLIDE_LAYOUT, "../slideLayouts/slideLayout2.xml"),
            "rId1"
        );
        assert_eq!(rels.add(IMAGE, "../media/image1.png"), "rId2");
        assert_eq!(rels.add(IMAGE, "../media/image1.png"), "rId2");
        assert_eq!(rels.add_external(HYPERLINK, "https://example.com/"), "rId3");
        assert_eq!(rels.add(HYPERLINK, "https://example.com/"), "rId4");
    }

    #[test]
    fn the_part_is_written_with_external_links_marked() {
        let mut rels = Rels::new();
        rels.add(SLIDE_LAYOUT, "../slideLayouts/slideLayout1.xml");
        rels.add_external(HYPERLINK, "https://example.com/?a=1&b=2");
        let text = String::from_utf8(rels.to_xml()).unwrap_or_default();
        assert_eq!(
            text,
            concat!(
                "<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?>\n",
                "<Relationships xmlns=\"http://schemas.openxmlformats.org/package/2006/relationships\">",
                "<Relationship Id=\"rId1\" Type=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout\" Target=\"../slideLayouts/slideLayout1.xml\"/>",
                "<Relationship Id=\"rId2\" Type=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink\" Target=\"https://example.com/?a=1&amp;b=2\" TargetMode=\"External\"/>",
                "</Relationships>"
            )
        );
    }

    #[test]
    fn an_address_keeps_what_a_uri_may_hold_and_escapes_the_rest() {
        assert_eq!(
            uri("https://example.com/a?b=1&c=2#top"),
            "https://example.com/a?b=1&c=2#top"
        );
        assert_eq!(uri("https://example.com/a b"), "https://example.com/a%20b");
        assert_eq!(uri("https://example.com/é"), "https://example.com/%C3%A9");
        assert_eq!(uri("https://example.com/%20"), "https://example.com/%20");
        assert_eq!(uri("  mailto:a@b.c "), "mailto:a@b.c");
    }
}
