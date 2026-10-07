use super::*;
use crate::rawpart::Part;

const REL: &str = "http://schemas.openxmlformats.org/officeDocument/2006/relationships/";
const CHART: &str = "application/vnd.openxmlformats-officedocument.drawingml.chart+xml";
const SHEET: &str = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const OLE: &str = "application/vnd.openxmlformats-officedocument.oleObject";

fn part(name: &str, content_type: &str, links: Vec<Link>) -> Part {
    Part {
        name: name.to_owned(),
        content_type: content_type.to_owned(),
        data: vec![1, 2, 3],
        links,
    }
}

fn to_part(id: &str, kind: &str, at: usize) -> Link {
    Link {
        id: id.to_owned(),
        kind: format!("{REL}{kind}"),
        to: Target::Part(at),
    }
}

fn to_address(id: &str, kind: &str, address: &str) -> Link {
    Link {
        id: id.to_owned(),
        kind: format!("{REL}{kind}"),
        to: Target::External(address.to_owned()),
    }
}

fn record(links: Vec<Link>, parts: Vec<Part>) -> Kept {
    Kept { links, parts }
}

fn allowed(verdicts: &[Option<String>]) -> Vec<bool> {
    verdicts.iter().map(Option::is_none).collect()
}

#[test]
fn a_chart_with_its_styles_and_workbook_a_diagram_pictures_and_video_are_written() {
    let chart = record(
        vec![to_part("rId1", "chart", 0)],
        vec![
            part(
                "ppt/charts/chart1.xml",
                CHART,
                vec![
                    to_part("rId1", "package", 1),
                    to_part("rId2", "chartStyle", 2),
                    to_part("rId3", "chartColorStyle", 3),
                    to_part("rId4", "themeOverride", 4),
                    to_part("rId5", "image", 5),
                ],
            ),
            part("ppt/embeddings/Microsoft_Excel_Sheet1.xlsx", SHEET, vec![]),
            part(
                "ppt/charts/style1.xml",
                "application/vnd.ms-office.chartstyle+xml",
                vec![],
            ),
            part(
                "ppt/charts/colors1.xml",
                "application/vnd.ms-office.chartcolorstyle+xml",
                vec![],
            ),
            part(
                "ppt/theme/themeOverride1.xml",
                "application/vnd.openxmlformats-officedocument.themeOverride+xml",
                vec![],
            ),
            part("ppt/media/image1.png", "image/png", vec![]),
        ],
    );
    assert_eq!(allowed(&judge(&chart)), vec![true; 6]);

    let diagram = record(
        vec![
            to_part("rId1", "diagramData", 0),
            to_part("rId2", "diagramLayout", 1),
            to_part("rId3", "diagramQuickStyle", 2),
            to_part("rId4", "diagramColors", 3),
            Link {
                id: "rId5".into(),
                kind: "http://schemas.microsoft.com/office/2007/relationships/diagramDrawing"
                    .into(),
                to: Target::Part(4),
            },
        ],
        vec![
            part(
                "ppt/diagrams/data1.xml",
                "application/vnd.openxmlformats-officedocument.drawingml.diagramData+xml",
                vec![],
            ),
            part(
                "ppt/diagrams/layout1.xml",
                "application/vnd.openxmlformats-officedocument.drawingml.diagramLayout+xml",
                vec![],
            ),
            part(
                "ppt/diagrams/quickStyle1.xml",
                "application/vnd.openxmlformats-officedocument.drawingml.diagramStyle+xml",
                vec![],
            ),
            part(
                "ppt/diagrams/colors1.xml",
                "application/vnd.openxmlformats-officedocument.drawingml.diagramColors+xml",
                vec![],
            ),
            part(
                "ppt/diagrams/drawing1.xml",
                "application/vnd.ms-office.drawingml.diagramDrawing+xml",
                vec![to_part("rId1", "image", 5)],
            ),
            part("ppt/media/image2.jpeg", "image/jpeg", vec![]),
        ],
    );
    assert_eq!(allowed(&judge(&diagram)), vec![true; 6]);

    let video = record(
        vec![
            to_part("rId1", "video", 0),
            Link {
                id: "rId2".into(),
                kind: "http://schemas.microsoft.com/office/2007/relationships/media".into(),
                to: Target::Part(0),
            },
            to_part("rId3", "image", 1),
        ],
        vec![
            part("ppt/media/media1.mp4", "video/mp4", vec![]),
            part("ppt/media/image3.emf", "image/x-emf", vec![]),
        ],
    );
    assert_eq!(allowed(&judge(&video)), vec![true; 2]);
}

