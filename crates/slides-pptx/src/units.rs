//! Slide units and points as the numbers PPTX stores. One unit is exactly
//! 9525 EMU, so positions never round.

use slides_core::units::units_to_emu;

/// The id of the one slide master; the ids of its layouts follow it.
pub const SLIDE_MASTER_ID: i64 = 2_147_483_648;

/// The largest coordinate PowerPoint reads without complaint (a signed 32-bit number).
const LIMIT: i64 = i32::MAX as i64;

/// EMU for a position, kept within what PowerPoint reads.
pub fn emu(units: f64) -> i64 {
    units_to_emu(units).clamp(-LIMIT, LIMIT)
}

/// EMU for a length, which cannot be negative.
pub fn length(units: f64) -> i64 {
    emu(units).max(0)
}

/// Hundredths of a point, which is how PPTX stores type sizes and spacing.
pub fn hundredths(points: f64) -> i64 {
    (points * 100.0).round() as i64
}

/// A fraction (1 is a whole) as hundred-thousandths, which is how PPTX stores percentages.
pub fn thousandths(fraction: f64) -> i64 {
    (fraction * 100_000.0).round() as i64
}

/// Sixty-thousandths of a degree, turned into the range 0 to 360 degrees.
pub fn angle(degrees: f64) -> i64 {
    (degrees.rem_euclid(360.0) * 60_000.0).round() as i64 % 21_600_000
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn units_are_9525_emu_each() {
        assert_eq!(emu(960.0), 9_144_000);
        assert_eq!(emu(9.6), 91_440);
        assert_eq!(emu(-10.0), -95_250);
    }

    #[test]
    fn a_length_is_never_negative_and_nothing_overflows() {
        assert_eq!(length(-3.0), 0);
        assert_eq!(emu(f64::NAN), 0);
        assert_eq!(emu(1e300), i64::from(i32::MAX));
    }

    #[test]
    fn points_and_fractions_scale_by_a_hundred_and_a_hundred_thousand() {
        assert_eq!(hundredths(22.0), 2200);
        assert_eq!(hundredths(10.5), 1050);
        assert_eq!(thousandths(1.15), 115_000);
        assert_eq!(thousandths(0.3), 30_000);
    }

    #[test]
    fn angles_wrap_into_one_turn() {
        assert_eq!(angle(90.0), 5_400_000);
        assert_eq!(angle(-90.0), 16_200_000);
        assert_eq!(angle(360.0), 0);
        assert_eq!(angle(450.5), 5_430_000);
        assert_eq!(angle(f64::NAN), 0);
    }
}
