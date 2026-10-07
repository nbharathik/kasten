//! Numbers read from a file, made safe: PowerPoint's units turned into slide
//! units, and every value held to a range a deck can draw.

use slides_core::units::EMU_PER_UNIT;

/// The farthest from the slide's corner a position is kept, in slide units.
pub const FAR: f64 = 20_000.0;
/// The least a type size may be, and the most, in points.
pub const SIZES: (f64, f64) = (1.0, 999.0);

/// Rounds to two decimals, which is as fine as a deck writes a position.
pub fn round2(v: f64) -> f64 {
    (v * 100.0).round() / 100.0
}

/// Slide units for a position in EMU.
pub fn position(emu: i64) -> f64 {
    round2((emu as f64 / EMU_PER_UNIT as f64).clamp(-FAR, FAR))
}

/// Slide units for a length in EMU, never negative.
pub fn length(emu: i64) -> f64 {
    round2((emu as f64 / EMU_PER_UNIT as f64).clamp(0.0, FAR))
}

/// A place or size a hair off a whole unit, as a program with its own grid leaves it (LibreOffice counts
/// in hundredths of a millimetre, so 64 comes back as 63.99), put on the whole unit. Only boxes are
/// snapped: an inset or a line width is as exact as the file has it.
pub fn snapped(v: f64) -> f64 {
    let whole = v.round();
    if whole != 0.0 && (v - whole).abs() < 0.06 {
        whole
    } else {
        v
    }
}

/// Degrees for an angle in sixty-thousandths of a degree, in `0..360`.
pub fn degrees(sixty_thousandths: i64) -> f64 {
    let turn = (sixty_thousandths as f64 / 60_000.0).rem_euclid(360.0);
    (turn * 1000.0).round() / 1000.0 % 360.0
}

/// Points for a size in hundredths of a point, kept between 1 and 999.
pub fn points(hundredths: i64) -> f64 {
    (hundredths as f64 / 100.0).clamp(SIZES.0, SIZES.1)
}

/// A number with a few decimals, for ratios that are stored.
pub fn round4(v: f64) -> f64 {
    (v * 10_000.0).round() / 10_000.0
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn emu_are_9525_to_the_unit_and_huge_numbers_are_held() {
        assert_eq!(position(9_144_000), 960.0);
        assert_eq!(position(-95_250), -10.0);
        assert_eq!(length(-5), 0.0);
        assert_eq!(length(i64::MAX), FAR);
        assert_eq!(position(i64::MIN), -FAR);
        assert_eq!(position(1), 0.0);
    }

    #[test]
    fn a_hair_off_a_whole_unit_is_a_whole_unit_and_a_real_fraction_stays() {
        assert_eq!(snapped(position(609_480)), 64.0);
        assert_eq!(snapped(length(7_924_320)), 832.0);
        assert_eq!(snapped(position(619_125)), 65.0);
        assert_eq!(snapped(position(9525 * 10 + 4762)), 10.5);
        // A hair of a unit is not snapped to nothing, and an inset of 9.95 is not the caller's to move.
        assert_eq!(snapped(length(300)), 0.03);
        assert_eq!(length(94_764), 9.95);
    }

    #[test]
    fn angles_come_out_in_one_turn_and_sizes_stay_between_1_and_999_points() {
        assert_eq!(degrees(5_400_000), 90.0);
        assert_eq!(degrees(-5_400_000), 270.0);
        assert_eq!(degrees(21_600_000), 0.0);
        assert_eq!(degrees(18_900_000), 315.0);
        assert_eq!(points(2200), 22.0);
        assert_eq!(points(0), 1.0);
        assert_eq!(points(i64::MAX), 999.0);
    }
}
