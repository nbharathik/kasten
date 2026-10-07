//! What the page is answered with. The browser asks for everything it loads by an address, and every request is
//! answered here (see `route`) from the page's own files and the deck's pictures, so it never reaches a network.

use std::sync::{Arc, Mutex};

use chromiumoxide::cdp::browser_protocol::fetch::{
    EventRequestPaused, FailRequestParams, FulfillRequestParams, HeaderEntry,
};
use chromiumoxide::cdp::browser_protocol::network::ErrorReason;
use chromiumoxide::page::Page;
use chromiumoxide::types::Binary;
use futures::StreamExt;

use crate::bundle;
use crate::media::Media;
use crate::route::{self, Answer};

/// What every part of a render host shares: where the pictures come from and what a person should be told.
pub struct Shared {
    media: Mutex<Arc<dyn Media>>,
    /// The bibliography (BibTeX text) citations are written from; none draws them as their keys.
    references: Mutex<Option<Arc<str>>>,
    notes: Mutex<Vec<String>>,
}

impl Shared {
    pub fn new(media: Arc<dyn Media>, references: Option<Arc<str>>) -> Shared {
        Shared {
            media: Mutex::new(media),
            references: Mutex::new(references),
            notes: Mutex::new(Vec::new()),
        }
    }

    pub fn set_references(&self, references: Option<Arc<str>>) {
        *self
            .references
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner) = references;
    }

    pub fn references(&self) -> Option<Arc<str>> {
        self.references
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner)
            .clone()
    }

    pub fn set_media(&self, media: Arc<dyn Media>) {
        *self
            .media
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner) = media;
    }

    fn media(&self) -> Arc<dyn Media> {
        Arc::clone(
            &self
                .media
                .lock()
                .unwrap_or_else(std::sync::PoisonError::into_inner),
        )
    }

    fn add_notes(&self, notes: Vec<String>) {
        let mut all = self
            .notes
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner);
        for note in notes {
            if !all.contains(&note) {
                all.push(note);
            }
        }
    }

    /// What has been noted since the last time, and forgets it.
    pub fn take_notes(&self) -> Vec<String> {
        std::mem::take(
            &mut *self
                .notes
                .lock()
                .unwrap_or_else(std::sync::PoisonError::into_inner),
        )
    }
}

/// Answers what the browser asks of the page's address, from the page and the deck's pictures.
pub async fn serve(
    page: Page,
    mut paused: chromiumoxide::listeners::EventStream<EventRequestPaused>,
    shared: Arc<Shared>,
    site: bundle::Page,
) {
    while let Some(event) = paused.next().await {
        let (page, shared, site) = (page.clone(), Arc::clone(&shared), site.clone());
        tokio::spawn(async move {
            let url = event.request.url.clone();
            let media = shared.media();
            let answered = tokio::task::spawn_blocking(move || {
                let mut notes = Vec::new();
                let answer = route::respond(&url, &site, media.as_ref(), &mut notes);
                (answer, notes)
            })
            .await;
            let Ok((answer, notes)) = answered else {
                return;
            };
            shared.add_notes(notes);
            // When the page is gone the browser refuses these, and there is nothing left to answer.
            let _ = match answer {
                Answer::Send(response) => {
                    let headers = response
                        .headers
                        .iter()
                        .map(|(name, value)| HeaderEntry::new(*name, value.clone()))
                        .collect();
                    let mut fulfil = FulfillRequestParams::new(
                        event.request_id.clone(),
                        i64::from(response.status),
                    );
                    fulfil.response_headers = Some(headers);
                    if !response.body.is_empty() {
                        fulfil.body = Some(Binary::from(slides_core::agent::base64_encode(
                            &response.body,
                        )));
                    }
                    page.execute(fulfil).await.map(|_| ())
                }
                Answer::Block => page
                    .execute(FailRequestParams::new(
                        event.request_id.clone(),
                        ErrorReason::BlockedByClient,
                    ))
                    .await
                    .map(|_| ()),
            };
        });
    }
}
