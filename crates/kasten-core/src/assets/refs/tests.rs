use super::*;

fn paths(from: &str, text: &str) -> Vec<String> {
    image_refs(from, text)
        .into_iter()
        .map(|r| match r {
            Ref::Path(p) => p,
            Ref::Name(n) => format!("name:{n}"),
        })
        .collect()
}

#[test]
fn links_are_read_as_the_page_editor_reads_them() {
    let from = "projects/p/notes/a.md";
    let resolve = |src: &str| resolve_link(from, src);
    assert_eq!(
        resolve("../../../../assets/x.png"),
        None,
        "leaves the vault"
    );
    assert_eq!(
        resolve("../../../assets/x.png").as_deref(),
        Some("assets/x.png")
    );
    assert_eq!(
        resolve("./b/x.png").as_deref(),
        Some("projects/p/notes/b/x.png")
    );
    assert_eq!(resolve("/assets/x.png").as_deref(), Some("assets/x.png"));
    assert_eq!(
        resolve("  ../../../assets/x.png?raw=1#top ").as_deref(),
        Some("assets/x.png")
    );
    assert_eq!(
        resolve("../../../assets/My%20Image.png").as_deref(),
        Some("assets/My Image.png")
    );
    assert_eq!(
        resolve("../../../assets/caf%C3%A9.png").as_deref(),
        Some("assets/café.png")
    );
    assert_eq!(
        resolve("../../../assets/a%2Fb.png").as_deref(),
        Some("assets/a%2Fb.png"),
        "a reserved escape stays"
    );
    assert_eq!(
        resolve("../../../assets/bad%FF.png").as_deref(),
        Some("assets/bad%FF.png"),
        "not UTF-8: as written"
    );
    for web in [
        "https://example.com/x.png",
        "data:image/png;base64,AAAA",
        "mailto:a@b.c",
        "//cdn/x.png",
        "#anchor",
        "",
        "   ",
        "C:\\x.png",
    ] {
        assert_eq!(resolve(web), None, "{web}");
    }
    assert_eq!(resolve_link("a.md", "../x.png"), None);
    assert_eq!(
        resolve_link("a.md", "assets/x.png").as_deref(),
        Some("assets/x.png")
    );
}

#[test]
fn markdown_html_and_wiki_pictures_are_found() {
    let text = "\
Intro ![a](../assets/one.png) and ![b](../assets/two.png \"A title\") text.
![alt with [brackets] inside](<../assets/three four.png>)
<img src=\"../assets/five.png\" width=40> <IMG alt=x SRC='../assets/six.png'>
Embed ![[seven.png]] and ![[assets/eight.png|300]] and ![[Some Note]]
![nested (parens)](../assets/nine_(1).png) and ![again](../assets/one.png)
";
    assert_eq!(
        paths("inbox/a.md", text),
        [
            "assets/one.png",
            "assets/two.png",
            "assets/three four.png",
            "assets/five.png",
            "assets/six.png",
            "name:seven.png",
            "assets/eight.png",
            "assets/nine_(1).png",
        ]
    );
}

#[test]
fn code_the_web_and_plain_links_are_not_pictures() {
    let text = "\
```md
![in a fence](../assets/no.png)
```
~~~
![in a tilde fence](../assets/no.png)
~~~
`![in a span](../assets/no.png)` and ![real](../assets/yes.png)
![web](https://example.com/assets/no.png)
[a link](../assets/no.png)
![reference style][ref]
[ref]: ../assets/no.png
![broken](../assets/no.png
![](../assets/empty-alt.png)
";
    assert_eq!(
        paths("inbox/a.md", text),
        ["assets/yes.png", "assets/empty-alt.png"]
    );
}

#[test]
fn an_img_tag_with_other_attributes_first_is_read() {
    let text = "<img srcset=\"x 2x\" data-src=\"../assets/no.png\" src=\"../assets/yes.png\">\r\n<img src=../assets/bare.png>\r\n";
    assert_eq!(
        paths("inbox/a.md", text),
        ["assets/yes.png", "assets/bare.png"]
    );
}
