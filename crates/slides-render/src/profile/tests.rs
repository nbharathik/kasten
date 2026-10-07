use std::ffi::OsString;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, AtomicUsize, Ordering};

use super::*;

fn scratch(name: &str) -> PathBuf {
    static N: AtomicUsize = AtomicUsize::new(0);
    std::env::temp_dir().join(format!(
        "slides-render-{name}-{}-{}",
        std::process::id(),
        N.fetch_add(1, Ordering::Relaxed)
    ))
}

fn lookup(vars: &[(&str, &str)]) -> impl Fn(&str) -> Option<OsString> {
    let vars: Vec<(String, OsString)> = vars
        .iter()
        .map(|(k, v)| ((*k).to_owned(), OsString::from(v)))
        .collect();
    move |name| vars.iter().find(|(k, _)| k == name).map(|(_, v)| v.clone())
}

#[test]
fn two_hosts_at_once_get_two_folders_and_a_folder_comes_back_when_let_go() {
    let base = scratch("slots");
    let first = claim_in(&BROWSER, &base, &[]).unwrap_or_else(|e| panic!("{e}"));
    let second = claim_in(&BROWSER, &base, &[]).unwrap_or_else(|e| panic!("{e}"));
    assert_ne!(first.dir, second.dir);
    assert!(first.dir.is_dir() && second.dir.is_dir());
    let (n, dir) = (first.number, first.dir.clone());
    drop(first);
    let again = claim_in(&BROWSER, &base, &[]).unwrap_or_else(|e| panic!("{e}"));
    assert_eq!(
        (again.number, again.dir.clone()),
        (n, dir),
        "the freed folder is the first one lent out again"
    );
    drop((second, again));
    let _ = fs::remove_dir_all(&base);
}

#[test]
fn folders_named_to_leave_out_are_left_out() {
    let base = scratch("skip");
    let slot = claim_in(&BROWSER, &base, &[0, 1]).unwrap_or_else(|e| panic!("{e}"));
    assert_eq!(slot.number, 2);
    let _ = fs::remove_dir_all(&base);
}

#[test]
fn when_every_folder_is_taken_the_error_says_so() {
    let base = scratch("full");
    let held: Vec<Slot> = (0..SLOTS)
        .map(|_| claim_in(&BROWSER, &base, &[]).unwrap_or_else(|e| panic!("{e}")))
        .collect();
    let error = claim_in(&BROWSER, &base, &[])
        .err()
        .map(|e| e.to_string())
        .unwrap_or_default();
    assert!(error.contains("in use"), "{error}");
    drop(held);
    let _ = fs::remove_dir_all(&base);
}

#[test]
fn the_first_place_that_works_is_used_and_the_others_are_told_of_when_none_does() {
    let good = scratch("good");
    // A file where a folder is wanted cannot hold profiles.
    let bad = scratch("bad");
    fs::write(&bad, "not a folder").unwrap_or_else(|e| panic!("{e}"));
    let slot =
        claim(&BROWSER, &[bad.join("inside"), good.clone()], &[]).unwrap_or_else(|e| panic!("{e}"));
    assert!(slot.dir.starts_with(&good));
    assert!(claim(&BROWSER, &[bad.join("inside")], &[]).is_err());
    let said = claim(&BROWSER, &[], &[])
        .err()
        .map(|e| e.to_string())
        .unwrap_or_default();
    assert!(said.contains("nowhere"), "{said}");
    drop(slot);
    let _ = fs::remove_dir_all(&good);
    let _ = fs::remove_file(&bad);
}

#[test]
fn the_folders_are_made_closed_to_other_users() {
    let base = scratch("closed");
    let slot = claim_in(&BROWSER, &base, &[]).unwrap_or_else(|e| panic!("{e}"));
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        for dir in [&base, &slot.dir] {
            let mode = fs::metadata(dir)
                .map(|m| m.permissions().mode() & 0o777)
                .unwrap_or(0);
            assert_eq!(mode, 0o700, "{}", dir.display());
        }
        let lock = fs::metadata(base.join("slot-0.lock"))
            .map(|m| m.permissions().mode() & 0o777)
            .unwrap_or(0);
        assert_eq!(lock, 0o600);
    }
    drop(slot);
    let _ = fs::remove_dir_all(&base);
}

#[cfg(unix)]
mod hostile {
    use std::os::unix::fs::{PermissionsExt, chown, symlink};

    use super::*;

    fn chmod(path: &Path, mode: u32) {
        fs::set_permissions(path, fs::Permissions::from_mode(mode))
            .unwrap_or_else(|e| panic!("{e}"));
    }

    #[test]
    fn a_place_that_is_open_to_other_users_is_not_used() {
        let base = scratch("open-base");
        fs::create_dir_all(&base).unwrap_or_else(|e| panic!("{e}"));
        chmod(&base, 0o755);
        let said = claim_in(&BROWSER, &base, &[])
            .err()
            .map(|e| e.to_string())
            .unwrap_or_default();
        assert!(
            said.contains("can be entered by other users") && said.contains("chmod 700"),
            "{said}"
        );
        assert!(!base.join("slot-0.lock").exists(), "nothing was made in it");
        // With a good place after it, that one is used.
        let good = scratch("good-after");
        let slot =
            claim(&BROWSER, &[base.clone(), good.clone()], &[]).unwrap_or_else(|e| panic!("{e}"));
        assert!(slot.dir.starts_with(&good));
        drop(slot);
        let _ = fs::remove_dir_all(&base);
        let _ = fs::remove_dir_all(&good);
    }

