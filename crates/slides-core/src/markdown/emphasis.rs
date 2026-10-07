//! Pairing emphasis markers, the way CommonMark does it: every closer looks
//! back for the nearest opener that fits, takes one or two characters from
//! each, and whatever is left over stays text.

/// What a delimiter is.
#[derive(Clone, Copy, Debug, PartialEq)]
pub(super) enum Kind {
    /// A run of `*`.
    Star,
    /// A run of `_`.
    Under,
    /// Exactly two `~`.
    Tilde,
    /// `<u>`, `<b>`, `<i>` or `<s>`, opening (true) or closing (false).
    Tag(char, bool),
}

/// The looks a pair gives what is inside it.
pub(super) const BOLD: u8 = 1;
pub(super) const ITALIC: u8 = 2;
pub(super) const STRIKE: u8 = 4;
pub(super) const UNDER: u8 = 8;

#[derive(Clone, Copy, Debug)]
pub(super) struct Delim {
    pub kind: Kind,
    /// Characters in the run as written.
    pub n: usize,
    /// Characters no pair has used yet; they end up as text.
    pub left: usize,
    pub open: bool,
    pub close: bool,
    /// Where its token stands among the others.
    pub at: usize,
}

/// An opener and a closer that met: `open` and `close` are token positions.
#[derive(Clone, Copy, Debug)]
pub(super) struct Pair {
    pub open: usize,
    pub close: usize,
    pub flag: u8,
}

impl Delim {
    /// What is left of it as text.
    pub fn literal(&self) -> String {
        match self.kind {
            _ if self.left == 0 => String::new(),
            Kind::Star => "*".repeat(self.left),
            Kind::Under => "_".repeat(self.left),
            Kind::Tilde => "~".repeat(self.left),
            Kind::Tag(name, true) => format!("<{name}>"),
            Kind::Tag(name, false) => format!("</{name}>"),
        }
    }
}

/// Whether `closer` may take characters from `opener`.
fn fits(opener: &Delim, closer: &Delim) -> bool {
    if !opener.open || opener.left == 0 {
        return false;
    }
    match (opener.kind, closer.kind) {
        (Kind::Star, Kind::Star) | (Kind::Under, Kind::Under) => {
            // The rule of three keeps `**a*b**` from pairing across the middle
            // marker when either side could also be the other kind.
            let odd = (opener.close || closer.open)
                && (opener.n + closer.n).is_multiple_of(3)
                && !(opener.n.is_multiple_of(3) && closer.n.is_multiple_of(3));
            !odd
        }
        (Kind::Tilde, Kind::Tilde) => true,
        (Kind::Tag(a, true), Kind::Tag(b, false)) => a == b,
        _ => false,
    }
}

fn flag(kind: Kind, used: usize) -> u8 {
    match kind {
        Kind::Star | Kind::Under if used == 2 => BOLD,
        Kind::Star | Kind::Under => ITALIC,
        Kind::Tilde => STRIKE,
        Kind::Tag('b', _) => BOLD,
        Kind::Tag('i', _) => ITALIC,
        Kind::Tag('s', _) => STRIKE,
        Kind::Tag(..) => UNDER,
    }
}

/// Pairs the delimiters up. Afterwards `left` says how much of each is text.
pub(super) fn pair_up(ds: &mut [Delim]) -> Vec<Pair> {
    let mut alive = vec![true; ds.len()];
    let mut pairs = Vec::new();
    for c in 0..ds.len() {
        if !ds[c].close {
            continue;
        }
        while ds[c].left > 0 {
            let Some(o) = (0..c).rev().find(|&o| alive[o] && fits(&ds[o], &ds[c])) else {
                break;
            };
            let used = match ds[c].kind {
                Kind::Tag(..) => 1,
                Kind::Tilde => 2,
                _ if ds[o].left >= 2 && ds[c].left >= 2 => 2,
                _ => 1,
            };
            pairs.push(Pair {
                open: ds[o].at,
                close: ds[c].at,
                flag: flag(ds[o].kind, used),
            });
            ds[o].left -= used;
            ds[c].left -= used;
            // What sat between the two can no longer pair with anything.
            alive[o + 1..c].fill(false);
            if ds[o].left == 0 {
                alive[o] = false;
            }
        }
        if ds[c].left == 0 || !ds[c].open {
            alive[c] = false;
        }
    }
    pairs
}
