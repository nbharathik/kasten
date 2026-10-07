use crate::citations::names::{Person, parse_list};

fn person(first: &str, von: &str, last: &str, jr: &str) -> Person {
    Person {
        first: first.to_owned(),
        von: von.to_owned(),
        last: last.to_owned(),
        jr: jr.to_owned(),
    }
}

#[test]
fn authors_are_split_at_and_and_read_in_either_order() {
    let a = parse_list("Vaswani, Ashish and Shazeer, Noam AND Parmar, Niki");
    assert_eq!(
        a.people,
        [
            person("Ashish", "", "Vaswani", ""),
            person("Noam", "", "Shazeer", ""),
            person("Niki", "", "Parmar", ""),
        ]
    );
    let b = parse_list("Ashish Vaswani and Noam Shazeer");
    assert_eq!(
        b.people,
        [
            person("Ashish", "", "Vaswani", ""),
            person("Noam", "", "Shazeer", "")
        ]
    );
    assert!(!a.et_al && !b.et_al);
}

#[test]
fn a_name_with_a_particle_keeps_it_with_the_last_name() {
    let names = parse_list(
        "Ludwig van Beethoven and de la Fontaine, Jean and Charles Louis de la Vall{\\'e}e Poussin",
    );
    assert_eq!(names.people[0], person("Ludwig", "van", "Beethoven", ""));
    assert_eq!(names.people[1], person("Jean", "de la", "Fontaine", ""));
    assert_eq!(
        names.people[2],
        person("Charles Louis", "de la", "Vallée Poussin", "")
    );
    assert_eq!(names.people[0].last_name(), "van Beethoven");
    assert_eq!(names.people[2].last_name(), "de la Vallée Poussin");
}

#[test]
fn a_suffix_and_a_lone_name_are_understood() {
    let a = parse_list("Smith, Jr., John and Plato");
    assert_eq!(a.people[0], person("John", "", "Smith", "Jr."));
    assert_eq!(a.people[1], person("", "", "Plato", ""));
    assert_eq!(a.people[1].last_name(), "Plato");
}

#[test]
fn a_braced_name_is_one_word_and_and_inside_braces_does_not_split() {
    let a = parse_list("{Google Brain} and {Barnes and Noble}");
    assert_eq!(a.people.len(), 2);
    assert_eq!(a.people[0].last_name(), "Google Brain");
    assert_eq!(a.people[1].last_name(), "Barnes and Noble");
    assert_eq!(a.people[0].first, "");
}

#[test]
fn others_means_et_al() {
    let a = parse_list("Brown, Tom B. and Mann, Benjamin and others");
    assert_eq!(a.people.len(), 2);
    assert!(a.et_al);
    assert_eq!(a.short(), "Brown et al.");
}

#[test]
fn accents_in_names_are_shown_as_the_letters_they_stand_for() {
    let a = parse_list("Kaiser, {\\L}ukasz and M{\\\"u}ller, Hans-Peter");
    assert_eq!(a.people[0].full_name(), "Łukasz Kaiser");
    assert_eq!(a.people[1].full_name(), "Hans-Peter Müller");
}

#[test]
fn initials_follow_the_given_names() {
    let cases = [
        ("Ashish Vaswani", "A. Vaswani"),
        ("Gomez, Aidan N.", "A. N. Gomez"),
        ("Tom B. Brown", "T. B. Brown"),
        ("Chang, Ming-Wei", "M.-W. Chang"),
        ("J. R. R. Tolkien", "J. R. R. Tolkien"),
        ("Tolkien, J.R.R.", "J. R. R. Tolkien"),
        ("{Google Brain}", "Google Brain"),
        ("Plato", "Plato"),
        ("{\\'E}mile Zola", "É. Zola"),
    ];
    for (raw, shown) in cases {
        assert_eq!(parse_list(raw).people[0].initialed(), shown, "{raw}");
    }
}

#[test]
fn a_list_is_short_by_last_names() {
    let of = |raw: &str| parse_list(raw).short();
    assert_eq!(of("Vaswani, A."), "Vaswani");
    assert_eq!(of("Devlin, Jacob and Chang, Ming-Wei"), "Devlin and Chang");
    assert_eq!(of("A B and C D and E F"), "B et al.");
    assert_eq!(of(""), "");
    assert_eq!(of("   "), "");
}

#[test]
fn a_list_is_full_by_initials_and_at_most_three_names() {
    let of = |raw: &str| parse_list(raw).full();
    assert_eq!(of("Vaswani, Ashish"), "A. Vaswani");
    assert_eq!(
        of("Devlin, Jacob and Chang, Ming-Wei"),
        "J. Devlin and M.-W. Chang"
    );
    assert_eq!(
        of("Goodfellow, Ian and Bengio, Yoshua and Courville, Aaron"),
        "I. Goodfellow, Y. Bengio, and A. Courville"
    );
    assert_eq!(
        of("Vaswani, Ashish and Shazeer, Noam and Parmar, Niki and Uszkoreit, Jakob"),
        "A. Vaswani et al."
    );
    assert_eq!(of("Brown, Tom and others"), "T. Brown et al.");
}

#[test]
fn the_names_a_paper_lists_never_panic() {
    let long = "x and ".repeat(5000);
    for hostile in [
        ",,,",
        ", , ,",
        "and",
        "and and and",
        "{",
        "}",
        "{{{a",
        "a, b, c, d, e, f",
        "\\",
        "é and é, é",
        "  and  ",
        long.as_str(),
    ] {
        let a = parse_list(hostile);
        let _ = (a.short(), a.full());
    }
}
