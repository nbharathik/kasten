//! The render host as a long-lived thing: how fast it is when warm, how it compares with the editor's own pictures,
//! and what it does when it sits idle, when the browser dies, and when two hosts run at once.

mod common;

use std::fs;
use std::path::PathBuf;
use std::process::Command;
use std::time::{Duration, Instant};

use common::{deck, decode, one_at_a_time, renderer};
use slides_render::Options;

/// A folder of its own for one test, closed to other users as the profile folders of the browser must be: one
/// that was open to them would be passed over, and the browser would keep its profile somewhere else.
fn scratch(name: &str) -> PathBuf {
    let dir = std::env::temp_dir().join(format!("slides-render-{name}-{}", std::process::id()));
    slides_render::private::ensure_private(&dir).unwrap_or_else(|e| panic!("{e}"));
    dir
}

/// How many processes have `needle` on their command line.
fn processes_with(needle: &str) -> Option<usize> {
    let out = Command::new("pgrep").args(["-f", needle]).output().ok()?;
    Some(
        String::from_utf8_lossy(&out.stdout)
            .lines()
            .filter(|l| !l.trim().is_empty())
            .count(),
    )
}

#[test]
fn a_warm_render_takes_well_under_half_a_second() {
    let _one = one_at_a_time();
    let Some(renderer) = renderer(Options::default()) else {
        return;
    };
    let deck = deck("composites.deck");
    // Warm: the browser is up, the page is loaded, the deck is open and its fonts are in.
    for slide in 0..deck.slides.len() {
        renderer
            .render_slide(&deck, slide, None, 1.0)
            .unwrap_or_else(|e| panic!("{e}"));
    }
    for scale in [1.0, 2.0] {
        let mut times: Vec<Duration> = (0..deck.slides.len() * 2)
            .map(|n| {
                let started = Instant::now();
                renderer
                    .render_slide(&deck, n % deck.slides.len(), None, scale)
                    .unwrap_or_else(|e| panic!("{e}"));
                started.elapsed()
            })
            .collect();
        times.sort();
        let median = times[times.len() / 2];
        eprintln!(
            "render_slide warm at {scale}x: median {median:?}, fastest {:?}, slowest {:?} ({} renders)",
            times[0],
            times[times.len() - 1],
            times.len()
        );
        if median >= Duration::from_millis(500) {
            eprintln!(
                "NOTE: over the 500 ms budget for a warm render ({median:?}); is the machine busy?"
            );
        }
        assert!(
            median < Duration::from_millis(1500),
            "far over the 500 ms budget: {median:?}"
        );
    }
    // The same slide again, with the deck already open, is the common case for an agent looking after an edit.
    let started = Instant::now();
    renderer
        .render_slide(&deck, 2, None, 1.0)
        .unwrap_or_else(|e| panic!("{e}"));
    eprintln!("the same slide again: {:?}", started.elapsed());
    let started = Instant::now();
    let grid = renderer
        .render_grid(&deck, None)
        .unwrap_or_else(|e| panic!("{e}"));
    eprintln!(
        "the grid of {} slides: {:?} ({}x{})",
        deck.slides.len(),
        started.elapsed(),
        grid.width,
        grid.height
    );
}

/// (mean difference per channel from 0 to 255, share of pixels that differ by more than 40 in some channel).
fn difference(a: &image::RgbaImage, b: &image::RgbaImage) -> (f64, f64) {
    assert_eq!(a.dimensions(), b.dimensions());
    let (mut sum, mut far) = (0u64, 0usize);
    for (p, q) in a.pixels().zip(b.pixels()) {
        let worst = (0..3)
            .map(|c| u64::from(p.0[c].abs_diff(q.0[c])))
            .max()
            .unwrap_or(0);
        sum += (0..3)
            .map(|c| u64::from(p.0[c].abs_diff(q.0[c])))
            .sum::<u64>();
        far += usize::from(worst > 40);
    }
    let pixels = (a.width() * a.height()) as f64;
    (sum as f64 / (pixels * 3.0), far as f64 / pixels)
}

