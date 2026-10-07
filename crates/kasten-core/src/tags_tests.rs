use serde_json::json;

use super::*;

const PAPER: &str = "name: paper\ncolor: blue\nproperties:\n  - {key: status, type: select, options: [Idea, Drafting, Submitted]}\n  - {key: deadline, type: date}\n  - {key: coauthors, type: multi_select}\n  - {key: pages, type: number}\n  - {key: repo, type: url}\n  - {key: related, type: relation}\n  - {key: done, type: checkbox}\nviews:\n  - {name: Pipeline, type: kanban, group_by: status}\n";

fn paper() -> Vec<TagSchema> {
    vec![parse_schema("tags/paper.yaml", PAPER).unwrap()]
}

fn check_one(key: &str, value: Value) -> Result<Value> {
    let changes = json!({ key: value }).as_object().unwrap().clone();
    check_props(&paper(), &["Paper".to_owned()], &changes).map(|m| m[key].clone())
}

#[test]
fn reads_schemas_leniently() {
    let schema = &paper()[0];
    assert_eq!(schema.name, "paper");
    assert_eq!(schema.color.as_deref(), Some("blue"));
    assert_eq!(
        schema.properties[0].options,
        ["Idea", "Drafting", "Submitted"]
    );
    assert_eq!(schema.views[0]["group_by"], json!("status"));
    let odd = parse_schema(
        "tags/odd.yaml",
        "properties:\n  - {type: text}\n  - {key: x}\n",
    )
    .unwrap();
    assert_eq!(odd.name, "odd");
    assert_eq!(odd.properties.len(), 1);
    assert_eq!(odd.properties[0].kind, "text");
    assert!(parse_schema("tags/bad.yaml", "a: [").is_err());
}

#[test]
fn checks_values_by_type() {
    assert_eq!(
        check_one("status", json!("drafting")).unwrap(),
        json!("Drafting")
    );
    assert!(check_one("status", json!("Published")).is_err());
    assert_eq!(
        check_one("deadline", json!("2026-10-15")).unwrap(),
        json!("2026-10-15")
    );
    assert!(check_one("deadline", json!("next week")).is_err());
    assert_eq!(
        check_one("coauthors", json!("Alex")).unwrap(),
        json!(["Alex"])
    );
    assert_eq!(check_one("pages", json!("12")).unwrap(), json!(12));
    assert!(check_one("pages", json!("many")).is_err());
    assert!(check_one("repo", json!("github.com/x")).is_err());
    assert_eq!(
        check_one("related", json!(["01A", "01B"])).unwrap(),
        json!(["01A", "01B"])
    );
    assert_eq!(check_one("done", json!("true")).unwrap(), json!(true));
    assert_eq!(check_one("status", Value::Null).unwrap(), Value::Null);
    // Keys no schema names hold plain values.
    assert_eq!(check_one("mood", json!("good")).unwrap(), json!("good"));
    assert!(check_one("mood", json!({"a": 1})).is_err());
    // A note without the tag is not held to its schema.
    let changes = json!({"status": "Published"}).as_object().unwrap().clone();
    assert!(check_props(&paper(), &[], &changes).is_ok());
}

#[test]
fn writes_schemas_in_the_house_style() {
    let yaml = schema_yaml(
        "trip",
        &json!({"color": "green", "properties": [{"key": "stage", "type": "select", "options": ["Idea", "Booked"]}], "views": [{"name": "Board", "type": "kanban", "group_by": "stage"}]}),
    )
    .unwrap();
    assert_eq!(
        yaml,
        "name: trip\ncolor: green\nproperties:\n  - {key: stage, type: select, options: [Idea, Booked]}\nviews:\n  - {name: Board, type: kanban, group_by: stage}\n"
    );
    let back = parse_schema("tags/trip.yaml", &yaml).unwrap();
    assert_eq!(back.properties[0].options, ["Idea", "Booked"]);
    assert!(
        schema_yaml(
            "x",
            &json!({"properties": [{"key": "a", "type": "colour"}]})
        )
        .is_err()
    );
    assert!(schema_yaml("x", &json!([1])).is_err());
}
