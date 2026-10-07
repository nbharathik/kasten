//! Where a paragraph's and a run's properties come from when they do not say:
//! the layers below them, most specific first (the shape's own list style, the
//! layout's placeholder, the master's placeholder, the master's text styles,
//! the presentation's defaults).

use super::levels::{Level, Levels};

#[derive(Clone, Debug, Default)]
pub struct Chain {
    layers: Vec<Levels>,
}

impl Chain {
    pub fn new() -> Chain {
        Chain::default()
    }

    /// Adds a layer below the ones there are.
    pub fn below(mut self, layer: Levels) -> Chain {
        self.layers.push(layer);
        self
    }

    /// The properties at a list level, found through the layers.
    pub fn level(&self, at: usize) -> Level {
        let mut found = Level::default();
        for layer in &self.layers {
            found = found.over(&layer.level(at));
        }
        found
    }

    /// How many layers there are.
    #[cfg(test)]
    pub fn len(&self) -> usize {
        self.layers.len()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::import::text::levels::RunProps;

    fn sized(size: f64, bold: Option<bool>) -> Levels {
        let mut l = Levels::empty();
        l.0[0].run = RunProps {
            size: Some(size),
            bold,
            ..RunProps::default()
        };
        l
    }

    #[test]
    fn the_first_layer_that_says_wins_and_the_rest_fill_in() {
        let chain = Chain::new()
            .below(sized(30.0, None))
            .below(sized(20.0, Some(true)))
            .below(sized(10.0, Some(false)));
        let level = chain.level(0);
        assert_eq!((level.run.size, level.run.bold), (Some(30.0), Some(true)));
        assert_eq!(chain.level(1), Level::default());
        assert_eq!(chain.len(), 3);
    }
}
