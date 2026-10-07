//! Name lookups for web pages that find only the public internet.
//! A page elsewhere could otherwise lead a fetch to this computer or the
//! local network under a public-looking name, one whose address is
//! 127.0.0.1 say, where no browser protection sees it. This resolver is
//! used only on the direct client for public pages; proxies are disabled.

use std::net::{SocketAddr, ToSocketAddrs};

use reqwest::dns::{Addrs, Name, Resolve, Resolving};

use super::address::local_ip;

pub(crate) struct PublicOnly;

impl PublicOnly {
    /// Looks names up as the system does and rejects private addresses.
    pub(crate) fn new() -> PublicOnly {
        PublicOnly
    }
}

impl Resolve for PublicOnly {
    fn resolve(&self, name: Name) -> Resolving {
        let host = name.as_str().to_owned();
        Box::pin(async move {
            let lookup = host.clone();
            let found: Vec<SocketAddr> = tokio::task::spawn_blocking(move || {
                (lookup.as_str(), 0)
                    .to_socket_addrs()
                    .map(Iterator::collect)
            })
            .await??;
            let kept: Vec<SocketAddr> = found
                .into_iter()
                .filter(|address| !local_ip(address.ip()))
                .collect();
            if kept.is_empty() {
                return Err(format!("{host} leads to this computer or the local network").into());
            }
            Ok(Box::new(kept.into_iter()) as Addrs)
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn look_up(resolver: &PublicOnly, host: &str) -> Result<Vec<SocketAddr>, String> {
        let name: Name = host.parse().unwrap();
        tauri::async_runtime::block_on(resolver.resolve(name))
            .map(Iterator::collect)
            .map_err(|e| e.to_string())
    }

    #[test]
    fn finds_no_address_on_this_computer() {
        let err = look_up(&PublicOnly::new(), "localhost").unwrap_err();
        assert!(err.contains("this computer"), "{err}");
    }
}
