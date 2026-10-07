fn main() {
    // Windows gives a program's main thread 1 MB of stack, and unoptimised
    // builds can need more: ask for 8 MB, as Linux and macOS give.
    if std::env::var("CARGO_CFG_TARGET_OS").as_deref() == Ok("windows") {
        match std::env::var("CARGO_CFG_TARGET_ENV").as_deref() {
            Ok("msvc") => println!("cargo:rustc-link-arg-bins=/STACK:8388608"),
            Ok("gnu") => println!("cargo:rustc-link-arg-bins=-Wl,--stack,8388608"),
            _ => {}
        }
    }
    tauri_build::build()
}
