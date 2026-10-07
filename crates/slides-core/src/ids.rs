//! Ids: a kind prefix and eight random base36 characters. The generator is a
//! small deterministic one seeded by the host, so the core needs no source of
//! randomness of its own and tests can replay a run.

/// The characters of an id after its prefix.
const LENGTH: u32 = 8;

#[derive(Clone, Debug)]
pub struct IdGen {
    state: u64,
}

impl IdGen {
    pub fn new(seed: u64) -> IdGen {
        IdGen { state: seed }
    }

    fn next(&mut self) -> u64 {
        // splitmix64
        self.state = self.state.wrapping_add(0x9E37_79B9_7F4A_7C15);
        let mut z = self.state;
        z = (z ^ (z >> 30)).wrapping_mul(0xBF58_476D_1CE4_E5B9);
        z = (z ^ (z >> 27)).wrapping_mul(0x94D0_49BB_1331_11EB);
        z ^ (z >> 31)
    }

    /// A new id that `taken` does not claim.
    pub fn fresh(&mut self, prefix: &str, taken: impl Fn(&str) -> bool) -> String {
        loop {
            let mut n = self.next() % 36u64.pow(LENGTH);
            let mut chars = Vec::with_capacity(LENGTH as usize);
            for _ in 0..LENGTH {
                chars.push(char::from_digit((n % 36) as u32, 36).unwrap_or('0'));
                n /= 36;
            }
            let id = format!("{prefix}{}", chars.into_iter().rev().collect::<String>());
            if !taken(&id) {
                return id;
            }
        }
    }
}

pub const DECK: &str = "d-";
pub const SLIDE: &str = "s-";
pub const ELEMENT: &str = "e-";

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn ids_have_a_prefix_and_eight_base36_characters() {
        let mut ids = IdGen::new(7);
        let id = ids.fresh(SLIDE, |_| false);
        assert!(id.starts_with("s-"));
        assert_eq!(id.len(), 10);
        assert!(
            id[2..]
                .chars()
                .all(|c| c.is_ascii_digit() || c.is_ascii_lowercase())
        );
    }

    #[test]
    fn the_same_seed_gives_the_same_ids() {
        let a: Vec<_> = (0..5)
            .map(|_| IdGen::new(42).fresh(ELEMENT, |_| false))
            .collect();
        assert!(a.windows(2).all(|w| w[0] == w[1]));
        let mut one = IdGen::new(1);
        let mut two = IdGen::new(2);
        assert_ne!(one.fresh(ELEMENT, |_| false), two.fresh(ELEMENT, |_| false));
    }

    #[test]
    fn a_taken_id_is_skipped() {
        let first = IdGen::new(9).fresh(ELEMENT, |_| false);
        let mut ids = IdGen::new(9);
        let second = ids.fresh(ELEMENT, |candidate| candidate == first);
        assert_ne!(first, second);
    }
}
