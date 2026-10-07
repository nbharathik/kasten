//! The preset geometries PowerPoint knows, and where a connector can attach to
//! the ones a diagram uses.

use slides_core::Side;

/// Every `prst` PowerPoint accepts for a shape (ECMA-376's `ST_ShapeType`), sorted.
const PRESETS: [&str; 187] = [
    "accentBorderCallout1",
    "accentBorderCallout2",
    "accentBorderCallout3",
    "accentCallout1",
    "accentCallout2",
    "accentCallout3",
    "actionButtonBackPrevious",
    "actionButtonBeginning",
    "actionButtonBlank",
    "actionButtonDocument",
    "actionButtonEnd",
    "actionButtonForwardNext",
    "actionButtonHelp",
    "actionButtonHome",
    "actionButtonInformation",
    "actionButtonMovie",
    "actionButtonReturn",
    "actionButtonSound",
    "arc",
    "bentArrow",
    "bentConnector2",
    "bentConnector3",
    "bentConnector4",
    "bentConnector5",
    "bentUpArrow",
    "bevel",
    "blockArc",
    "borderCallout1",
    "borderCallout2",
    "borderCallout3",
    "bracePair",
    "bracketPair",
    "callout1",
    "callout2",
    "callout3",
    "can",
    "chartPlus",
    "chartStar",
    "chartX",
    "chevron",
    "chord",
    "circularArrow",
    "cloud",
    "cloudCallout",
    "corner",
    "cornerTabs",
    "cube",
    "curvedConnector2",
    "curvedConnector3",
    "curvedConnector4",
    "curvedConnector5",
    "curvedDownArrow",
    "curvedLeftArrow",
    "curvedRightArrow",
    "curvedUpArrow",
    "decagon",
    "diagStripe",
    "diamond",
    "dodecagon",
    "donut",
    "doubleWave",
    "downArrow",
    "downArrowCallout",
    "ellipse",
    "ellipseRibbon",
    "ellipseRibbon2",
    "flowChartAlternateProcess",
    "flowChartCollate",
    "flowChartConnector",
    "flowChartDecision",
    "flowChartDelay",
    "flowChartDisplay",
    "flowChartDocument",
    "flowChartExtract",
    "flowChartInputOutput",
    "flowChartInternalStorage",
    "flowChartMagneticDisk",
    "flowChartMagneticDrum",
    "flowChartMagneticTape",
    "flowChartManualInput",
    "flowChartManualOperation",
    "flowChartMerge",
    "flowChartMultidocument",
    "flowChartOfflineStorage",
    "flowChartOffpageConnector",
    "flowChartOnlineStorage",
    "flowChartOr",
    "flowChartPredefinedProcess",
    "flowChartPreparation",
    "flowChartProcess",
    "flowChartPunchedCard",
    "flowChartPunchedTape",
    "flowChartSort",
    "flowChartSummingJunction",
    "flowChartTerminator",
    "foldedCorner",
    "frame",
    "funnel",
    "gear6",
    "gear9",
    "halfFrame",
    "heart",
    "heptagon",
    "hexagon",
    "homePlate",
    "horizontalScroll",
    "irregularSeal1",
    "irregularSeal2",
    "leftArrow",
    "leftArrowCallout",
    "leftBrace",
    "leftBracket",
    "leftCircularArrow",
    "leftRightArrow",
    "leftRightArrowCallout",
    "leftRightCircularArrow",
    "leftRightRibbon",
    "leftRightUpArrow",
    "leftUpArrow",
    "lightningBolt",
    "line",
    "lineInv",
    "mathDivide",
    "mathEqual",
    "mathMinus",
    "mathMultiply",
    "mathNotEqual",
    "mathPlus",
    "moon",
    "noSmoking",
    "nonIsoscelesTrapezoid",
    "notchedRightArrow",
    "octagon",
    "parallelogram",
    "pentagon",
    "pie",
    "pieWedge",
    "plaque",
    "plaqueTabs",
    "plus",
    "quadArrow",
    "quadArrowCallout",
    "rect",
    "ribbon",
    "ribbon2",
    "rightArrow",
    "rightArrowCallout",
    "rightBrace",
    "rightBracket",
    "round1Rect",
    "round2DiagRect",
    "round2SameRect",
    "roundRect",
    "rtTriangle",
    "smileyFace",
    "snip1Rect",
    "snip2DiagRect",
    "snip2SameRect",
    "snipRoundRect",
    "squareTabs",
    "star10",
    "star12",
    "star16",
    "star24",
    "star32",
    "star4",
    "star5",
    "star6",
    "star7",
    "star8",
    "straightConnector1",
    "stripedRightArrow",
    "sun",
    "swooshArrow",
    "teardrop",
    "trapezoid",
    "triangle",
    "upArrow",
    "upArrowCallout",
    "upDownArrow",
    "upDownArrowCallout",
    "uturnArrow",
    "verticalScroll",
    "wave",
    "wedgeEllipseCallout",
    "wedgeRectCallout",
    "wedgeRoundRectCallout",
];