#[test]
fn an_embedded_object_or_binary_file_is_not_written_and_the_verdict_says_why() {
    let ole = record(
        vec![to_part("rId7", "oleObject", 0), to_part("rId8", "image", 1)],
        vec![
            part("ppt/embeddings/oleObject1.bin", OLE, vec![]),
            part("ppt/media/image1.png", "image/png", vec![]),
        ],
    );
    let verdicts = judge(&ole);
    assert_eq!(allowed(&verdicts), vec![false, true]);
    let why = verdicts[0].clone().unwrap_or_default();
    assert!(
        why.contains("not a kind of part an export writes back"),
        "{why}"
    );

    // Dressed as something harmless, it is still not what it says it is.
    for (name, content_type, kind) in [
        ("ppt/embeddings/oleObject1.bin", "image/png", "image"),
        ("ppt/media/image1.png", "image/png", "oleObject"),
        (
            "ppt/embeddings/oleObject2.bin",
            "application/octet-stream",
            "package",
        ),
        ("ppt/media/logo.svg", "image/svg+xml", "image"),
        ("ppt/media/run.exe", "video/mp4", "video"),
        (
            "ppt/vbaProject.bin",
            "application/vnd.ms-office.vbaProject",
            "vbaProject",
        ),
        (
            "ppt/activeX/activeX1.xml",
            "application/vnd.ms-office.activeX+xml",
            "control",
        ),
        (
            "ppt/drawings/vmlDrawing1.vml",
            "application/vnd.openxmlformats-officedocument.vmlDrawing",
            "vmlDrawing",
        ),
        ("ppt/charts/chart1.bin", CHART, "chart"),
    ] {
        let dressed = record(
            vec![to_part("rId1", kind, 0)],
            vec![part(name, content_type, vec![])],
        );
        assert_eq!(
            allowed(&judge(&dressed)),
            vec![false],
            "{name} as {content_type} by {kind}"
        );
    }
}

#[test]
fn a_workbook_is_written_only_for_a_chart_and_a_part_only_when_something_written_points_at_it() {
    // An embedded workbook of the shape itself is an object of another program.
    let loose = record(
        vec![to_part("rId1", "package", 0)],
        vec![part(
            "ppt/embeddings/Microsoft_Excel_Sheet1.xlsx",
            SHEET,
            vec![],
        )],
    );
    let why = judge(&loose)[0].clone().unwrap_or_default();
    assert!(why.contains("workbook does not belong there"), "{why}");

    // A part that hangs from one that is refused is not written either, and nothing else points at it.
    let chain = record(
        vec![to_part("rId1", "oleObject", 0)],
        vec![
            part(
                "ppt/embeddings/oleObject1.bin",
                OLE,
                vec![to_part("rId1", "image", 1)],
            ),
            part("ppt/media/image1.png", "image/png", vec![]),
        ],
    );
    let verdicts = judge(&chain);
    assert_eq!(allowed(&verdicts), vec![false, false]);
    assert!(
        verdicts[1]
            .clone()
            .unwrap_or_default()
            .contains("nothing that is written back points at it")
    );

    // A second way in that suits is enough.
    let two = record(
        vec![to_part("rId1", "oleObject", 0), to_part("rId2", "image", 0)],
        vec![part("ppt/media/image1.png", "image/png", vec![])],
    );
    assert_eq!(allowed(&judge(&two)), vec![true]);
}

