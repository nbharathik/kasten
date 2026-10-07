//! What a launch does when Kasten is already running: an installed copy
//! brings the open window forward instead of opening a second one.

/// Whether a second launch hands over to the first. Development builds
/// and windows on the vault `KASTEN_VAULT` names run beside the everyday
/// one, so trying a change never focuses an installed Kasten instead;
/// `KASTEN_SINGLE_INSTANCE=1` hands over anyway, and `=0` never.
pub fn single_instance(debug: bool, vault_from_env: bool, asked: Option<&str>) -> bool {
    match asked.map(str::trim) {
        Some("1") => true,
        Some("0") => false,
        _ => !debug && !vault_from_env,
    }
}

/// Whether the session bus can be reached to hand over, on Linux, where the
/// hand-over talks over D-Bus: an address set but empty stops it cold, and
/// the window would never open.
pub fn bus_usable(address: Option<&str>) -> bool {
    address.is_none_or(|address| !address.trim().is_empty())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn only_an_installed_copy_on_its_own_vault_hands_over() {
        assert!(single_instance(false, false, None));
        assert!(!single_instance(true, false, None), "development builds");
        assert!(!single_instance(false, true, None), "KASTEN_VAULT");
        assert!(single_instance(true, true, Some("1")));
        assert!(!single_instance(false, false, Some(" 0 ")));
        // Anything else leaves the choice to the build.
        assert!(single_instance(false, false, Some("yes")));
        assert!(!single_instance(true, false, Some("")));
    }

    #[test]
    fn an_empty_bus_address_skips_the_hand_over() {
        assert!(bus_usable(None));
        assert!(bus_usable(Some("unix:path=/run/user/1000/bus")));
        assert!(!bus_usable(Some("  ")));
    }
}
