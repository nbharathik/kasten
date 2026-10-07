use super::*;

#[test]
fn an_existing_proxy_cannot_bypass_public_destination_checks() {
    let proxy = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
    proxy.set_nonblocking(true).unwrap();
    let builder = web_builder()
        .proxy(reqwest::Proxy::all(format!("http://{}", proxy.local_addr().unwrap())).unwrap());
    let client = public_builder(builder)
        .timeout(Duration::from_millis(500))
        .build()
        .unwrap();
    assert!(
        tauri::async_runtime::block_on(async {
            client.get("http://example.invalid/").send().await
        })
        .is_err()
    );
    assert_eq!(
        proxy.accept().unwrap_err().kind(),
        std::io::ErrorKind::WouldBlock
    );
}