/// Whether PowerPoint has a preset geometry of this name.
pub fn is_preset(name: &str) -> bool {
    PRESETS.binary_search(&name).is_ok()
}

/// The connection site of a shape that is at the middle of `side`, as the
/// preset numbers its sites; None where the preset has no site there, so a
/// connector to it is written unattached rather than attached to another spot.
///
/// A rectangle numbers its sites top, left, bottom, right, and so do the
/// diamond, the flowchart shapes that are boxes, the cross and the callouts (a
/// callout has a fifth, at the tip of its tail). An ellipse has eight, going
/// round from the top: top, top left, left, bottom left, bottom, bottom right,
/// right, top right. LibreOffice, which numbers the sites of every preset as
/// PowerPoint does, was checked for each of these. A trapezoid, a hexagon, a
/// triangle or an arrow has no site at the middle of a side of its box, so a
/// connector to one is not attached.
pub fn site(shape: &str, side: Side) -> Option<u32> {
    match shape {
        "rect"
        | "roundRect"
        | "diamond"
        | "flowChartProcess"
        | "flowChartAlternateProcess"
        | "flowChartDecision"
        | "flowChartTerminator"
        | "flowChartPreparation"
        | "plus"
        | "wedgeRectCallout"
        | "wedgeRoundRectCallout" => Some(match side {
            Side::Top => 0,
            Side::Left => 1,
            Side::Bottom => 2,
            Side::Right => 3,
        }),
        "ellipse" => Some(match side {
            Side::Top => 0,
            Side::Left => 2,
            Side::Bottom => 4,
            Side::Right => 6,
        }),
        _ => None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_list_is_sorted_so_it_can_be_searched() {
        assert!(PRESETS.windows(2).all(|pair| pair[0] < pair[1]));
    }

    #[test]
    fn the_presets_a_deck_uses_are_known_and_a_typo_is_not() {
        for name in [
            "rect",
            "roundRect",
            "ellipse",
            "triangle",
            "rtTriangle",
            "diamond",
            "parallelogram",
            "trapezoid",
            "pentagon",
            "hexagon",
            "octagon",
            "plus",
            "star4",
            "star5",
            "star6",
            "star8",
            "chevron",
            "homePlate",
            "rightArrow",
            "leftArrow",
            "upArrow",
            "downArrow",
            "leftRightArrow",
            "wedgeRectCallout",
            "wedgeRoundRectCallout",
            "can",
            "flowChartProcess",
            "flowChartAlternateProcess",
            "flowChartDecision",
            "flowChartTerminator",
            "flowChartConnector",
            "flowChartPreparation",
            "flowChartInputOutput",
            "flowChartManualOperation",
        ] {
            assert!(is_preset(name), "{name}");
        }
        assert!(!is_preset("circle") && !is_preset("Rect") && !is_preset(""));
    }

    #[test]
    fn a_rectangle_and_the_shapes_that_share_its_numbering_put_top_left_bottom_right_first() {
        for shape in [
            "rect",
            "roundRect",
            "diamond",
            "flowChartProcess",
            "flowChartAlternateProcess",
            "flowChartDecision",
            "flowChartTerminator",
            "flowChartPreparation",
            "plus",
            "wedgeRectCallout",
            "wedgeRoundRectCallout",
        ] {
            let numbers: Vec<_> = [Side::Top, Side::Left, Side::Bottom, Side::Right]
                .into_iter()
                .map(|s| site(shape, s))
                .collect();
            assert_eq!(numbers, [Some(0), Some(1), Some(2), Some(3)], "{shape}");
        }
    }

    #[test]
    fn an_ellipse_has_its_sides_at_every_other_site() {
        let numbers: Vec<_> = [Side::Top, Side::Left, Side::Bottom, Side::Right]
            .into_iter()
            .map(|s| site("ellipse", s))
            .collect();
        assert_eq!(numbers, [Some(0), Some(2), Some(4), Some(6)]);
    }

    #[test]
    fn a_shape_whose_sites_are_not_known_takes_no_attachment() {
        assert_eq!(site("triangle", Side::Top), None);
        assert_eq!(site("hexagon", Side::Left), None);
        assert_eq!(site("flowChartConnector", Side::Left), None);
    }
}