    #[test]
    fn a_place_that_another_user_planted_is_not_used() {
        if crate::private::current_uid() != Some(0) {
            eprintln!("SKIPPED: only the administrator can hand a folder to another user");
            return;
        }
        let base = scratch("planted-base");
        crate::private::ensure_private(&base).unwrap_or_else(|e| panic!("{e}"));
        chown(&base, Some(4242), None).unwrap_or_else(|e| panic!("{e}"));
        let said = claim_in(&BROWSER, &base, &[])
            .err()
            .map(|e| e.to_string())
            .unwrap_or_default();
        assert!(said.contains("belongs to another user"), "{said}");
        let _ = fs::remove_dir_all(&base);
    }

    #[test]
    fn a_place_that_is_a_link_is_not_used_and_nothing_is_made_through_it() {
        let elsewhere = scratch("link-target");
        fs::create_dir_all(&elsewhere).unwrap_or_else(|e| panic!("{e}"));
        let base = scratch("link-base");
        symlink(&elsewhere, &base).unwrap_or_else(|e| panic!("{e}"));
        let said = claim_in(&BROWSER, &base, &[])
            .err()
            .map(|e| e.to_string())
            .unwrap_or_default();
        assert!(said.contains("link or a file"), "{said}");
        assert_eq!(
            fs::read_dir(&elsewhere).map(Iterator::count).unwrap_or(9),
            0,
            "nothing was made in the folder the link points to"
        );
        let _ = fs::remove_dir_all(&elsewhere);
        let _ = fs::remove_file(&base);
    }

    #[test]
    fn a_folder_that_is_open_planted_or_a_link_is_passed_over_and_the_next_is_used() {
        let base = scratch("slots-hostile");
        crate::private::ensure_private(&base).unwrap_or_else(|e| panic!("{e}"));
        // Slot 0: a folder made open. Slot 1: a link to a folder of somebody's. Slot 2: their file where the lock goes.
        fs::create_dir(base.join("profile-0")).unwrap_or_else(|e| panic!("{e}"));
        chmod(&base.join("profile-0"), 0o777);
        let victim = scratch("victim");
        fs::create_dir_all(&victim).unwrap_or_else(|e| panic!("{e}"));
        symlink(&victim, base.join("profile-1")).unwrap_or_else(|e| panic!("{e}"));
        let outside = scratch("outside.txt");
        fs::write(&outside, "keep me").unwrap_or_else(|e| panic!("{e}"));
        symlink(&outside, base.join("slot-2.lock")).unwrap_or_else(|e| panic!("{e}"));
        let slot = claim_in(&BROWSER, &base, &[]).unwrap_or_else(|e| panic!("{e}"));
        assert_eq!(slot.number, 3, "the first three were passed over");
        assert_eq!(
            fs::read_to_string(&outside).unwrap_or_default(),
            "keep me",
            "no lock was taken through the link"
        );
        assert_eq!(
            fs::read_dir(&victim).map(Iterator::count).unwrap_or(9),
            0,
            "nothing was made through the link"
        );
        drop(slot);
        // When nothing is fit, the error says why the first was not.
        let all: Vec<usize> = (3..SLOTS).collect();
        let said = claim_in(&BROWSER, &base, &all)
            .err()
            .map(|e| e.to_string())
            .unwrap_or_default();
        assert!(
            said.contains("none of the") && said.contains("profile-0"),
            "{said}"
        );
        let _ = fs::remove_dir_all(&base);
        let _ = fs::remove_dir_all(&victim);
        let _ = fs::remove_file(&outside);
    }

    #[test]
    fn a_folder_that_belongs_to_another_user_is_passed_over() {
        if crate::private::current_uid() != Some(0) {
            eprintln!("SKIPPED: only the administrator can hand a folder to another user");
            return;
        }
        let base = scratch("slots-theirs");
        crate::private::ensure_private(&base).unwrap_or_else(|e| panic!("{e}"));
        crate::private::ensure_private(&base.join("profile-0")).unwrap_or_else(|e| panic!("{e}"));
        chown(base.join("profile-0"), Some(4242), None).unwrap_or_else(|e| panic!("{e}"));
        let slot = claim_in(&BROWSER, &base, &[]).unwrap_or_else(|e| panic!("{e}"));
        assert_eq!(slot.number, 1);
        drop(slot);
        let _ = fs::remove_dir_all(&base);
    }
}

