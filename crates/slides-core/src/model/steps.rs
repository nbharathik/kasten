//! Steps: what an element looks like at each click of a slide.

use std::collections::BTreeMap;

use schemars::JsonSchema;
use serde::de::Error as _;
use serde::{Deserialize, Deserializer, Serialize};
use ts_rs::TS;

use super::Base;

model! {
    /// How an element looks from a step onward, until the next change.
    #[serde(rename_all = "camelCase")]
    pub enum StepState {
        /// Not shown.
        Hidden,
        /// Shown faded, at the theme's dimmed opacity.
        Dimmed,
        /// As styled.
        Normal,
        /// As styled, with the theme's highlight around it.
        Highlighted,
    }

    /// How a change of state is drawn.
    #[serde(rename_all = "camelCase")]
    pub enum Effect {
        None,
        Fade,
        FadeUp,
        Grow,
    }
}

impl Base {
    /// How the element looks at `step`: the entry with the greatest step that
    /// is not after it, or `normal` when there is none. A slide shows step 0
    /// when it appears and each click moves one step on.
    pub fn state_at(&self, step: u32) -> StepState {
        self.step_states
            .range(..=step)
            .next_back()
            .map_or(StepState::Normal, |(_, state)| state.clone())
    }
}

/// Reads a map keyed by step numbers. JSON keys are text, and inside a
/// flattened struct (every element flattens its common fields) serde hands them
/// over as text even for an integer key type, so they are parsed here.
pub(super) fn step_keys<'de, D: Deserializer<'de>>(
    deserializer: D,
) -> Result<BTreeMap<u32, StepState>, D::Error> {
    BTreeMap::<String, StepState>::deserialize(deserializer)?
        .into_iter()
        .map(|(key, state)| {
            key.parse::<u32>()
                .map(|step| (step, state))
                .map_err(|_| D::Error::custom(format!("a step is a whole number, not {key:?}")))
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::model::Element;

    #[test]
    fn step_states_read_inside_an_element_and_write_back_the_same() {
        let text = r#"{"type":"text","id":"e-1","x":0,"y":0,"w":10,"h":10,"stepStates":{"1":"hidden","12":"dimmed"},"text":{"paragraphs":[]}}"#;
        let element: Element = serde_json::from_str(text).unwrap();
        let states = &element.base().step_states;
        assert_eq!(states.get(&1), Some(&StepState::Hidden));
        assert_eq!(states.get(&12), Some(&StepState::Dimmed));
        let again: Element =
            serde_json::from_str(&serde_json::to_string(&element).unwrap()).unwrap();
        assert_eq!(again, element);
    }

    #[test]
    fn a_state_holds_from_its_step_until_the_next_entry_and_normal_is_the_default() {
        let mut base = Base::new("e-1");
        assert_eq!(base.state_at(0), StepState::Normal);
        base.step_states.insert(1, StepState::Hidden);
        base.step_states.insert(3, StepState::Highlighted);
        let seen: Vec<StepState> = (0..6).map(|step| base.state_at(step)).collect();
        assert_eq!(
            seen,
            [
                StepState::Normal,
                StepState::Hidden,
                StepState::Hidden,
                StepState::Highlighted,
                StepState::Highlighted,
                StepState::Highlighted
            ]
        );
    }

    #[test]
    fn a_step_that_is_not_a_number_is_refused_with_a_reason() {
        let text = r#"{"type":"text","id":"e-1","x":0,"y":0,"w":10,"h":10,"stepStates":{"one":"hidden"},"text":{"paragraphs":[]}}"#;
        let error = serde_json::from_str::<Element>(text)
            .unwrap_err()
            .to_string();
        assert!(error.contains("a step is a whole number"), "{error}");
    }
}
