use super::*;

use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Barrier};
use std::thread;

fn temp(name: &str) -> PathBuf {
    let dir = std::env::temp_dir().join(format!("slides-files-{}-{name}", std::process::id()));
    let _ = fs::remove_dir_all(&dir);
    fs::create_dir_all(&dir).unwrap();
    dir
}

fn names(dir: &Path) -> Vec<String> {
    let mut found: Vec<String> = fs::read_dir(dir)
        .unwrap()
        .flatten()
        .map(|e| e.file_name().to_string_lossy().into_owned())
        .collect();
    found.sort();
    found
}

#[test]
fn a_file_is_written_whole_and_leaves_nothing_beside_it() {
    let dir = temp("whole");
    let file = dir.join("talk.deck");
    write_atomic(&file, b"one").unwrap();
    write_atomic(&file, b"two, longer").unwrap();
    assert_eq!(fs::read(&file).unwrap(), b"two, longer");
    assert_eq!(names(&dir), ["talk.deck"]);
}

#[cfg(windows)]
#[test]
fn a_brief_reader_without_delete_sharing_does_not_lose_the_save() {
    use std::os::windows::fs::OpenOptionsExt;
    let dir = temp("reader");
    let file = dir.join("talk.deck");
    fs::write(&file, b"old deck").unwrap();
    let reader = fs::OpenOptions::new()
        .read(true)
        .share_mode(1)
        .open(&file)
        .unwrap();
    let release = thread::spawn(move || {
        thread::sleep(std::time::Duration::from_millis(900));
        drop(reader);
    });
    let result = write_atomic(&file, b"complete new deck");
    release.join().unwrap();
    result.unwrap();
    assert_eq!(fs::read(&file).unwrap(), b"complete new deck");
    assert_eq!(names(&dir), ["talk.deck"]);
}

#[test]
fn writes_at_once_to_one_file_never_share_a_temporary_or_mix() {
    const SIZE: usize = 256 * 1024;
    let dir = temp("mixed");
    let file = dir.join("talk.deck");
    write_atomic(&file, &vec![b'0'; SIZE]).unwrap();
    let writers = 6;
    let start = Arc::new(Barrier::new(writers + 1));
    let done = Arc::new(AtomicBool::new(false));
    let threads: Vec<_> = (0..writers)
        .map(|n| {
            let (file, start) = (file.clone(), Arc::clone(&start));
            thread::spawn(move || {
                let text = vec![b'a' + n as u8; SIZE];
                start.wait();
                for _ in 0..30 {
                    write_atomic(&file, &text).unwrap();
                }
            })
        })
        .collect();
    // A reader sees one writer's whole text every time, never a blend of two.
    let reader = {
        let (file, done) = (file.clone(), Arc::clone(&done));
        thread::spawn(move || {
            while !done.load(Ordering::Relaxed) {
                let seen = fs::read(&file).unwrap();
                assert_eq!(seen.len(), SIZE);
                assert!(seen.iter().all(|b| *b == seen[0]), "two writes blended");
            }
        })
    };
    start.wait();
    for thread in threads {
        thread.join().unwrap();
    }
    done.store(true, Ordering::Relaxed);
    reader.join().unwrap();
    assert_eq!(names(&dir), ["talk.deck"], "no temporary is left behind");
}

#[test]
fn a_temporary_never_takes_the_name_of_another() {
    let mut seen = std::collections::HashSet::new();
    for _ in 0..1000 {
        assert!(seen.insert(temporary_name("talk.deck")));
    }
    // Long names stay inside what a file system allows.
    let longest = "x".repeat(200);
    assert!(temporary_name(&longest).len() < 255);
}
