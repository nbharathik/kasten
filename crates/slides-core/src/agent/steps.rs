//! `set_steps`: the clicks of a slide, by recipe or state by state.

use serde_json::{Map, Value, json};

use super::edit::apply_all;
use super::read::slide_id;
use super::session::Agent;
use super::store::Store;
use super::{ToolError, ToolResult};
use crate::model::Element;

const RECIPES: [&str; 4] = ["reveal", "walkthrough", "spotlight", "clear"];

pub fn set_steps(agent: &mut Agent, store: &mut dyn Store, args: &Value) -> ToolResult {
    let name = agent.deck_name(store, args)?;
    let recipe = args.get("recipe").and_then(Value::as_str);
    let states = args.get("states").and_then(Value::as_object);
    let steps = args.get("steps").filter(|s| !s.is_null());
    if recipe.is_none() && states.is_none() && steps.is_none() {
        return Err(ToolError::new(
            "Say what to do with `recipe` (reveal, walkthrough, spotlight or clear), with `states` (for each element id, its state at each step: {\"e-1\": {\"0\": \"hidden\", \"1\": \"normal\"}}), or with `steps` (how many clicks the slide has).",
        ));
    }
    if let Some(r) = recipe.filter(|r| !RECIPES.contains(r)) {
        return Err(ToolError::new(format!(
            "`recipe` is one of {}, not `{r}`.",
            RECIPES.join(", ")
        )));
    }
    let edited = agent.edit(store, &name, None, |engine| {
        let slide = slide_id(engine.deck(), args.get("slide").unwrap_or(&Value::Null))?;
        let mut operations = Vec::new();
        if let Some(recipe) = recipe {
            let ids: Vec<String> = match args.get("ids").and_then(Value::as_array) {
                Some(list) => list.iter().filter_map(|v| v.as_str().map(str::to_owned)).collect(),
                None => {
                    let s = engine.deck().slide(&slide).ok_or_else(|| ToolError::new("That slide is not in the deck."))?;
                    s.elements
                        .iter()
                        .filter(|e| !matches!(e, Element::Line(_) | Element::Connector(_)) && !matches!(e.base().placeholder.as_deref(), Some("title" | "subtitle")))
                        .map(|e| e.id().to_owned())
                        .collect()
                }
            };
            operations.push(("build_steps".to_owned(), json!({ "slide": slide, "ids": ids, "recipe": recipe })));
        }
        if let Some(states) = states {
            for (id, per_step) in states {
                let map: Map<String, Value> = per_step.as_object().cloned().ok_or_else(|| ToolError::new(format!("The states of `{id}` are an object of step number to state: {{\"1\": \"hidden\"}}.")))?;
                operations.push(("set_step_states".to_owned(), json!({ "slide": slide, "id": id, "states": map })));
            }
        }
        if let Some(steps) = steps {
            operations.push(("set_slide_steps".to_owned(), json!({ "slide": slide, "steps": steps })));
        }
        apply_all(engine, operations)?;
        let now = engine.deck().slide(&slide).map_or(0, |s| s.steps);
        Ok(json!({ "slide": slide, "steps": now }))
    })?;
    agent.answer(store, &edited, json!({}))
}
