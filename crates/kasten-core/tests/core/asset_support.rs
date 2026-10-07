//! Shared by the asset tests: the pictures in `fixtures/assets/`, with what
//! `manifest.json` (made by an independent tool) says of each.

use std::fs;
use std::path::PathBuf;

use serde_json::Value;

fn folder() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../fixtures/assets")
}

/// The bytes of a picture in `fixtures/assets/`.
pub fn fixture(name: &str) -> Vec<u8> {
    fs::read(folder().join(name)).unwrap()
}

/// What the manifest says of a fixture.
pub struct Known {
    pub sha256: String,
    pub bytes: u64,
    pub width: u32,
    pub height: u32,
}

pub fn known(name: &str) -> Known {
    let manifest: Value =
        serde_json::from_str(&fs::read_to_string(folder().join("manifest.json")).unwrap()).unwrap();
    let entry = &manifest[name];
    Known {
        sha256: entry["sha256"].as_str().unwrap().to_owned(),
        bytes: entry["bytes"].as_u64().unwrap(),
        width: entry["width"].as_u64().unwrap() as u32,
        height: entry["height"].as_u64().unwrap() as u32,
    }
}

fn crc32(data: &[u8]) -> u32 {
    let mut crc = u32::MAX;
    for byte in data {
        crc ^= u32::from(*byte);
        for _ in 0..8 {
            crc = if crc & 1 == 1 {
                0xEDB8_8320 ^ (crc >> 1)
            } else {
                crc >> 1
            };
        }
    }
    !crc
}

fn adler32(data: &[u8]) -> u32 {
    let (mut a, mut b) = (1u32, 0u32);
    for byte in data {
        a = (a + u32::from(*byte)) % 65_521;
        b = (b + a) % 65_521;
    }
    (b << 16) | a
}

fn chunk(kind: &[u8; 4], data: &[u8]) -> Vec<u8> {
    let mut body = kind.to_vec();
    body.extend_from_slice(data);
    let mut out = (data.len() as u32).to_be_bytes().to_vec();
    out.extend_from_slice(&body);
    out.extend_from_slice(&crc32(&body).to_be_bytes());
    out
}

/// A PNG of one colour, made here without a compressor: for a given width and
/// height it is always the same length, so two pictures can differ in their
/// pixels and nothing else a size can tell.
pub fn solid_png(width: u32, height: u32, rgb: [u8; 3]) -> Vec<u8> {
    // Each row: filter byte 0 (none), then the pixels.
    let mut row = vec![0];
    for _ in 0..width {
        row.extend_from_slice(&rgb);
    }
    let raw = row.repeat(height as usize);
    let mut zlib = vec![0x78, 0x01];
    let mut blocks = raw.chunks(65_535).peekable();
    while let Some(block) = blocks.next() {
        zlib.push(u8::from(blocks.peek().is_none()));
        zlib.extend_from_slice(&(block.len() as u16).to_le_bytes());
        zlib.extend_from_slice(&(!(block.len() as u16)).to_le_bytes());
        zlib.extend_from_slice(block);
    }
    zlib.extend_from_slice(&adler32(&raw).to_be_bytes());
    let mut header = width.to_be_bytes().to_vec();
    header.extend_from_slice(&height.to_be_bytes());
    header.extend_from_slice(&[8, 2, 0, 0, 0]);
    let mut png = b"\x89PNG\r\n\x1a\n".to_vec();
    png.extend(chunk(b"IHDR", &header));
    png.extend(chunk(b"IDAT", &zlib));
    png.extend(chunk(b"IEND", &[]));
    png
}
