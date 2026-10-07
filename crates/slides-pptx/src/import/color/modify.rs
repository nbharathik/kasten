//! The maths of colours: RGB and HSL, and the modifiers PowerPoint puts on a
//! colour (`lumMod`, `tint` ...). Luminance, saturation and hue work in HSL;
//! `tint` and `shade` work on linear light, as PowerPoint and LibreOffice do.

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Rgb(pub u8, pub u8, pub u8);

impl Rgb {
    pub fn from_hex(text: &str) -> Option<Rgb> {
        let text = text.trim().trim_start_matches('#');
        let text = match text.len() {
            3 => text.chars().flat_map(|c| [c, c]).collect::<String>(),
            6 => text.to_owned(),
            _ => return None,
        };
        let byte = |at: usize| u8::from_str_radix(text.get(at..at + 2)?, 16).ok();
        Some(Rgb(byte(0)?, byte(2)?, byte(4)?))
    }

    /// `#rrggbb`, lower case.
    pub fn to_hex(self) -> String {
        format!("#{:02x}{:02x}{:02x}", self.0, self.1, self.2)
    }
}

fn channel(v: f64) -> u8 {
    (v * 255.0).round().clamp(0.0, 255.0) as u8
}

/// sRGB (0 to 1) to linear light.
fn to_linear(c: f64) -> f64 {
    if c <= 0.04045 {
        c / 12.92
    } else {
        ((c + 0.055) / 1.055).powf(2.4)
    }
}

/// Linear light (0 to 1) to an sRGB byte.
pub fn to_srgb(l: f64) -> u8 {
    let l = l.clamp(0.0, 1.0);
    let c = if l <= 0.003_130_8 {
        l * 12.92
    } else {
        1.055 * l.powf(1.0 / 2.4) - 0.055
    };
    channel(c)
}

/// Hue in degrees, saturation and lightness in 0 to 1.
pub fn to_hsl(Rgb(r, g, b): Rgb) -> (f64, f64, f64) {
    let (r, g, b) = (
        f64::from(r) / 255.0,
        f64::from(g) / 255.0,
        f64::from(b) / 255.0,
    );
    let max = r.max(g).max(b);
    let min = r.min(g).min(b);
    let l = (max + min) / 2.0;
    if (max - min).abs() < f64::EPSILON {
        return (0.0, 0.0, l);
    }
    let d = max - min;
    let s = if l > 0.5 {
        d / (2.0 - max - min)
    } else {
        d / (max + min)
    };
    let h = if (max - r).abs() < f64::EPSILON {
        (g - b) / d + if g < b { 6.0 } else { 0.0 }
    } else if (max - g).abs() < f64::EPSILON {
        (b - r) / d + 2.0
    } else {
        (r - g) / d + 4.0
    };
    (h * 60.0, s, l)
}

pub fn from_hsl(h: f64, s: f64, l: f64) -> Rgb {
    let (h, s, l) = (
        h.rem_euclid(360.0) / 360.0,
        s.clamp(0.0, 1.0),
        l.clamp(0.0, 1.0),
    );
    if s == 0.0 {
        return Rgb(channel(l), channel(l), channel(l));
    }
    let q = if l < 0.5 {
        l * (1.0 + s)
    } else {
        l + s - l * s
    };
    let p = 2.0 * l - q;
    let hue = |mut t: f64| {
        t = t.rem_euclid(1.0);
        if t < 1.0 / 6.0 {
            p + (q - p) * 6.0 * t
        } else if t < 0.5 {
            q
        } else if t < 2.0 / 3.0 {
            p + (q - p) * (2.0 / 3.0 - t) * 6.0
        } else {
            p
        }
    };
    Rgb(
        channel(hue(h + 1.0 / 3.0)),
        channel(hue(h)),
        channel(hue(h - 1.0 / 3.0)),
    )
}

/// One modifier applied to a colour. `v` is the modifier's value as a fraction (1 is 100%).
pub fn apply(rgb: Rgb, name: &str, v: f64) -> Rgb {
    match name {
        "a:lumMod" | "a:lumOff" | "a:lum" | "a:satMod" | "a:satOff" | "a:sat" | "a:hueMod"
        | "a:hueOff" | "a:hue" => {
            let (h, s, l) = to_hsl(rgb);
            let (h, s, l) = match name {
                "a:lumMod" => (h, s, l * v),
                "a:lumOff" => (h, s, l + v),
                "a:lum" => (h, s, v),
                "a:satMod" => (h, s * v, l),
                "a:satOff" => (h, s + v, l),
                "a:sat" => (h, v, l),
                "a:hueMod" => (h * v, s, l),
                "a:hueOff" => (h + v * 360.0, s, l),
                _ => (v * 360.0, s, l),
            };
            from_hsl(h, s, l)
        }
        "a:tint" | "a:shade" => {
            let map = |c: u8| {
                let linear = to_linear(f64::from(c) / 255.0);
                let out = if name == "a:tint" {
                    1.0 - (1.0 - linear) * v
                } else {
                    linear * v
                };
                to_srgb(out)
            };
            Rgb(map(rgb.0), map(rgb.1), map(rgb.2))
        }
        "a:comp" => {
            let (h, s, l) = to_hsl(rgb);
            from_hsl(h + 180.0, s, l)
        }
        "a:inv" => Rgb(255 - rgb.0, 255 - rgb.1, 255 - rgb.2),
        "a:gray" => {
            let grey =
                (0.299 * f64::from(rgb.0) + 0.587 * f64::from(rgb.1) + 0.114 * f64::from(rgb.2))
                    .round() as u8;
            Rgb(grey, grey, grey)
        }
        "a:red" => Rgb(channel(v), rgb.1, rgb.2),
        "a:green" => Rgb(rgb.0, channel(v), rgb.2),
        "a:blue" => Rgb(rgb.0, rgb.1, channel(v)),
        "a:redMod" => Rgb(channel(f64::from(rgb.0) / 255.0 * v), rgb.1, rgb.2),
        "a:greenMod" => Rgb(rgb.0, channel(f64::from(rgb.1) / 255.0 * v), rgb.2),
        "a:blueMod" => Rgb(rgb.0, rgb.1, channel(f64::from(rgb.2) / 255.0 * v)),
        "a:redOff" => Rgb(channel(f64::from(rgb.0) / 255.0 + v), rgb.1, rgb.2),
        "a:greenOff" => Rgb(rgb.0, channel(f64::from(rgb.1) / 255.0 + v), rgb.2),
        "a:blueOff" => Rgb(rgb.0, rgb.1, channel(f64::from(rgb.2) / 255.0 + v)),
        _ => rgb,
    }
}

/// The average of colours, weighted, in sRGB: what a gradient is drawn as when a deck cannot hold one.
pub fn average(stops: &[(Rgb, f64)]) -> Option<Rgb> {
    let total: f64 = stops.iter().map(|(_, w)| w).sum();
    if stops.is_empty() || total <= 0.0 {
        return stops.first().map(|(c, _)| *c);
    }
    let mix = |pick: fn(&Rgb) -> u8| {
        (stops
            .iter()
            .map(|(c, w)| f64::from(pick(c)) * w)
            .sum::<f64>()
            / total)
            .round() as u8
    };
    Some(Rgb(mix(|c| c.0), mix(|c| c.1), mix(|c| c.2)))
}
