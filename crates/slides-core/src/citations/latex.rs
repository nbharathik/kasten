//! BibTeX values are written in LaTeX: braces protect capital letters, `{\'e}`
//! is an é, `--` is a dash. [`plain`] turns one into the words a person reads,
//! in one pass and without ever failing, whatever it is given.

/// Accents that take a letter, with the letters they can be put on and what
/// each becomes: pairs of characters, base first.
fn accented(accent: char) -> &'static str {
    match accent {
        '\'' => "aáeéiíoóuúyýcćnńsśzźlĺrŕAÁEÉIÍOÓUÚYÝCĆNŃSŚZŹLĹRŔ",
        '`' => "aàeèiìoòuùAÀEÈIÌOÒUÙ",
        '^' => "aâeêiîoôuûcĉgĝhĥjĵsŝwŵyŷAÂEÊIÎOÔUÛCĈGĜHĤJĴSŜWŴYŶ",
        '"' => "aäeëiïoöuüyÿAÄEËIÏOÖUÜYŸ",
        '~' => "aãnñoõiĩuũAÃNÑOÕIĨUŨ",
        '=' => "aāeēiīoōuūAĀEĒIĪOŌUŪ",
        '.' => "zżcċeėgġIİZŻCĊEĖGĠ",
        'c' => "cçCÇsşSŞtţTŢgģGĢkķKĶlļLĻnņNŅrŗRŖ",
        'v' => "cčCČsšSŠzžZŽrřRŘeěEĚnňNŇdďDĎtťTŤlľLĽ",
        'u' => "gğGĞaăAĂeĕEĔuŭUŬiĭIĬoŏOŎ",
        'H' => "oőuűOŐUŰ",
        'r' => "aåAÅuůUŮ",
        'k' => "aąAĄeęEĘiįIĮuųUŲ",
        _ => "",
    }
}

/// `letter` with `accent` on it, if there is such a letter.
fn compose(accent: char, letter: char) -> Option<char> {
    let mut pairs = accented(accent).chars();
    while let (Some(base), Some(with)) = (pairs.next(), pairs.next()) {
        if base == letter {
            return Some(with);
        }
    }
    None
}

/// The letters LaTeX writes with a command of their own.
fn letter(name: &str) -> Option<char> {
    Some(match name {
        "ss" => 'ß',
        "o" => 'ø',
        "O" => 'Ø',
        "ae" => 'æ',
        "AE" => 'Æ',
        "oe" => 'œ',
        "OE" => 'Œ',
        "aa" => 'å',
        "AA" => 'Å',
        "l" => 'ł',
        "L" => 'Ł',
        "i" => 'i',
        "j" => 'j',
        "dh" => 'ð',
        "DH" => 'Ð',
        "th" => 'þ',
        "TH" => 'Þ',
        _ => return None,
    })
}

/// Greek letters and a few signs, which only mean something in a formula.
fn symbol(name: &str) -> Option<char> {
    Some(match name {
        "alpha" => 'α',
        "beta" => 'β',
        "gamma" => 'γ',
        "delta" => 'δ',
        "epsilon" | "varepsilon" => 'ε',
        "zeta" => 'ζ',
        "eta" => 'η',
        "theta" => 'θ',
        "iota" => 'ι',
        "kappa" => 'κ',
        "lambda" => 'λ',
        "mu" => 'μ',
        "nu" => 'ν',
        "xi" => 'ξ',
        "pi" => 'π',
        "rho" => 'ρ',
        "sigma" => 'σ',
        "tau" => 'τ',
        "phi" | "varphi" => 'φ',
        "chi" => 'χ',
        "psi" => 'ψ',
        "omega" => 'ω',
        "Gamma" => 'Γ',
        "Delta" => 'Δ',
        "Theta" => 'Θ',
        "Lambda" => 'Λ',
        "Xi" => 'Ξ',
        "Pi" => 'Π',
        "Sigma" => 'Σ',
        "Phi" => 'Φ',
        "Psi" => 'Ψ',
        "Omega" => 'Ω',
        "times" => '×',
        "infty" => '∞',
        "to" | "rightarrow" => '→',
        _ => return None,
    })
}

fn is_blank(c: char) -> bool {
    matches!(c, ' ' | '\t' | '\n' | '\r')
}

