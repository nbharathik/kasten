#![cfg(unix)]

use std::fs;
use std::io::ErrorKind;
use std::path::PathBuf;
use std::sync::atomic::{AtomicUsize, Ordering};

use super::*;

/// A folder of its own for one test, under the system's temporary folder.
fn scratch(name: &str) -> PathBuf {
    static N: AtomicUsize = AtomicUsize::new(0);
    let dir = std::env::temp_dir().join(format!(
        "slides-render-private-{name}-{}-{}",
        std::process::id(),
        N.fetch_add(1, Ordering::Relaxed)
    ));
    fs::create_dir_all(&dir).unwrap_or_else(|e| panic!("{e}"));
    dir
}

fn message(result: io::Result<()>, kind: ErrorKind) -> String {
    match result {
        Err(e) if e.kind() == kind => e.to_string(),
        other => panic!("expected {kind:?}, got {other:?}"),
    }
}

#[cfg(unix)]
mod unix {
    use std::os::unix::fs::{MetadataExt, PermissionsExt, chown, symlink};

    use super::*;

    fn mode(path: &Path) -> u32 {
        fs::symlink_metadata(path)
            .unwrap_or_else(|e| panic!("{e}"))
            .mode()
            & 0o777
    }

    fn chmod(path: &Path, mode: u32) {
        fs::set_permissions(path, fs::Permissions::from_mode(mode))
            .unwrap_or_else(|e| panic!("{e}"));
    }

    #[test]
    fn the_system_says_which_user_this_is() {
        let me = current_uid().unwrap_or_else(|| panic!("no user"));
        let made = scratch("uid").join("f");
        write_new(&made, b"x").unwrap_or_else(|e| panic!("{e}"));
        assert_eq!(
            fs::metadata(&made).map(|m| m.uid()).unwrap_or(u32::MAX),
            me,
            "a file this program makes is this user's"
        );
    }

    #[test]
    fn a_folder_that_is_made_is_closed_to_other_users() {
        let dir = scratch("made").join("a").join("b");
        ensure_private(&dir).unwrap_or_else(|e| panic!("{e}"));
        assert_eq!(mode(&dir), 0o700);
        // Used again, it is still fine.
        ensure_private(&dir).unwrap_or_else(|e| panic!("{e}"));
        check_private(&dir).unwrap_or_else(|e| panic!("{e}"));
    }

    #[test]
    fn a_folder_that_other_users_can_enter_is_refused_and_the_message_says_how_to_close_it() {
        for open in [0o755, 0o750, 0o705, 0o777, 0o701] {
            let dir = scratch("open").join("f");
            fs::create_dir(&dir).unwrap_or_else(|e| panic!("{e}"));
            chmod(&dir, open);
            let said = message(ensure_private(&dir), ErrorKind::PermissionDenied);
            assert!(
                said.contains("can be entered by other users")
                    && said.contains("chmod 700")
                    && said.contains(&dir.display().to_string()),
                "{open:o}: {said}"
            );
        }
        // One this user cannot even enter is no use either.
        let dir = scratch("closed").join("f");
        fs::create_dir(&dir).unwrap_or_else(|e| panic!("{e}"));
        chmod(&dir, 0o500);
        assert!(ensure_private(&dir).is_err());
        chmod(&dir, 0o700);
    }

    #[test]
    fn a_link_is_never_taken_for_a_folder() {
        let base = scratch("link");
        let real = base.join("real");
        ensure_private(&real).unwrap_or_else(|e| panic!("{e}"));
        let link = base.join("link");
        symlink(&real, &link).unwrap_or_else(|e| panic!("{e}"));
        let said = message(ensure_private(&link), ErrorKind::PermissionDenied);
        assert!(said.contains("link or a file"), "{said}");
        // A link to nothing, and a plain file, are the same.
        let dangling = base.join("dangling");
        symlink(base.join("nowhere"), &dangling).unwrap_or_else(|e| panic!("{e}"));
        message(ensure_private(&dangling), ErrorKind::PermissionDenied);
        assert!(
            !base.join("nowhere").exists(),
            "nothing was made through the link"
        );
        let file = base.join("file");
        fs::write(&file, "x").unwrap_or_else(|e| panic!("{e}"));
        message(ensure_private(&file), ErrorKind::PermissionDenied);
    }

    #[test]
    fn a_folder_that_belongs_to_another_user_is_refused() {
        if current_uid() != Some(0) {
            eprintln!("SKIPPED: only the administrator can hand a folder to another user");
            return;
        }
        let dir = scratch("owner").join("planted");
        ensure_private(&dir).unwrap_or_else(|e| panic!("{e}"));
        chown(&dir, Some(4242), None).unwrap_or_else(|e| panic!("{e}"));
        let said = message(ensure_private(&dir), ErrorKind::PermissionDenied);
        assert!(said.contains("belongs to another user"), "{said}");
        assert!(check_private(&dir).is_err());
    }

