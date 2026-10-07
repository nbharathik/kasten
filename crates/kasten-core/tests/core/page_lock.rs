//! A person locks a page from the app: `locked: true` in its frontmatter,
//! set and cleared by the header op, one line each. A locked page is
//! read-only for agents, so an agent can neither write to it nor unlock it.

use crate::common;

use std::fs;

use common::{NOW, dev_vault};
use kasten_core::agent::{AgentOp, Session};
use kasten_core::history::Actor;
use kasten_core::{Error, Kasten, set_meta};

const PAGE: &str = "library/lock.md";

#[test]
fn locks_and_unlocks_a_page_one_line_each() {
    let t = dev_vault();
    fs::write(
        t.vault.root().join(PAGE),
        "---\ntitle: Ledger\nupdated: 2026-09-01T00:00:00Z\n---\nBody.\n",
    )
    .unwrap();
    let locked = set_meta(&t.vault, PAGE, "locked", Some("true"), NOW).unwrap();
    assert_eq!(
        locked.text,
        "---\ntitle: Ledger\nupdated: 2026-09-24T08:00:00Z\nlocked: true\n---\nBody.\n"
    );
    assert!(locked.meta.locked);
    let open = set_meta(&t.vault, PAGE, "locked", None, NOW).unwrap();
    assert_eq!(
        open.text,
        "---\ntitle: Ledger\nupdated: 2026-09-24T08:00:00Z\n---\nBody.\n"
    );
    assert!(!open.meta.locked);
}

#[test]
fn locks_only_with_true_and_unlocks_by_clearing() {
    let t = dev_vault();
    let text = "---\ntitle: Ledger\n---\nBody.\n";
    fs::write(t.vault.root().join(PAGE), text).unwrap();
    for bad in ["false", "yes", "True", ""] {
        assert!(
            matches!(
                set_meta(&t.vault, PAGE, "locked", Some(bad), NOW),
                Err(Error::Invalid(_))
            ),
            "{bad}"
        );
    }
    assert_eq!(fs::read_to_string(t.vault.root().join(PAGE)).unwrap(), text);
}

#[test]
fn a_page_locked_in_the_app_is_read_only_for_agents() {
    let t = dev_vault();
    let k = Kasten::open(t.vault.root()).unwrap();
    k.start_history().unwrap();
    let path = "library/welcome-to-kasten.md";
    k.set_meta(&Actor::Human, path, "locked", Some("true"), NOW)
        .unwrap();
    let session = Session::start("claude-code", NOW);
    let append = AgentOp::Append {
        path: path.into(),
        markdown: "x".into(),
        heading: None,
    };
    let err = k.agent_run(&session, &append, NOW).unwrap_err();
    assert!(err.to_string().contains("locked"), "{err}");
    // Nor can an agent take the lock off.
    let err = k
        .set_meta(&session.actor(), path, "locked", None, NOW)
        .unwrap_err();
    assert!(err.to_string().contains("locked"), "{err}");
    assert!(k.read(path).unwrap().meta.locked);
}
