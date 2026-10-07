//! Providers in the vault's config with their keys in a key store (the
//! in-memory one: tests never touch the keychain), and saving a chat.

use std::fs;

use kasten_core::Kasten;

use super::vault;
use crate::chat::address;
use crate::chat::commands::save_transcript;
use crate::chat::providers::{self, ProviderInput};
use crate::chat::threads::day;
use crate::secrets::{KeyStore, MemoryKeys};

/// The key the chat would send for the provider called `name`.
fn key_of(kasten: &Kasten, keys: &MemoryKeys, name: &str) -> Option<String> {
    address::key_for(keys, &providers::find(kasten, name).unwrap()).unwrap()
}

fn input(name: &str, kind: &str, base_url: &str, model: &str) -> ProviderInput {
    ProviderInput {
        name: name.to_owned(),
        kind: kind.to_owned(),
        base_url: base_url.to_owned(),
        model: model.to_owned(),
    }
}

#[test]
fn providers_live_in_the_config_and_keys_in_the_store() {
    let v = vault();
    let k = &v.kasten;
    let keys = MemoryKeys::default();
    assert!(providers::list(k, &keys).is_empty());

    let claude = input(" Claude ", "anthropic", "", "model-large");
    let listed = providers::save(k, &keys, claude, Some("sk-ant-secret".into())).unwrap();
    assert_eq!(listed.len(), 1);
    assert_eq!(listed[0].name, "Claude");
    assert!(listed[0].has_key);
    assert_eq!(key_of(k, &keys, "Claude").as_deref(), Some("sk-ant-secret"));
    let local = input(
        "Local",
        "openai",
        "http://llm-server:8000/v1/",
        "local-model",
    );
    let listed = providers::save(k, &keys, local, None).unwrap();
    assert_eq!(listed[1].base_url, "http://llm-server:8000/v1");
    assert!(!listed[1].has_key, "a local server may have no key");

    // The key never enters the vault, and the config survives a reopen.
    let config = fs::read_to_string(v.dir.join(".kasten/config.yaml")).unwrap();
    assert!(
        config.contains("local-model") && !config.contains("sk-ant-secret"),
        "{config}"
    );
    let reopened = kasten_core::Kasten::open(&v.dir).unwrap();
    assert_eq!(providers::list(&reopened, &keys), listed);

    // Saving again: no key leaves it, an empty key deletes it; the place stays.
    let renamed_model = input("Claude", "anthropic", "", "model-small");
    let listed = providers::save(k, &keys, renamed_model.clone(), None).unwrap();
    assert_eq!(
        (listed[0].model.as_str(), listed[0].has_key),
        ("model-small", true)
    );
    let listed = providers::save(k, &keys, renamed_model, Some(" ".into())).unwrap();
    assert!(!listed[0].has_key);
    assert_eq!(key_of(k, &keys, "Claude"), None);

    // Removing forgets the provider and its key.
    keys.set("Local", "sk-local").unwrap();
    let listed = providers::remove(k, &keys, "Local").unwrap();
    assert_eq!(listed.len(), 1);
    assert_eq!(keys.get("Local").unwrap(), None);
    assert!(providers::find(k, "Local").is_err());
    assert_eq!(providers::find(k, "Claude").unwrap().model, "model-small");
}

#[test]
fn providers_are_checked_before_anything_is_saved() {
    let v = vault();
    let keys = MemoryKeys::default();
    let bad = [
        input("", "anthropic", "", "m"),
        input("Gemini", "gemini", "", "m"),
        input("Local", "openai", "", "m"),
        input("Local", "openai", "llm-server:8000/v1", "m"),
        input(&"x".repeat(61), "anthropic", "", "m"),
    ];
    for provider in bad {
        let name = provider.name.clone();
        assert!(
            providers::save(&v.kasten, &keys, provider, Some("k".into())).is_err(),
            "{name}"
        );
    }
    assert!(v.kasten.config().ai.providers.is_empty());
    assert_eq!(
        keys.get("Gemini").unwrap(),
        None,
        "no key without its provider"
    );
}

#[test]
fn a_key_goes_only_to_the_address_it_was_saved_for() {
    let v = vault();
    let keys = MemoryKeys::default();
    let claude = input("Claude", "anthropic", "", "model-large");
    providers::save(&v.kasten, &keys, claude, Some("sk-ant-secret".into())).unwrap();
    assert_eq!(
        key_of(&v.kasten, &keys, "Claude").as_deref(),
        Some("sk-ant-secret")
    );

    // A vault's config, written by hand as a shared vault's would be, names
    // another server for the same provider: no key goes there.
    let mut config = v.kasten.config();
    config.ai.providers[0].base_url = "https://collector.example".into();
    config.save(&v.dir).unwrap();
    let moved = Kasten::open(&v.dir).unwrap();
    assert_eq!(key_of(&moved, &keys, "Claude"), None);
    assert!(!providers::list(&moved, &keys)[0].has_key);
}

