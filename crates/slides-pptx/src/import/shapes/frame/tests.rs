use super::*;
use crate::import::dom;

fn xfrm(xml: &str) -> Node {
    dom::parse(
        format!(r#"<x xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">{xml}</x>"#)
            .as_bytes(),
    )
    .unwrap_or_else(|e| panic!("{e}"))
    .root
    .elements()
    .next()
    .cloned()
    .unwrap_or_default()
}

fn frame(x: f64, y: f64, w: f64, h: f64) -> Frame {
    Frame {
        x,
        y,
        w,
        h,
        rot: 0.0,
        flip_h: false,
        flip_v: false,
    }
}

#[test]
fn a_frame_is_read_in_units_with_its_turn_and_mirrors() {
    let f = read(&xfrm(r#"<a:xfrm rot="5400000" flipH="1"><a:off x="952500" y="476250"/><a:ext cx="1905000" cy="952500"/></a:xfrm>"#))
        .unwrap_or_else(|| panic!("a frame"));
    assert_eq!(
        f,
        Frame {
            x: 100.0,
            y: 50.0,
            w: 200.0,
            h: 100.0,
            rot: 90.0,
            flip_h: true,
            flip_v: false
        }
    );
    assert_eq!(
        read(&xfrm(r#"<a:xfrm><a:off x="1" y="1"/></a:xfrm>"#)),
        None
    );
}

#[test]
fn a_group_maps_its_child_space_onto_its_box() {
    // Children are drawn in a 100 by 50 space at (1000, 1000); the group is 200 by 100 at (10, 20).
    let g = read_group(&xfrm(r#"<a:xfrm><a:off x="95250" y="190500"/><a:ext cx="1905000" cy="952500"/><a:chOff x="9525000" y="9525000"/><a:chExt cx="952500" cy="476250"/></a:xfrm>"#))
        .unwrap_or_else(|| panic!("a group"));
    let child = frame(1010.0, 1010.0, 20.0, 10.0);
    assert_eq!(through(&g, child), frame(30.0, 40.0, 40.0, 20.0));
}

#[test]
fn a_group_without_a_child_space_maps_onto_itself() {
    let g = read_group(&xfrm(
        r#"<a:xfrm><a:off x="95250" y="95250"/><a:ext cx="952500" cy="952500"/></a:xfrm>"#,
    ))
    .unwrap_or_else(|| panic!("a group"));
    assert_eq!(
        through(&g, frame(20.0, 30.0, 5.0, 5.0)),
        frame(20.0, 30.0, 5.0, 5.0)
    );
}

#[test]
fn a_turned_group_carries_its_children_round_its_own_centre() {
    // A 100 square group at (0, 0), turned a quarter; a child at its left middle goes to its top middle.
    let g = GroupXf {
        frame: Frame {
            rot: 90.0,
            ..frame(0.0, 0.0, 100.0, 100.0)
        },
        child_off: (0.0, 0.0),
        child_ext: (100.0, 100.0),
    };
    let out = through(&g, frame(0.0, 45.0, 10.0, 10.0));
    assert_eq!((out.x, out.y, out.rot), (45.0, 0.0, 90.0));
}

#[test]
fn a_mirrored_group_mirrors_positions_and_toggles_flips() {
    let g = GroupXf {
        frame: Frame {
            flip_h: true,
            ..frame(0.0, 0.0, 100.0, 100.0)
        },
        child_off: (0.0, 0.0),
        child_ext: (100.0, 100.0),
    };
    let out = through(
        &g,
        Frame {
            rot: 30.0,
            ..frame(0.0, 0.0, 20.0, 10.0)
        },
    );
    assert_eq!((out.x, out.y, out.w, out.h), (80.0, 0.0, 20.0, 10.0));
    assert!(out.flip_h && !out.flip_v);
    assert_eq!(
        out.rot, 330.0,
        "mirrored across one axis, a turn goes the other way"
    );
}

#[test]
fn nested_groups_compose_from_the_inside_out() {
    let inner = GroupXf {
        frame: frame(10.0, 10.0, 100.0, 100.0),
        child_off: (0.0, 0.0),
        child_ext: (50.0, 50.0),
    };
    let outer = GroupXf {
        frame: frame(100.0, 0.0, 200.0, 200.0),
        child_off: (0.0, 0.0),
        child_ext: (100.0, 100.0),
    };
    // (5, 5, 10, 10) is doubled by the inner group, moved to (20, 20, 20, 20), and doubled again by the outer.
    let out = place(&[outer, inner], frame(5.0, 5.0, 10.0, 10.0));
    assert_eq!(out, frame(140.0, 40.0, 40.0, 40.0));
}
