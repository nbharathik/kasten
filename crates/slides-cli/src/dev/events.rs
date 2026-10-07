//! Telling open pages that a deck, picture or bibliography file changed on disk, whoever
//! changed it (another editor, an agent, `slides op`). The folder is looked at
//! a few times a second; a change is one small event down a stream each page
//! keeps open.

use std::io::Write;
use std::net::TcpStream;
use std::sync::mpsc::{Receiver, RecvTimeoutError, Sender, channel};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::Duration;

use serde_json::json;

use super::folder::{Folder, Prints};
use super::http::write_event_stream_head;

const LOOK_EVERY: Duration = Duration::from_millis(400);
const KEEP_ALIVE: Duration = Duration::from_secs(15);

/// The open streams. A stream that cannot be written to is dropped.
#[derive(Default)]
pub struct Hub {
    listeners: Mutex<Vec<Sender<String>>>,
}

impl Hub {
    pub fn listen(&self) -> Receiver<String> {
        let (send, receive) = channel();
        if let Ok(mut listeners) = self.listeners.lock() {
            listeners.push(send);
        }
        receive
    }

    pub fn tell(&self, event: &str) {
        if let Ok(mut listeners) = self.listeners.lock() {
            listeners.retain(|l| l.send(event.to_owned()).is_ok());
        }
    }
}

/// What a path in the prints is: a picture, a bibliography file (a citation's keys are read from
/// those, so a page reads them again), or a deck.
fn kind_of(path: &str) -> &'static str {
    if path.starts_with("assets/") {
        "asset"
    } else if crate::refs::is_bib(path) {
        "references"
    } else {
        "deck"
    }
}

/// The events between two looks at the folder.
pub fn changes(before: &Prints, after: &Prints, folder: &Folder) -> Vec<String> {
    let mut out = Vec::new();
    for (path, print) in after {
        let change = match before.get(path) {
            None => "added",
            Some(old) if old != print => "changed",
            Some(_) => continue,
        };
        let kind = kind_of(path);
        let hash = (kind == "deck")
            .then(|| folder.read(path).map(|d| d.hash).ok())
            .flatten();
        out.push(json!({ "kind": kind, "change": change, "path": path, "hash": hash }).to_string());
    }
    for path in before.keys().filter(|p| !after.contains_key(*p)) {
        out.push(json!({ "kind": kind_of(path), "change": "removed", "path": path }).to_string());
    }
    out
}

/// Looks at the folder from now on, in a thread of its own, and tells the hub.
pub fn watch(folder: Arc<Folder>, hub: Arc<Hub>) {
    thread::spawn(move || {
        let mut before = folder.prints();
        loop {
            thread::sleep(LOOK_EVERY);
            let after = folder.prints();
            if after != before {
                for event in changes(&before, &after, &folder) {
                    hub.tell(&event);
                }
                before = after;
            }
        }
    });
}

