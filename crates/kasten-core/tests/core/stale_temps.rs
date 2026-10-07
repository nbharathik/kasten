//! A write that stops half way (a crash, a power cut) can leave its hidden
//! temporary file beside the note. History never takes one in, and one an
//! hour old or more is tidied away when the vault opens.

use crate::common;

use std::fs::{self, File};
use std::time::{Duration, SystemTime};

use common::dev_vault;
use kasten_core::Kasten;
use kasten_core::history::History;

#[test]
fn a_left_over_temporary_file_is_never_committed_and_goes_once_stale() {
    let t = dev_vault();
    let root = t.vault.root().to_owned();
    let k = Kasten::open(&root).unwrap();
    k.start_history().unwrap();

    let fresh = root.join("library/.kasten-01K6ZZZZZZZZZZZZZZZZZZZZZZ.tmp");
    let stale = root.join("inbox/.kasten-01K0AAAAAAAAAAAAAAAAAAAAAA.tmp");
    fs::create_dir_all(stale.parent().unwrap()).unwrap();
    fs::write(&fresh, "half a note").unwrap();
    fs::write(&stale, "half another").unwrap();
    File::options()
        .write(true)
        .open(&stale)
        .unwrap()
        .set_modified(SystemTime::now() - Duration::from_secs(2 * 3600))
        .unwrap();

    assert!(
        History::open(&root)
            .unwrap()
            .unwrap()
            .dirty()
            .unwrap()
            .is_empty()
    );
    assert_eq!(k.commit_external().unwrap(), None);

    drop(k);
    let _k = Kasten::open(&root).unwrap();
    assert!(!stale.exists());
    // One a write may still be finishing stays.
    assert!(fresh.exists());
    // Files that only look alike are the person's own.
    let theirs = root.join("library/.kasten-notes.tmp.md");
    fs::write(&theirs, "mine").unwrap();
    drop(_k);
    let _k = Kasten::open(&root).unwrap();
    assert!(theirs.exists());
}
