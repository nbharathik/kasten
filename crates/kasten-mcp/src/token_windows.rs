//! Owner-only ACLs applied to an empty, exclusively opened file before secrets are written.
use std::fs::{File, OpenOptions};
use std::io;
use std::os::windows::fs::OpenOptionsExt;
use std::path::Path;
use windows_permissions::constants::{SeObjectType::SE_FILE_OBJECT, SecurityInformation as Info};
use windows_permissions::{LocalBox, SecurityDescriptor, wrappers};

fn descriptor(file: &File) -> io::Result<LocalBox<SecurityDescriptor>> {
    wrappers::GetSecurityInfo(file, SE_FILE_OBJECT, Info::Owner | Info::Dacl)
}

fn owner_acl(file: &File) -> io::Result<LocalBox<SecurityDescriptor>> {
    let current = descriptor(file)?;
    let owner = current
        .owner()
        .ok_or_else(|| io::Error::other("Token file has no owner"))?;
    format!("D:P(A;;FA;;;{owner})").parse()
}

pub(super) fn options(options: &mut OpenOptions) {
    // GENERIC_READ | GENERIC_WRITE | READ_CONTROL | WRITE_DAC;
    // no sharing prevents another reader opening the empty file before its ACL is set.
    options
        .access_mode(0xc0060000)
        .share_mode(0)
        .custom_flags(0x00200000);
}

pub(super) fn protect(file: &mut File) -> io::Result<()> {
    let acl = owner_acl(file)?;
    wrappers::SetSecurityInfo(
        file,
        SE_FILE_OBJECT,
        Info::Dacl | Info::ProtectedDacl,
        None,
        None,
        acl.dacl(),
        None,
    )?;
    if !private(file)? {
        return Err(io::Error::other("Could not protect token permissions"));
    }
    Ok(())
}

fn private(file: &File) -> io::Result<bool> {
    let current = descriptor(file)?;
    let expected = owner_acl(file)?;
    let actual =
        wrappers::ConvertSecurityDescriptorToStringSecurityDescriptor(&current, Info::Dacl)?;
    let expected =
        wrappers::ConvertSecurityDescriptorToStringSecurityDescriptor(&expected, Info::Dacl)?;
    // Windows retains the auto-inherited marker after inheritance is
    // disabled. It does not grant access; the protected bit and the one
    // owner ACE must still match exactly.
    let actual = actual.to_string_lossy().replacen("D:PAI(", "D:P(", 1);
    Ok(actual == expected.to_string_lossy())
}

pub(super) fn trusted(path: &Path) -> bool {
    File::open(path)
        .and_then(|file| private(&file))
        .unwrap_or(false)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn broad_permissions_are_rejected_and_protection_removes_inheritance() {
        let dir = std::env::temp_dir().join(format!(
            "kasten-acl-{}",
            kasten_core::ulid_at(kasten_core::Instant::now().millis)
        ));
        std::fs::create_dir(&dir).unwrap();
        let path = dir.join("token");
        let mut options = OpenOptions::new();
        options.write(true).create_new(true);
        super::options(&mut options);
        let mut file = options.open(&path).unwrap();
        let broad: LocalBox<SecurityDescriptor> = "D:P(A;;FA;;;WD)".parse().unwrap();
        wrappers::SetSecurityInfo(
            &mut file,
            SE_FILE_OBJECT,
            Info::Dacl | Info::ProtectedDacl,
            None,
            None,
            broad.dacl(),
            None,
        )
        .unwrap();
        assert!(!private(&file).unwrap());
        protect(&mut file).unwrap();
        assert!(private(&file).unwrap());
        drop(file);
        assert!(trusted(&path));
        std::fs::remove_dir_all(dir).unwrap();
    }
}