/// Writes `accent` on the letter that follows `from`, which may be in braces
/// (`\'{e}`), or a dotless i (`\'{\i}`). Returns where reading goes on.
fn accent(chars: &[char], from: usize, accent: char, out: &mut String) -> usize {
    let mut at = from;
    while chars.get(at).is_some_and(|c| is_blank(*c)) {
        at += 1;
    }
    if chars.get(at) == Some(&'{') {
        at += 1;
        while chars.get(at).is_some_and(|c| is_blank(*c)) {
            at += 1;
        }
    }
    let base = match (chars.get(at), chars.get(at + 1), chars.get(at + 2)) {
        // A dotless i or j: the accent goes on the plain letter.
        (Some('\\'), Some(&dotless @ ('i' | 'j')), after)
            if !after.is_some_and(|c| c.is_ascii_alphabetic()) =>
        {
            at += 2;
            Some(dotless)
        }
        (Some(&c), _, _) if c.is_alphabetic() => {
            at += 1;
            Some(c)
        }
        _ => None,
    };
    if let Some(base) = base {
        out.push(compose(accent, base).unwrap_or(base));
    }
    at
}

/// Reads the command that starts at the backslash at `at`.
fn command(chars: &[char], at: usize, in_math: bool, out: &mut String) -> usize {
    let Some(&next) = chars.get(at + 1) else {
        return at + 1;
    };
    match next {
        '\'' | '`' | '^' | '"' | '~' | '=' | '.' => accent(chars, at + 2, next, out),
        '&' | '%' | '$' | '#' | '_' | '{' | '}' => {
            out.push(next);
            at + 2
        }
        '-' | '/' | '@' => at + 2,
        c if c.is_ascii_alphabetic() => word(chars, at + 1, in_math, out),
        c if c.is_whitespace() || matches!(c, '\\' | ',' | ';' | ':' | '!') => {
            out.push(' ');
            at + 2
        }
        c => {
            out.push(c);
            at + 2
        }
    }
}

/// Reads a command made of letters, such as `\ss`, `\c` or `\textit`.
fn word(chars: &[char], start: usize, in_math: bool, out: &mut String) -> usize {
    let mut end = start;
    while chars.get(end).is_some_and(char::is_ascii_alphabetic) {
        end += 1;
    }
    let name: String = chars[start..end].iter().collect();
    // TeX does not see the spaces after a command.
    let mut next = end;
    while chars.get(next).is_some_and(|c| is_blank(*c)) {
        next += 1;
    }
    match name.as_str() {
        "c" | "v" | "u" | "H" | "r" | "k" | "d" | "b" => {
            return accent(chars, next, name.chars().next().unwrap_or('c'), out);
        }
        "LaTeX" | "TeX" => out.push_str(&name),
        _ => {
            if let Some(c) = letter(&name) {
                out.push(c);
            } else if in_math {
                match symbol(&name) {
                    Some(c) => out.push(c),
                    None => out.push_str(&name),
                }
            }
            // Any other command is left out and what it holds is kept.
        }
    }
    next
}

/// The text of a BibTeX value as it reads: accents and dashes written out,
/// braces, commands and formula dollars gone, and every run of white space one space.
pub fn plain(raw: &str) -> String {
    let chars: Vec<char> = raw.chars().collect();
    let mut out = String::with_capacity(raw.len());
    let mut in_math = false;
    let mut at = 0;
    while at < chars.len() {
        match chars[at] {
            '\\' => at = command(&chars, at, in_math, &mut out),
            '$' => {
                in_math = !in_math;
                at += 1;
            }
            '{' | '}' => at += 1,
            '~' => {
                out.push(' ');
                at += 1;
            }
            '-' => {
                let mut run = 0;
                while chars.get(at + run) == Some(&'-') {
                    run += 1;
                }
                at += run;
                for _ in 0..run / 3 {
                    out.push('—');
                }
                match run % 3 {
                    2 => out.push('–'),
                    1 => out.push('-'),
                    _ => {}
                }
            }
            '`' if chars.get(at + 1) == Some(&'`') => {
                out.push('“');
                at += 2;
            }
            '\'' if chars.get(at + 1) == Some(&'\'') => {
                out.push('”');
                at += 2;
            }
            c if c.is_whitespace() || c.is_control() => {
                out.push(' ');
                at += 1;
            }
            c => {
                out.push(c);
                at += 1;
            }
        }
    }
    out.split_whitespace().collect::<Vec<_>>().join(" ")
}
