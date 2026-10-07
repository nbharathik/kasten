use super::*;

fn wiki(embed: bool, target: &str, heading: Option<&str>, alias: Option<&str>) -> Link {
    Link::Wiki {
        embed,
        target: target.into(),
        heading: heading.map(Into::into),
        alias: alias.map(Into::into),
        escaped_pipe: false,
    }
}

fn md(image: bool, text: &str, destination: &str, title: Option<&str>) -> Link {
    Link::Markdown {
        image,
        text: text.into(),
        destination: destination.into(),
        title: title.map(Into::into),
    }
}

fn links(body: &str) -> Vec<Link> {
    let mut seen = Vec::new();
    let out = rewrite_links(body, |link| {
        seen.push(link.clone());
        None
    });
    assert_eq!(out, body, "nothing asked, nothing changed");
    seen
}

#[test]
fn finds_links_outside_code() {
    let body = "See [[A]], ![[B#Part|shown]] and [c](d%20e.md \"T\").\n\
`[[no]]` and \\[[no]] and ``[x](y)``\n\
```\n[[no]]\n```\n\
~~~js\n[x](y)\n~~~\n\
$$\n[[no]]\n$$\n\
  ````\n  ```\n[[no]]\n  ````\n\
![alt](<p q.png>) [[Last]]";
    assert_eq!(
        links(body),
        [
            wiki(false, "A", None, None),
            wiki(true, "B", Some("Part"), Some("shown")),
            md(false, "c", "d%20e.md", Some("\"T\"")),
            md(true, "alt", "p q.png", None),
            wiki(false, "Last", None, None),
        ]
    );
}

#[test]
fn rewrites_only_what_it_is_asked_to() {
    let out = rewrite_links("a [[A]] b [[B|x]] c ![i](p.png)\n", |link| match link {
        Link::Wiki { target, .. } if target == "A" => Some("[[Alpha]]".into()),
        Link::Markdown { image: true, .. } => Some("![i](q.png)".into()),
        _ => None,
    });
    assert_eq!(out, "a [[Alpha]] b [[B|x]] c ![i](q.png)\n");
}

#[test]
fn reads_table_pipes_brackets_and_parentheses() {
    assert_eq!(
        links("| [[A\\|b]] |\n"),
        [Link::Wiki {
            embed: false,
            target: "A".into(),
            heading: None,
            alias: Some("b".into()),
            escaped_pipe: true,
        }]
    );
    assert_eq!(
        links("[a [b] c](x_(1).md)\n"),
        [md(false, "a [b] c", "x_(1).md", None)]
    );
    // An image inside a link: both are found when the outer one stays.
    assert_eq!(
        links("[![i](p.png)](q.md)\n"),
        [
            md(false, "![i](p.png)", "q.md", None),
            md(true, "i", "p.png", None)
        ]
    );
    // Not links: no destination, or unclosed.
    assert!(links("[a] (b) [c](d [[e\n").is_empty());
}

#[test]
fn writes_wiki_links() {
    assert_eq!(
        wiki_link(false, "Summer trip", None, None, false),
        "[[Summer trip]]"
    );
    assert_eq!(
        wiki_link(true, "Index (Travel)", Some("Top"), Some("Index"), false),
        "![[Index (Travel)#Top|Index]]"
    );
    assert_eq!(wiki_link(false, "A", None, Some("b"), true), "[[A\\|b]]");
}

#[test]
fn finds_obsidian_tags() {
    let body = "#inbox and #reading/queue, not #123 or a#b or `#code`\n\
# Heading\n## Two\n```\n#no\n```\n\
[l](#anchor) https://x.y/#z #Inbox #end/ #日本 #2026 #x-2\n";
    assert_eq!(
        inline_tags(body),
        ["inbox", "reading/queue", "end", "日本", "x-2"]
    );
}

#[test]
fn encodes_and_decodes_link_paths() {
    assert_eq!(
        link_path("sources/My paper (v2) #3.pdf"),
        "sources/My%20paper%20%28v2%29%20%233.pdf"
    );
    assert_eq!(link_path("assets/日本/map.png"), "assets/日本/map.png");
    assert_eq!(
        relative("projects/p/pages/a.md", "assets/p/m.png"),
        "../../../assets/p/m.png"
    );
    assert_eq!(relative("top.md", "assets/m.png"), "assets/m.png");
    assert_eq!(
        percent_decode("My%20paper%20%28v2%29.md"),
        "My paper (v2).md"
    );
    assert_eq!(percent_decode("100% sure%2"), "100% sure%2");
    assert_eq!(percent_decode("%E6%97%A5.md"), "日.md");
}

#[test]
fn strips_a_first_heading_that_repeats_the_title() {
    assert_eq!(without_title("# Welcome\n\nHi\n", "welcome"), "Hi\n");
    assert_eq!(without_title("\n# Welcome #\nHi\n", "Welcome"), "Hi\n");
    assert_eq!(
        without_title("# Other\n\nHi\n", "Welcome"),
        "# Other\n\nHi\n"
    );
    assert_eq!(
        without_title("Hi\n# Welcome\n", "Welcome"),
        "Hi\n# Welcome\n"
    );
    assert_eq!(without_title("# Welcome", "Welcome"), "");
}
