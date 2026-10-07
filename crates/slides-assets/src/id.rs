//! Ids for pictures: 26 characters in ULID's shape, the time first so they sort
//! by when they were made, then randomness the host gives (this crate has none).

const ALPHABET: &[u8; 32] = b"0123456789ABCDEFGHJKMNPQRSTVWXYZ";

/// An id for `millis` since the Unix epoch and 80 bits of `random` (the rest is ignored).
pub fn ulid(millis: u64, random: u128) -> String {
    let mut value =
        (u128::from(millis & ((1u64 << 48) - 1)) << 80) | (random & ((1u128 << 80) - 1));
    let mut out = [0u8; 26];
    for slot in out.iter_mut().rev() {
        *slot = ALPHABET[(value & 31) as usize];
        value >>= 5;
    }
    out.iter().map(|&b| char::from(b)).collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn twenty_six_crockford_characters_that_sort_by_time() {
        let a = ulid(1_790_236_800_000, 7);
        let b = ulid(1_790_236_800_001, 0);
        assert_eq!(a.len(), 26);
        assert!(a.bytes().all(|c| ALPHABET.contains(&c)));
        assert!(a < b);
        assert_eq!(ulid(0, 0), "0".repeat(26));
        assert_eq!(ulid(0, 1), format!("{}1", "0".repeat(25)));
        // Bits past the 48 of the time and the 80 of randomness are dropped.
        assert_eq!(ulid(u64::MAX, u128::MAX).len(), 26);
    }
}