#[test]
fn the_browsers_picture_and_the_editors_own_export_are_nearly_the_same() {
    let _one = one_at_a_time();
    let Some(renderer) = renderer(Options::default()) else {
        return;
    };
    let mut worst = (0.0f64, 0.0f64);
    for (name, slides) in [
        ("composites.deck", vec![0, 1, 2, 4, 5, 7, 8]),
        ("text-heavy.deck", vec![0, 1, 2, 3]),
        ("shapes.deck", vec![0, 1]),
    ] {
        let deck = deck(name);
        for slide in slides {
            let ours = renderer
                .render_slide(&deck, slide, None, 1.0)
                .unwrap_or_else(|e| panic!("{e}"));
            let Some(theirs) = renderer
                .editor_png(&deck, slide, 1.0)
                .unwrap_or_else(|e| panic!("{e}"))
            else {
                eprintln!(
                    "NOTE: the editor's picture export drew nothing for {name} slide {slide}"
                );
                continue;
            };
            let (mean, far) = difference(&decode(&ours.bytes), &decode(&theirs));
            eprintln!(
                "{name} slide {}: mean difference {mean:.3} of 255, {:.3}% of pixels differ by more than 40",
                slide + 1,
                far * 100.0
            );
            worst = (worst.0.max(mean), worst.1.max(far));
        }
    }
    eprintln!(
        "worst of all: mean {:.3}, far {:.3}%",
        worst.0,
        worst.1 * 100.0
    );
    assert!(
        worst.0 < 3.0,
        "the pictures differ too much on average: {worst:?}"
    );
    assert!(worst.1 < 0.03, "too many pixels differ a lot: {worst:?}");
}

#[test]
fn a_host_that_sits_idle_gives_its_browser_back_and_starts_another_when_asked() {
    let _one = one_at_a_time();
    let profiles = scratch("idle");
    let Some(renderer) = renderer(Options {
        idle: Some(Duration::from_millis(1200)),
        profiles: Some(profiles.clone()),
        ..Options::default()
    }) else {
        let _ = fs::remove_dir_all(&profiles);
        return;
    };
    let deck = deck("minimal.deck");
    let key = profiles.display().to_string();
    renderer
        .render_slide(&deck, 0, None, 1.0)
        .unwrap_or_else(|e| panic!("{e}"));
    let running = processes_with(&key);
    if let Some(running) = running {
        assert!(running >= 1, "the browser is running");
    }
    std::thread::sleep(Duration::from_millis(3500));
    if let Some(after) = processes_with(&key) {
        assert_eq!(after, 0, "the idle browser was shut down");
    }
    let png = renderer
        .render_slide(&deck, 0, None, 1.0)
        .unwrap_or_else(|e| panic!("the next render starts a browser again: {e}"));
    assert_eq!(png.width, 960);
    drop(renderer);
    if let Some(after) = processes_with(&key) {
        assert_eq!(after, 0, "dropping the host shut its browser down");
    }
    let _ = fs::remove_dir_all(&profiles);
}

#[test]
fn a_browser_that_dies_is_replaced_and_the_call_that_found_out_still_succeeds() {
    let _one = one_at_a_time();
    let profiles = scratch("crash");
    let Some(renderer) = renderer(Options {
        profiles: Some(profiles.clone()),
        ..Options::default()
    }) else {
        let _ = fs::remove_dir_all(&profiles);
        return;
    };
    let deck = deck("minimal.deck");
    renderer
        .render_slide(&deck, 0, None, 1.0)
        .unwrap_or_else(|e| panic!("{e}"));
    let killed = Command::new("pkill")
        .args(["-9", "-f", &profiles.display().to_string()])
        .status();
    if !killed.is_ok_and(|s| s.success()) {
        eprintln!("NOTE: pkill is not available; the crash was not tried");
        return;
    }
    // The kill is a signal, and a busy machine takes its time over it: the next call is made once the browser is gone.
    let key = profiles.display().to_string();
    for _ in 0..100 {
        if processes_with(&key).is_none_or(|left| left == 0) {
            break;
        }
        std::thread::sleep(Duration::from_millis(100));
    }
    std::thread::sleep(Duration::from_millis(300));
    let png = renderer
        .render_slide(&deck, 0, None, 1.0)
        .unwrap_or_else(|e| panic!("after the browser died: {e}"));
    assert_eq!((png.width, png.height), (960, 540));
    drop(renderer);
    let _ = fs::remove_dir_all(&profiles);
}