#[test]
fn places_are_the_named_one_then_the_cache_then_the_temporary_folder() {
    let places = bases(
        &BROWSER,
        lookup(&[
            ("SLIDES_RENDER_PROFILES", "/somewhere"),
            ("HOME", "/home/me"),
            ("USER", "me"),
        ]),
    );
    assert_eq!(places[0], Path::new("/somewhere"));
    if cfg!(target_os = "linux") {
        assert_eq!(places[1], Path::new("/home/me/.cache/kasten-slides/render"));
    }
    let last = places
        .last()
        .map(|p| p.to_string_lossy().into_owned())
        .unwrap_or_default();
    let token = crate::private::process_token();
    assert!(
        last.ends_with(&format!("kasten-slides-render-me-{token}")),
        "{last}"
    );
    if cfg!(target_os = "linux") {
        let xdg = bases(
            &BROWSER,
            lookup(&[("XDG_CACHE_HOME", "/cache"), ("HOME", "/home/me")]),
        );
        assert_eq!(xdg[0], Path::new("/cache/kasten-slides/render"));
    }
    let bare = bases(&BROWSER, lookup(&[]));
    assert!(
        bare.last()
            .is_some_and(|p| p.to_string_lossy().contains("kasten-slides-render-user-"))
    );
}

#[test]
fn each_pool_has_places_and_a_setting_of_its_own() {
    let places = bases(
        &WORKPLACES,
        lookup(&[
            ("SLIDES_WORKPLACES", "/work"),
            ("SLIDES_RENDER_PROFILES", "/profiles"),
            ("HOME", "/home/me"),
            ("USER", "me"),
        ]),
    );
    assert_eq!(places[0], Path::new("/work"));
    assert!(!places.contains(&PathBuf::from("/profiles")));
    if cfg!(target_os = "linux") {
        assert_eq!(
            places[1],
            Path::new("/home/me/.cache/kasten-slides/previews")
        );
    }
    assert!(
        places
            .last()
            .is_some_and(|p| p.to_string_lossy().contains("kasten-slides-previews-me-"))
    );
    // Folders of different pools under the same base do not collide.
    let base = scratch("two-pools");
    let a = claim_in(&BROWSER, &base, &[]).unwrap_or_else(|e| panic!("{e}"));
    let b = claim_in(&WORKPLACES, &base, &[]).unwrap_or_else(|e| panic!("{e}"));
    assert!(
        a.dir.ends_with("profile-0") && b.dir.ends_with("work-1"),
        "{:?} {:?}",
        a.dir,
        b.dir
    );
    drop((a, b));
    let _ = fs::remove_dir_all(&base);
}

#[test]
fn the_last_resort_in_the_temporary_folder_has_a_name_nobody_can_guess() {
    let temp = |user: &str| {
        bases(&BROWSER, lookup(&[("USER", user)]))
            .pop()
            .unwrap_or_default()
    };
    let (first, second) = (temp("me"), temp("me"));
    assert_eq!(first, second, "the same for the whole run");
    let name = first
        .file_name()
        .map(|n| n.to_string_lossy().into_owned())
        .unwrap_or_default();
    let token = name.strip_prefix("kasten-slides-render-me-").unwrap_or("");
    assert_eq!(token.len(), 24, "{name}");
    assert!(token.chars().all(|c| c.is_ascii_hexdigit()), "{name}");
    // The person's own cache folder, where there is one, is used before it and needs no such name.
    let all = bases(
        &BROWSER,
        lookup(&[
            ("HOME", "/home/me"),
            ("LOCALAPPDATA", "C:/cache/me"),
            ("USER", "me"),
        ]),
    );
    assert_eq!(all.len(), 2);
    assert_ne!(all.last(), all.first());
}

#[test]
fn a_user_name_cannot_make_a_path() {
    let places = bases(&BROWSER, lookup(&[("USER", "../evil")]));
    let last = places
        .last()
        .map(|p| p.to_string_lossy().into_owned())
        .unwrap_or_default();
    assert!(last.contains("kasten-slides-render-evil-"), "{last}");
}

#[test]
fn a_place_passed_over_is_said_once_with_its_reason_and_where_the_run_went_instead() {
    let said = AtomicBool::new(false);
    let mut lines: Vec<String> = Vec::new();
    let why = vec![
        "/home/me/.cache/kasten-slides/render can be entered by other users (mode 755); close it to them with `chmod 700 /home/me/.cache/kasten-slides/render`"
            .to_owned(),
    ];
    let used = Path::new("/tmp/kasten-slides-render-me-ab12/profile-0");
    say_passed_over(&said, &why, used, |line| lines.push(line.to_owned()));
    say_passed_over(&said, &why, Path::new("/tmp/elsewhere"), |line| {
        lines.push(line.to_owned());
    });
    assert_eq!(lines.len(), 1, "said once: {lines:?}");
    assert!(
        lines[0].starts_with("note: ")
            && lines[0].contains("chmod 700 /home/me/.cache/kasten-slides/render")
            && lines[0].contains("/tmp/kasten-slides-render-me-ab12/profile-0"),
        "{}",
        lines[0]
    );
    // A run that went to the first place has nothing to say.
    let quiet = AtomicBool::new(false);
    say_passed_over(&quiet, &[], used, |line| panic!("said {line}"));
    assert!(
        !quiet.load(Ordering::Relaxed),
        "and it is still free to say it later"
    );
}