#[test]
fn keys_travel_over_https_or_stay_on_this_computer() {
    let v = vault();
    let keys = MemoryKeys::default();
    let lan = input("Lan", "openai", "http://llm-server:8000/v1", "m");
    assert!(providers::save(&v.kasten, &keys, lan, Some("sk-lan".into())).is_err());
    let local = input("Local", "openai", "http://127.0.0.1:8000/v1", "m");
    assert!(providers::save(&v.kasten, &keys, local, Some("sk-local".into())).is_ok());
    let hosted = input("Hosted", "openai", "https://llm.example/v1", "m");
    assert!(providers::save(&v.kasten, &keys, hosted, Some("sk-hosted".into())).is_ok());
    assert_eq!(
        key_of(&v.kasten, &keys, "Local").as_deref(),
        Some("sk-local")
    );
    assert_eq!(
        key_of(&v.kasten, &keys, "Hosted").as_deref(),
        Some("sk-hosted")
    );
}

#[test]
fn a_key_kept_by_name_alone_is_used_at_the_official_address_only() {
    let v = vault();
    let keys = MemoryKeys::default();
    keys.set("Claude", "sk-earlier").unwrap();
    keys.set("Hosted", "sk-earlier-hosted").unwrap();
    let claude = input("Claude", "anthropic", "", "m");
    providers::save(&v.kasten, &keys, claude, None).unwrap();
    let hosted = input("Hosted", "openai", "https://llm.example/v1", "m");
    let listed = providers::save(&v.kasten, &keys, hosted, None).unwrap();
    assert!(listed[0].has_key, "the official address keeps its key");
    assert!(!listed[1].has_key, "another address asks for its key again");

    // Saving a key moves it to its address, in place of the one by name.
    let claude = input("Claude", "anthropic", "", "m");
    providers::save(&v.kasten, &keys, claude, Some("sk-new".into())).unwrap();
    assert_eq!(keys.get("Claude").unwrap(), None);
    assert_eq!(
        key_of(&v.kasten, &keys, "Claude").as_deref(),
        Some("sk-new")
    );
}

#[test]
fn save_chat_writes_a_chat_note_as_the_person() {
    let v = vault();
    let transcript = "**You:** Where next?\n\n**Kasten:** The coast.\n";
    let note = save_transcript(&v.kasten, "Where next", transcript, Some("2026-09-24")).unwrap();
    assert_eq!(note.meta.path, "chats/2026-09-24-where-next.md");
    assert_eq!(note.meta.kind, "chat");
    assert!(note.text.ends_with(transcript));
    let commit = &v.kasten.log(Some(&note.meta.path), 1).unwrap()[0];
    assert_eq!(commit.summary, "chat: Where next");
    assert!(!commit.agent);
    // A day that is not one falls back to today.
    let other = save_transcript(&v.kasten, "Later", "x\n", Some("soon")).unwrap();
    assert!(
        other
            .meta
            .path
            .starts_with(&format!("chats/{}-", day(None)))
    );
}

#[test]
fn notes_go_to_an_address_from_the_vault_only_once_confirmed_here() {
    use std::sync::Arc;

    use crate::chat::commands::ChatState;

    let v = vault();
    let k = &v.kasten;
    let keys = MemoryKeys::default();
    // A vault someone shared names a server of its own, as "Claude".
    providers::save(
        k,
        &keys,
        input("Claude", "openai", "https://m.example/v1", "any"),
        None,
    )
    .unwrap();
    providers::save(
        k,
        &keys,
        input("Local", "openai", "http://localhost:11434/v1", "m"),
        None,
    )
    .unwrap();
    let settings = k.root().with_extension("settings");
    let folder = k.root().display().to_string();
    let state = ChatState::new(Arc::new(MemoryKeys::default()));
    state.know_vault(Some(settings.clone()), folder.clone());

    let shared = providers::find(k, "Claude").unwrap();
    let err = state.check_origin(&shared).unwrap_err();
    assert!(
        err.contains("https://m.example") && err.contains("Confirm"),
        "{err}"
    );
    let local = providers::find(k, "Local").unwrap();
    assert!(
        state.check_origin(&local).is_ok(),
        "this computer needs no asking"
    );

    state.confirm_origin(&shared).unwrap();
    assert!(state.check_origin(&shared).is_ok());
    // Kept for the next time the vault opens, and only for this vault.
    let reopened = ChatState::new(Arc::new(MemoryKeys::default()));
    reopened.know_vault(Some(settings.clone()), folder);
    assert!(reopened.check_origin(&shared).is_ok());
    let other = ChatState::new(Arc::new(MemoryKeys::default()));
    other.know_vault(Some(settings.clone()), "/another/vault".into());
    assert!(other.check_origin(&shared).is_err());
    let _ = fs::remove_dir_all(&settings);
}