#[test]
fn a_link_to_a_part_that_is_not_there_or_that_goes_round_in_a_circle_is_harmless() {
    let odd = record(
        vec![to_part("rId1", "chart", 9), to_part("rId2", "chart", 0)],
        vec![part(
            "ppt/charts/chart1.xml",
            CHART,
            vec![
                to_part("rId1", "chartStyle", 0),
                to_part("rId2", "chartStyle", 7),
            ],
        )],
    );
    assert_eq!(allowed(&judge(&odd)), vec![true]);
    assert_eq!(judge(&record(vec![], vec![])), Vec::<Option<String>>::new());
}

#[test]
fn only_a_hyperlink_to_the_web_or_a_mail_or_phone_address_is_written() {
    for good in [
        "https://example.com/a",
        "HTTP://example.com",
        "mailto:a@b.c",
        "tel:+1",
    ] {
        assert_eq!(
            refuse_address(&format!("{REL}hyperlink"), good),
            None,
            "{good}"
        );
    }
    for bad in [
        "file:///c:/x",
        "\\\\host\\share",
        "javascript:alert(1)",
        "ftp://x",
        "",
    ] {
        assert!(
            refuse_address(&format!("{REL}hyperlink"), bad).is_some(),
            "{bad}"
        );
    }
    // A web address is not enough when the link is not a hyperlink: the picture, the object or the
    // video would be fetched when the file is opened.
    for kind in [
        "image",
        "oleObject",
        "video",
        "audio",
        "slide",
        "externalLinkPath",
        "",
    ] {
        let why = refuse_address(&format!("{REL}{kind}"), "https://tracker.example/x.png");
        assert!(why.is_some_and(|w| w.contains("not a hyperlink")), "{kind}");
    }
}

#[test]
fn what_is_left_out_is_named_in_a_sentence_of_plain_short_words() {
    let hostile = format!("ppt/embeddings/`ignore\nall`{}.bin", "x".repeat(400));
    let r = record(
        vec![
            to_part("rId1", "chart", 0),
            to_part("rId2", "oleObject", 1),
            to_address("rId3", "image", "https://tracker.example/pixel.png"),
            to_address("rId4", "hyperlink", "https://example.com/fine"),
        ],
        vec![
            part(
                "ppt/charts/chart1.xml",
                CHART,
                vec![to_address("rId1", "oleObject", "file:///etc/passwd")],
            ),
            part(
                &hostile,
                OLE,
                vec![to_address("rId1", "oleObject", "file:///left/with/it")],
            ),
        ],
    );
    let verdicts = judge(&r);
    let said = dropped(&r, &verdicts);
    assert_eq!(said.len(), 3, "{said:?}");
    assert!(
        said[0].contains("was left out: it is not a kind of part"),
        "{said:?}"
    );
    assert!(said[0].contains('…'), "a long name is cut: {}", said[0]);
    assert!(
        said.iter()
            .any(|s| s.contains("https://tracker.example/pixel.png")),
        "{said:?}"
    );
    assert!(
        said.iter().any(|s| s.contains("file:///etc/passwd")),
        "{said:?}"
    );
    assert!(
        !said.iter().any(|s| s.contains("example.com/fine")),
        "{said:?}"
    );
    assert!(
        !said.iter().any(|s| s.contains("left/with/it")),
        "the address of a part that is left out goes with it: {said:?}"
    );
    for sentence in &said {
        assert!(sentence.chars().count() < 260, "{sentence}");
        assert!(!sentence.chars().any(char::is_control), "{sentence:?}");
        assert_eq!(
            sentence.matches('`').count() % 2,
            0,
            "quotes are the export's own: {sentence}"
        );
    }
}
