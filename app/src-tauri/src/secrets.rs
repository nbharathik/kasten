//! Secrets, kept in the OS keychain and never in the vault, a log or the
//! window: Keychain on macOS, Credential Manager on Windows and the Secret
//! Service (GNOME Keyring, KWallet) on Linux, under the service `kasten`.
//!
//! - An AI provider's key is for one provider at one address: the account
//!   is `<name> @ <origin>` (chat/address.rs).
//! - A git host's token is for one server: the account is `git @ <origin>`.
//!
//! Tests use the in-memory store, so they never touch a real keychain.

use kasten_core::history::GitToken;

pub const SERVICE: &str = "kasten";

/// The keychain account for a git server's token.
fn git_account(origin: &str) -> String {
    format!("git @ {origin}")
}

/// The token saved for a git server (an `https_origin`), if any.
pub fn git_token(keys: &dyn KeyStore, origin: &str) -> Result<Option<GitToken>, String> {
    let Some(saved) = keys.get(&git_account(origin))? else {
        return Ok(None);
    };
    // Saved as the user name, a line end, then the token.
    let (username, secret) = saved.split_once('\n').unwrap_or(("x-access-token", &saved));
    Ok(Some(GitToken {
        origin: origin.to_owned(),
        username: username.to_owned(),
        secret: secret.to_owned(),
    }))
}

pub fn save_git_token(keys: &dyn KeyStore, token: &GitToken) -> Result<(), String> {
    keys.set(
        &git_account(&token.origin),
        &format!("{}\n{}", token.username, token.secret),
    )
}

pub fn forget_git_token(keys: &dyn KeyStore, origin: &str) -> Result<(), String> {
    keys.delete(&git_account(origin))
}

/// Where provider keys live.
pub trait KeyStore: Send + Sync {
    /// The key for `provider`, if one is stored.
    fn get(&self, provider: &str) -> Result<Option<String>, String>;
    fn set(&self, provider: &str, key: &str) -> Result<(), String>;
    /// Forgets the key; forgetting one that is not there is fine.
    fn delete(&self, provider: &str) -> Result<(), String>;
}

/// The OS keychain.
pub struct Keychain;

fn entry(provider: &str) -> Result<keyring::Entry, String> {
    keyring::Entry::new(SERVICE, provider).map_err(|e| unavailable(&e))
}

fn unavailable(err: &keyring::Error) -> String {
    format!("The system keychain is not available: {err}")
}

impl KeyStore for Keychain {
    fn get(&self, provider: &str) -> Result<Option<String>, String> {
        match entry(provider)?.get_password() {
            Ok(key) => Ok(Some(key)),
            Err(keyring::Error::NoEntry) => Ok(None),
            Err(err) => Err(unavailable(&err)),
        }
    }

    fn set(&self, provider: &str, key: &str) -> Result<(), String> {
        entry(provider)?
            .set_password(key)
            .map_err(|e| unavailable(&e))
    }

    fn delete(&self, provider: &str) -> Result<(), String> {
        match entry(provider)?.delete_credential() {
            Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
            Err(err) => Err(unavailable(&err)),
        }
    }
}

#[cfg(test)]
pub use memory::MemoryKeys;

#[cfg(test)]
mod memory {
    use std::collections::HashMap;
    use std::sync::{Mutex, MutexGuard};

    use super::KeyStore;

    /// Keys in memory, for tests.
    #[derive(Default)]
    pub struct MemoryKeys(Mutex<HashMap<String, String>>);

    impl MemoryKeys {
        fn keys(&self) -> MutexGuard<'_, HashMap<String, String>> {
            self.0.lock().unwrap_or_else(|p| p.into_inner())
        }
    }

    impl KeyStore for MemoryKeys {
        fn get(&self, provider: &str) -> Result<Option<String>, String> {
            Ok(self.keys().get(provider).cloned())
        }

        fn set(&self, provider: &str, key: &str) -> Result<(), String> {
            self.keys().insert(provider.to_owned(), key.to_owned());
            Ok(())
        }

        fn delete(&self, provider: &str) -> Result<(), String> {
            self.keys().remove(provider);
            Ok(())
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_git_token_is_kept_for_its_server_with_its_user_name() {
        let keys = MemoryKeys::default();
        let token = GitToken {
            origin: "https://git.example.com".into(),
            username: "me".into(),
            secret: "s3cret".into(),
        };
        save_git_token(&keys, &token).unwrap();
        assert_eq!(
            git_token(&keys, "https://git.example.com").unwrap(),
            Some(token)
        );
        assert_eq!(git_token(&keys, "https://github.com").unwrap(), None);
        forget_git_token(&keys, "https://git.example.com").unwrap();
        assert_eq!(git_token(&keys, "https://git.example.com").unwrap(), None);
    }
}