/// Serves one page's stream until it goes away.
pub fn serve(stream: &TcpStream, hub: &Hub) {
    if write_event_stream_head(stream).is_err() {
        return;
    }
    let events = hub.listen();
    let mut out = stream;
    if out.write_all(b": ready\n\n").is_err() {
        return;
    }
    loop {
        let sent = match events.recv_timeout(KEEP_ALIVE) {
            Ok(event) => out.write_all(format!("data: {event}\n\n").as_bytes()),
            Err(RecvTimeoutError::Timeout) => out.write_all(b": keep-alive\n\n"),
            Err(RecvTimeoutError::Disconnected) => return,
        };
        if sent.and_then(|()| out.flush()).is_err() {
            return;
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    fn folder(name: &str) -> Folder {
        let dir = std::env::temp_dir().join(format!("slides-events-{}-{name}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        Folder::open(&dir).unwrap()
    }

    #[test]
    fn tells_what_was_added_changed_and_removed() {
        let folder = folder("changes");
        let deck = folder.create("Talk", "Light").unwrap();
        let first = folder.prints();
        assert!(changes(&first, &first, &folder).is_empty());

        let empty = Prints::new();
        let added = changes(&empty, &first, &folder);
        assert_eq!(added.len(), 1);
        assert!(added[0].contains("\"change\":\"added\"") && added[0].contains(&deck.hash));

        let mut moved = first.clone();
        moved.get_mut(&deck.path).unwrap().1 += 1;
        let changed = changes(&moved, &first, &folder);
        assert!(changed[0].contains("\"change\":\"changed\""));

        let removed = changes(&first, &empty, &folder);
        assert!(removed[0].contains("\"change\":\"removed\""));
    }

    fn parsed(event: &str) -> serde_json::Value {
        serde_json::from_str(event).unwrap()
    }

    #[test]
    fn tells_when_a_bibliography_file_was_added_changed_or_removed() {
        let folder = folder("bibliography");
        let empty = folder.prints();
        fs::write(folder.root().join("refs.bib"), "@article{a, title={One}}").unwrap();
        fs::write(folder.root().join("More.BIB"), "@article{b, title={Two}}").unwrap();
        fs::write(folder.root().join("notes.bib.txt"), "not a bibliography").unwrap();
        let first = folder.prints();

        let added = changes(&first, &first, &folder);
        assert!(added.is_empty(), "nothing moved: {added:?}");
        let added: Vec<_> = changes(&empty, &first, &folder)
            .iter()
            .map(|e| parsed(e))
            .collect();
        assert_eq!(
            added.len(),
            2,
            "two .bib files and not the text file: {added:?}"
        );
        for event in &added {
            assert_eq!(event["kind"], "references", "{event}");
            assert_eq!(event["change"], "added");
            assert!(event["hash"].is_null(), "a bibliography has no deck hash");
        }
        assert_eq!(
            added
                .iter()
                .map(|e| e["path"].as_str().unwrap())
                .collect::<Vec<_>>(),
            ["More.BIB", "refs.bib"]
        );

        fs::write(
            folder.root().join("refs.bib"),
            "@article{a, title={One, edited}}",
        )
        .unwrap();
        let second = folder.prints();
        let changed = changes(&first, &second, &folder);
        assert_eq!(changed.len(), 1, "{changed:?}");
        assert_eq!(parsed(&changed[0])["kind"], "references");
        assert_eq!(parsed(&changed[0])["change"], "changed");
        assert_eq!(parsed(&changed[0])["path"], "refs.bib");

        let mut gone = second.clone();
        gone.remove("refs.bib");
        let removed = changes(&second, &gone, &folder);
        assert_eq!(removed.len(), 1, "{removed:?}");
        assert_eq!(parsed(&removed[0])["kind"], "references");
        assert_eq!(parsed(&removed[0])["change"], "removed");
    }

    #[test]
    fn a_deck_and_a_picture_are_still_told_as_what_they_are() {
        let folder = folder("kinds");
        let empty = Prints::new();
        folder.create("Talk", "Light").unwrap();
        folder.add_asset("a.png", b"1").unwrap();
        fs::write(folder.root().join("refs.bib"), "@article{a}").unwrap();
        let kinds: Vec<String> = changes(&empty, &folder.prints(), &folder)
            .iter()
            .map(|e| parsed(e)["kind"].as_str().unwrap().to_owned())
            .collect();
        // In the order of the paths: assets/a.png, refs.bib, talk.deck.
        assert_eq!(kinds, ["asset", "references", "deck"]);
    }

    #[test]
    fn the_hub_forgets_a_stream_that_is_gone() {
        let hub = Hub::default();
        let kept = hub.listen();
        drop(hub.listen());
        hub.tell("one");
        assert_eq!(kept.try_recv().unwrap(), "one");
        assert_eq!(hub.listeners.lock().unwrap().len(), 1);
    }
}
