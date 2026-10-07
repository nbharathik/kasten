//! Note ids: ULIDs (48-bit millisecond time, 80 random bits, Crockford base32),
//! created once per note and never changed. Randomness
//! comes from the standard library's per-process random hash keys, so no
//! extra dependency is needed; within one millisecond ids keep increasing.

use std::collections::hash_map::RandomState;
use std::hash::{BuildHasher, Hasher};
use std::sync::Mutex;

const ALPHABET: &[u8; 32] = b"0123456789ABCDEFGHJKMNPQRSTVWXYZ";

static LAST: Mutex<(u64, u128)> = Mutex::new((0, 0));

fn random_80() -> u128 {
    let state = RandomState::new();
    let mut a = state.build_hasher();
    a.write_u64(0x6b61_7374_656e);
    let mut b = state.build_hasher();
    b.write_u64(a.finish());
    ((u128::from(a.finish()) << 64) | u128::from(b.finish())) & ((1u128 << 80) - 1)
}

/// A new ULID for `millis` since the Unix epoch; later calls in the same
/// millisecond return larger ids.
pub fn ulid_at(millis: u64) -> String {
    let mut last = LAST.lock().unwrap_or_else(|poisoned| poisoned.into_inner());
    next_ulid(&mut last, millis, random_80)
}

/// The id after `last` for `millis`: never smaller than the previous one,
/// even when the clock goes back.
fn next_ulid(last: &mut (u64, u128), millis: u64, random: impl FnOnce() -> u128) -> String {
    let random = if millis <= last.0 && last.1 < (1u128 << 80) - 1 {
        last.1 + 1
    } else {
        random()
    };
    let millis = millis.max(last.0);
    *last = (millis, random);
    encode((u128::from(millis & ((1u64 << 48) - 1)) << 80) | random)
}

fn encode(mut value: u128) -> String {
    let mut out = [0u8; 26];
    for slot in out.iter_mut().rev() {
        *slot = ALPHABET[(value & 31) as usize];
        value >>= 5;
    }
    out.iter().map(|&b| b as char).collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn ulids_are_26_crockford_characters_that_sort_by_time() {
        // A private state: other tests share the global one.
        let mut state = (0, 0);
        let a = next_ulid(&mut state, 1_758_600_000_000, random_80);
        let b = next_ulid(&mut state, 1_758_600_000_001, random_80);
        assert_eq!(a.len(), 26);
        assert!(a.bytes().all(|c| ALPHABET.contains(&c)), "{a}");
        assert!(a < b, "{a} < {b}");
        assert!(a.starts_with("01K"), "{a}");
    }

    #[test]
    fn ulids_in_one_millisecond_are_unique_and_increasing() {
        let ids: Vec<String> = (0..1000).map(|_| ulid_at(1_758_600_000_500)).collect();
        assert!(ids.windows(2).all(|w| w[0] < w[1]));
        let mut state = (2_000, 5);
        assert!(
            next_ulid(&mut state, 1_000, random_80) > encode((2_000u128 << 80) | 5),
            "clock went back"
        );
    }
}