    #[test]
    fn a_folder_made_for_one_use_is_refused_when_anything_is_there_already() {
        let base = scratch("once");
        let target = base.join("victim");
        fs::write(&target, "keep me").unwrap_or_else(|e| panic!("{e}"));
        for (name, plant) in [
            ("dir", 0),
            ("file", 1),
            ("link-to-file", 2),
            ("dangling-link", 3),
            ("link-to-dir", 4),
        ] {
            let at = base.join(name);
            match plant {
                0 => fs::create_dir(&at).unwrap_or_else(|e| panic!("{e}")),
                1 => fs::write(&at, "x").unwrap_or_else(|e| panic!("{e}")),
                2 => symlink(&target, &at).unwrap_or_else(|e| panic!("{e}")),
                3 => symlink(base.join("nowhere"), &at).unwrap_or_else(|e| panic!("{e}")),
                _ => symlink(&base, &at).unwrap_or_else(|e| panic!("{e}")),
            }
            message(create_private(&at), ErrorKind::AlreadyExists);
        }
        assert_eq!(fs::read_to_string(&target).unwrap_or_default(), "keep me");
        assert!(!base.join("nowhere").exists());
        let fresh = base.join("fresh");
        create_private(&fresh).unwrap_or_else(|e| panic!("{e}"));
        assert_eq!(mode(&fresh), 0o700);
    }

    #[test]
    fn a_file_is_never_written_through_a_link_or_over_another_file() {
        let base = scratch("write");
        ensure_private(&base.join("in")).unwrap_or_else(|e| panic!("{e}"));
        let dir = base.join("in");
        let victim = base.join("victim.txt");
        fs::write(&victim, "keep me").unwrap_or_else(|e| panic!("{e}"));
        symlink(&victim, dir.join("import.pptx")).unwrap_or_else(|e| panic!("{e}"));
        message(
            write_new(&dir.join("import.pptx"), b"overwritten"),
            ErrorKind::AlreadyExists,
        );
        assert_eq!(
            fs::read_to_string(&victim).unwrap_or_default(),
            "keep me",
            "the link was not followed"
        );
        symlink(base.join("nowhere.txt"), dir.join("dangling")).unwrap_or_else(|e| panic!("{e}"));
        message(
            write_new(&dir.join("dangling"), b"x"),
            ErrorKind::AlreadyExists,
        );
        assert!(
            !base.join("nowhere.txt").exists(),
            "nothing was made through a link to nothing"
        );
        write_new(&dir.join("plain"), b"first").unwrap_or_else(|e| panic!("{e}"));
        assert_eq!(mode(&dir.join("plain")), 0o600);
        message(
            write_new(&dir.join("plain"), b"second"),
            ErrorKind::AlreadyExists,
        );
        assert_eq!(
            fs::read_to_string(dir.join("plain")).unwrap_or_default(),
            "first"
        );
    }

    #[test]
    fn a_file_kept_for_reuse_is_written_again_only_if_it_is_a_plain_file_of_this_user() {
        let base = scratch("again");
        let dir = base.join("in");
        ensure_private(&dir).unwrap_or_else(|e| panic!("{e}"));
        let file = dir.join("import.pptx");
        overwrite_own(&file, b"one").unwrap_or_else(|e| panic!("{e}"));
        overwrite_own(&file, b"second and longer").unwrap_or_else(|e| panic!("{e}"));
        overwrite_own(&file, b"3").unwrap_or_else(|e| panic!("{e}"));
        assert_eq!(
            fs::read(&file).unwrap_or_default(),
            b"3",
            "the old bytes are gone"
        );
        assert_eq!(mode(&file), 0o600);
        let victim = base.join("victim.txt");
        fs::write(&victim, "keep me").unwrap_or_else(|e| panic!("{e}"));
        let link = dir.join("linked");
        symlink(&victim, &link).unwrap_or_else(|e| panic!("{e}"));
        message(overwrite_own(&link, b"x"), ErrorKind::PermissionDenied);
        assert_eq!(fs::read_to_string(&victim).unwrap_or_default(), "keep me");
        if current_uid() == Some(0) {
            let theirs = dir.join("theirs");
            fs::write(&theirs, "x").unwrap_or_else(|e| panic!("{e}"));
            chown(&theirs, Some(4242), None).unwrap_or_else(|e| panic!("{e}"));
            let said = message(overwrite_own(&theirs, b"y"), ErrorKind::PermissionDenied);
            assert!(said.contains("belongs to another user"), "{said}");
        }
    }
}

#[test]
fn random_names_cannot_be_guessed() {
    let names: std::collections::BTreeSet<String> = (0..200).map(|_| random_hex(16)).collect();
    assert_eq!(names.len(), 200);
    assert!(
        names
            .iter()
            .all(|n| n.len() == 32 && n.chars().all(|c| c.is_ascii_hexdigit()))
    );
    assert_ne!(random_hex(16), "0".repeat(32));
    assert_eq!(random_hex(3).len(), 6);
}
