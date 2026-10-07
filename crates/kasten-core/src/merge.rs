//! A line-based three-way merge: when a note
//! changed on disk while the editor had it open, both sides' edits are kept
//! if they touch different lines. Overlapping edits return None, and the
//! caller keeps the editor's copy beside the file instead.

/// Lines with their endings, so the merge keeps `\r\n` and a missing final newline.
fn lines(text: &str) -> Vec<&str> {
    text.split_inclusive('\n').collect()
}

/// Largest file the merge attempts, in lines per side; bigger ones conflict.
const MAX_LINES: usize = 4000;

/// For each line of `base`, the index of the line of `other` it matches in
/// a longest common subsequence.
fn matches(base: &[&str], other: &[&str]) -> Vec<Option<usize>> {
    let (n, m) = (base.len(), other.len());
    let mut table = vec![0u32; (n + 1) * (m + 1)];
    let at = |i: usize, j: usize| i * (m + 1) + j;
    for i in (0..n).rev() {
        for j in (0..m).rev() {
            table[at(i, j)] = if base[i] == other[j] {
                table[at(i + 1, j + 1)] + 1
            } else {
                table[at(i + 1, j)].max(table[at(i, j + 1)])
            };
        }
    }
    let mut out = vec![None; n];
    let (mut i, mut j) = (0, 0);
    while i < n && j < m {
        if base[i] == other[j] {
            out[i] = Some(j);
            i += 1;
            j += 1;
        } else if table[at(i + 1, j)] >= table[at(i, j + 1)] {
            i += 1;
        } else {
            j += 1;
        }
    }
    out
}

/// Merges the edits `ours` and `theirs` made to `base`, or returns None if
/// they changed the same lines differently.
pub fn merge3(base: &str, ours: &str, theirs: &str) -> Option<String> {
    if ours == theirs || theirs == base {
        return Some(ours.to_owned());
    }
    if ours == base {
        return Some(theirs.to_owned());
    }
    let (o, a, b) = (lines(base), lines(ours), lines(theirs));
    if o.len().max(a.len()).max(b.len()) > MAX_LINES {
        return None;
    }
    let (ma, mb) = (matches(&o, &a), matches(&o, &b));
    let mut out = String::with_capacity(ours.len().max(theirs.len()));
    let (mut i, mut ia, mut ib) = (0, 0, 0);
    loop {
        let stable = (i..o.len()).find(|&k| ma[k].is_some() && mb[k].is_some());
        let (k, ka, kb) = match stable {
            Some(k) => (k, ma[k]?, mb[k]?),
            None => (o.len(), a.len(), b.len()),
        };
        if k == i && ka == ia && kb == ib {
            if k == o.len() {
                break;
            }
            out.push_str(o[k]);
            (i, ia, ib) = (k + 1, ka + 1, kb + 1);
            continue;
        }
        let (base_part, our_part, their_part) = (&o[i..k], &a[ia..ka], &b[ib..kb]);
        if our_part == base_part {
            out.extend(their_part.iter().copied());
        } else if their_part == base_part || our_part == their_part {
            out.extend(our_part.iter().copied());
        } else {
            return None;
        }
        (i, ia, ib) = (k, ka, kb);
    }
    Some(out)
}

#[cfg(test)]
mod tests {
    use super::*;

    const BASE: &str = "# Title\n\nFirst paragraph.\n\nSecond paragraph.\n\nThird paragraph.\n";

    #[test]
    fn keeps_edits_to_different_lines() {
        let ours = BASE.replace("First", "My first");
        let theirs = BASE.replace("Third", "Their third");
        assert_eq!(
            merge3(BASE, &ours, &theirs).unwrap(),
            "# Title\n\nMy first paragraph.\n\nSecond paragraph.\n\nTheir third paragraph.\n"
        );
    }

    #[test]
    fn keeps_additions_and_removals_on_both_sides() {
        let ours = format!("{BASE}\nAdded at the end.\n");
        let theirs = BASE.replace("Second paragraph.\n\n", "");
        assert_eq!(
            merge3(BASE, &ours, &theirs).unwrap(),
            "# Title\n\nFirst paragraph.\n\nThird paragraph.\n\nAdded at the end.\n"
        );
        assert_eq!(merge3(BASE, &ours, &ours).unwrap(), ours);
        assert_eq!(merge3(BASE, BASE, &theirs).unwrap(), theirs);
    }

    #[test]
    fn refuses_overlapping_edits() {
        let ours = BASE.replace("Second", "Our second");
        let theirs = BASE.replace("Second", "Their second");
        assert_eq!(merge3(BASE, &ours, &theirs), None);
    }

    #[test]
    fn keeps_line_endings() {
        let base = "a\r\nb\r\nc";
        assert_eq!(
            merge3(base, "A\r\nb\r\nc", "a\r\nb\r\nC").unwrap(),
            "A\r\nb\r\nC"
        );
    }
}
