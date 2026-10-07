//! "Save this page as a template": the page's text, tags, properties and
//! icon become a template named by the person, its title a `{{title}}`
//! placeholder. It never overwrites a template, and only a person can do
//! it; agents propose templates for review instead.

use crate::common;

use std::fs;

use common::{NOW, dev_vault};
use kasten_core::history::Actor;
use kasten_core::{Error, Kasten, Kind, NewNote};

fn open() -> (common::TempVault, Kasten) {
    let t = dev_vault();
    let k = Kasten::open(t.vault.root()).unwrap();
    k.start_history().unwrap();
    (t, k)
}

const PAGE: &str = "---\nid: 01K5Y2WE1C0MEPAGE00000000S\ntitle: Sprint notes\ntype: page\ncreated: 2026-09-01T08:00:00Z\nupdated: 2026-09-02T08:00:00Z\nicon: 🏃\ncover: sunrise\ntags: [meeting]\nprops:\n  status: Open\n---\n## Goals\n\n- Ship it\n";

#[test]
fn keeps_the_text_tags_properties_and_icon_under_a_title_placeholder() {
    let (t, k) = open();
    fs::write(t.vault.root().join("library/sprint-notes.md"), PAGE).unwrap();
    let made = k
        .save_as_template(&Actor::Human, "library/sprint-notes.md", "Sprint", NOW)
        .unwrap();
    assert_eq!(made.meta.path, "templates/sprint.md");
    assert_eq!(
        made.text,
        "---\ntitle: \"{{title}}\"\ntype: page\nicon: 🏃\ntags: [meeting]\nprops:\n  status: Open\n---\n## Goals\n\n- Ship it\n"
    );
    assert_eq!(
        k.log(None, 1).unwrap()[0].summary,
        "template: save Sprint from Sprint notes"
    );
    // A new page can start from it at once.
    let page = k
        .create(
            &Actor::Human,
            &NewNote {
                kind: Kind::Page,
                title: "Next sprint".into(),
                date: "2026-09-28".into(),
                project: None,
                parent: None,
                template: Some("sprint".into()),
                icon: None,
            },
            NOW,
        )
        .unwrap();
    assert!(
        page.text.contains("## Goals\n\n- Ship it\n") && page.text.contains("title: Next sprint")
    );
}

#[test]
fn never_overwrites_a_template_and_refuses_agents_and_blank_names() {
    let (t, k) = open();
    fs::write(t.vault.root().join("library/sprint-notes.md"), PAGE).unwrap();
    let meeting = fs::read_to_string(t.vault.root().join("templates/meeting.md")).unwrap();
    let taken = k.save_as_template(&Actor::Human, "library/sprint-notes.md", "Meeting", NOW);
    assert!(
        matches!(taken, Err(Error::Invalid(ref m)) if m.contains("already")),
        "{taken:?}"
    );
    assert_eq!(
        fs::read_to_string(t.vault.root().join("templates/meeting.md")).unwrap(),
        meeting
    );
    for name in ["", "   ", "../x"] {
        assert!(
            k.save_as_template(&Actor::Human, "library/sprint-notes.md", name, NOW)
                .is_err(),
            "{name:?}"
        );
    }
    let agent = Actor::Agent {
        client: "test".into(),
        session: "s-1".into(),
    };
    assert!(matches!(
        k.save_as_template(&agent, "library/sprint-notes.md", "Mine", NOW),
        Err(Error::Invalid(_))
    ));
    assert!(!t.vault.root().join("templates/mine.md").exists());
}