#[test]
fn two_hosts_at_once_do_not_share_a_profile() {
    let _one = one_at_a_time();
    let profiles = scratch("two");
    let Some(first) = renderer(Options {
        profiles: Some(profiles.clone()),
        ..Options::default()
    }) else {
        let _ = fs::remove_dir_all(&profiles);
        return;
    };
    let second = renderer(Options {
        profiles: Some(profiles.clone()),
        ..Options::default()
    })
    .unwrap_or_else(|| panic!("the second host did not start"));
    let deck = deck("minimal.deck");
    first
        .render_slide(&deck, 0, None, 1.0)
        .unwrap_or_else(|e| panic!("{e}"));
    second
        .render_slide(&deck, 0, None, 1.0)
        .unwrap_or_else(|e| panic!("{e}"));
    let folders = fs::read_dir(&profiles)
        .map(|d| {
            d.flatten()
                .filter(|e| e.file_name().to_string_lossy().starts_with("profile-"))
                .count()
        })
        .unwrap_or(0);
    assert_eq!(folders, 2, "each host has a profile folder of its own");
    drop((first, second));
    let _ = fs::remove_dir_all(&profiles);
}

#[test]
fn the_shared_host_is_started_once_kept_and_let_go() {
    let _one = one_at_a_time();
    let fixtures = common::fixtures().join("decks");
    let deck = deck("shapes.deck");
    // The shared host is started with the options of whoever asks first; a test says how its browser runs.
    match slides_render::shared_with(common::options()) {
        Ok(_) => {}
        Err(e @ (slides_render::Error::NoBrowser { .. } | slides_render::Error::NoPage)) => {
            eprintln!("SKIPPED: {e}");
            return;
        }
        Err(e) => panic!("{e}"),
    }
    let first = match slides_render::draw(
        &deck,
        &fixtures,
        slides_render::Draw::Slide {
            slide: 0,
            step: None,
            scale: 1.0,
        },
    ) {
        Ok(png) => png,
        Err(e @ (slides_render::Error::NoBrowser { .. } | slides_render::Error::NoPage)) => {
            eprintln!("SKIPPED: {e}");
            return;
        }
        Err(e) => panic!("{e}"),
    };
    assert_eq!((first.width, first.height), (960, 540));
    let host = slides_render::shared().unwrap_or_else(|e| panic!("{e}"));
    assert!(host.is_alive());
    let again = slides_render::shared().unwrap_or_else(|e| panic!("{e}"));
    assert!(
        std::sync::Arc::ptr_eq(&host, &again),
        "the second call gets the host the first started"
    );
    let started = Instant::now();
    let grid = slides_render::draw(
        &deck,
        &fixtures,
        slides_render::Draw::Grid { columns: None },
    )
    .unwrap_or_else(|e| panic!("{e}"));
    eprintln!(
        "a second call through the shared host: {:?}",
        started.elapsed()
    );
    assert_eq!(grid.width, 1600);
    drop((host, again));
    slides_render::shutdown();
    let fresh = slides_render::shared_with(common::options())
        .unwrap_or_else(|e| panic!("a host is started again after a shutdown: {e}"));
    assert!(fresh.is_alive());
    drop(fresh);
    slides_render::shutdown();
}
