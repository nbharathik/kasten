//! A slide is drawn in units of 1/96 inch. A 16:9 slide is 960 x 540 units,
//! which is 10 x 5.625 inches, the size PowerPoint and Google Slides use;
//! one unit is exactly 9525 EMU, so export never rounds. Type sizes are in
//! points, and 1 pt is 4/3 units.

pub const SLIDE_WIDTH: f64 = 960.0;
pub const SLIDE_HEIGHT: f64 = 540.0;
pub const SLIDE_WIDTH_4_3: f64 = 720.0;
pub const EMU_PER_UNIT: i64 = 9525;

pub fn units_to_emu(units: f64) -> i64 {
    (units * EMU_PER_UNIT as f64).round() as i64
}

pub fn emu_to_units(emu: i64) -> f64 {
    emu as f64 / EMU_PER_UNIT as f64
}

pub fn points_to_units(points: f64) -> f64 {
    points * 4.0 / 3.0
}

pub fn units_to_points(units: f64) -> f64 {
    units * 3.0 / 4.0
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_16_9_slide_is_ten_by_five_and_five_eighths_inches() {
        assert_eq!(units_to_emu(SLIDE_WIDTH), 9_144_000);
        assert_eq!(units_to_emu(SLIDE_HEIGHT), 5_143_500);
    }

    #[test]
    fn whole_units_convert_to_emu_and_back_exactly() {
        for units in [0.0, 1.0, 37.0, 960.0] {
            assert_eq!(emu_to_units(units_to_emu(units)), units);
        }
    }

    #[test]
    fn points_are_four_thirds_of_a_unit() {
        assert_eq!(points_to_units(18.0), 24.0);
        assert!((units_to_points(points_to_units(11.0)) - 11.0).abs() < 1e-12);
    }
}
