//! One browser and the page in it: calling the page, and photographing and printing what it shows.

use std::sync::Arc;
use std::time::Duration;

use chromiumoxide::browser::Browser;
use chromiumoxide::cdp::browser_protocol::emulation::{
    ClearDeviceMetricsOverrideParams, SetDeviceMetricsOverrideParams,
};
use chromiumoxide::cdp::browser_protocol::fetch::{
    EnableParams, EventRequestPaused, RequestPattern, RequestStage,
};
use chromiumoxide::cdp::browser_protocol::page::{CaptureScreenshotFormat, PrintToPdfParams};
use chromiumoxide::cdp::js_protocol::runtime::EvaluateParams;
use chromiumoxide::error::CdpError;
use chromiumoxide::page::{Page, ScreenshotParams};
use futures::StreamExt;
use serde_json::Value;
use tokio::task::JoinHandle;
use tokio::time::timeout;

use crate::error::{Error, Result, cdp_message, first_line};
use crate::launch::{Config, start};
use crate::profile::Slot;
use crate::route::START;
use crate::serve::{Shared, serve};

pub struct Session {
    browser: Browser,
    page: Page,
    tasks: Vec<JoinHandle<()>>,
    shared: Arc<Shared>,
    timeout: Duration,
    /// The text of the deck the page has open.
    loaded: Option<Arc<str>>,
    /// The bibliography the page was last given (`Some(None)`: told it has none).
    references: Option<Option<Arc<str>>>,
    _slot: Slot,
}

/// Opens the page in the browser, with every request it makes answered by this program, and waits until it is ready for a deck.
async fn open_page(
    browser: &Browser,
    config: &Config,
    shared: &Arc<Shared>,
) -> Result<(Page, JoinHandle<()>)> {
    let page = browser.new_page("about:blank").await?;
    let pattern = RequestPattern {
        url_pattern: Some("*".to_owned()),
        resource_type: None,
        request_stage: Some(RequestStage::Request),
    };
    page.execute(EnableParams::builder().pattern(pattern).build())
        .await?;
    let paused = page.event_listener::<EventRequestPaused>().await?;
    let serving = tokio::spawn(serve(
        page.clone(),
        paused,
        Arc::clone(shared),
        config.page.clone(),
    ));
    let started = async {
        page.goto(START).await?;
        // The page settles once its engine is loaded; if it cannot start it says why.
        evaluate(&page, config.timeout, "window.__render.ready").await
    }
    .await;
    match started {
        Ok(_) => Ok((page, serving)),
        Err(e) => {
            serving.abort();
            Err(match e {
                Error::Browser(m) => Error::Launch(format!("the render page did not start: {m}")),
                other => other,
            })
        }
    }
}

/// Shuts a browser down, politely and then not.
async fn shut(browser: &mut Browser) {
    let polite = async {
        let _ = browser.close().await;
        let _ = browser.wait().await;
    };
    if timeout(Duration::from_secs(3), polite).await.is_err() {
        let _ = browser.kill().await;
    }
}

/// Evaluates an expression in the page and waits for its promise; the value it comes to, or `None` for nothing.
async fn evaluate(page: &Page, limit: Duration, expression: &str) -> Result<Option<Value>> {
    let params = EvaluateParams::builder()
        .expression(expression)
        .await_promise(true)
        .return_by_value(true)
        .build()
        .map_err(Error::Browser)?;
    let done = timeout(limit, page.evaluate_expression(params))
        .await
        .map_err(|_| {
            Error::Browser(format!(
                "the page did not answer within {} seconds",
                limit.as_secs()
            ))
        })?;
    match done {
        Ok(result) => Ok(result.value().cloned()),
        Err(CdpError::JavascriptException(details)) => {
            let text = details
                .exception
                .as_ref()
                .and_then(|o| o.description.clone())
                .unwrap_or_else(|| details.text.clone());
            // A sentence the page wrote for the person (`Error: There is no slide 9 ...`) is theirs; anything else is a fault.
            if text.starts_with("Error: ") {
                Err(Error::Request(first_line(&text)))
            } else {
                Err(Error::Browser(format!(
                    "the render page failed: {}",
                    first_line(&text)
                )))
            }
        }
        Err(e) => Err(Error::Browser(cdp_message(&e))),
    }
}

impl Session {
    /// Starts a browser, gives it the page and waits until the page is ready for a deck.
    pub async fn launch(config: &Config, shared: Arc<Shared>) -> Result<Session> {
        let (mut browser, mut handler, slot) = start(config).await?;
        let pump = tokio::spawn(async move {
            while let Some(step) = handler.next().await {
                if step.is_err() {
                    break;
                }
            }
        });
        match open_page(&browser, config, &shared).await {
            Ok((page, serving)) => Ok(Session {
                browser,
                page,
                tasks: vec![pump, serving],
                shared,
                timeout: config.timeout,
                loaded: None,
                references: None,
                _slot: slot,
            }),
            Err(e) => {
                shut(&mut browser).await;
                pump.abort();
                Err(e)
            }
        }
    }

    /// Whether the browser has gone.
    pub fn is_dead(&mut self) -> bool {
        !matches!(self.browser.try_wait(), Ok(None))
    }

    /// Evaluates an expression in the page and waits for its promise; the value it comes to, or `None` for nothing.
    pub async fn eval(&self, expression: &str) -> Result<Option<Value>> {
        evaluate(&self.page, self.timeout, expression).await
    }

    /// Calls `window.__render.<method>(args...)` and reads what it comes to as `T`.
    pub async fn call<T: serde::de::DeserializeOwned>(
        &self,
        method: &str,
        args: &[Value],
    ) -> Result<T> {
        let list: Vec<String> = args.iter().map(Value::to_string).collect();
        let value = self
            .eval(&format!("window.__render.{method}({})", list.join(",")))
            .await?
            .unwrap_or(Value::Null);
        serde_json::from_value(value).map_err(|e| {
            Error::Browser(format!(
                "the render page answered {method} in a way that cannot be read: {e}"
            ))
        })
    }

    /// Opens the deck in the page, unless it already has exactly this one open, and gives the page the bibliography
    /// the host has now, unless it already has exactly that.
    pub async fn load(&mut self, text: &Arc<str>) -> Result<()> {
        let references = self.shared.references();
        let bibliography = || {
            references
                .as_ref()
                .map_or(Value::Null, |r| Value::String(r.to_string()))
        };
        if self.loaded.as_ref().is_some_and(|open| **open == **text) {
            if self.references.as_ref() != Some(&references) {
                let _: Value = self.call("references", &[bibliography()]).await?;
                self.references = Some(references.clone());
            }
            return Ok(());
        }
        self.loaded = None;
        let _: Value = self
            .call("load", &[Value::String(text.to_string()), bibliography()])
            .await?;
        self.loaded = Some(Arc::clone(text));
        self.references = Some(references.clone());
        Ok(())
    }

    /// What has been noted about the pictures since the last render.
    pub fn take_notes(&self) -> Vec<String> {
        self.shared.take_notes()
    }

    /// A picture of what the page shows, `width` x `height` units drawn at `scale` pixels to the unit.
    pub async fn photograph(&self, width: u32, height: u32, scale: f64) -> Result<Vec<u8>> {
        let work = async {
            self.page
                .execute(SetDeviceMetricsOverrideParams::new(
                    i64::from(width),
                    i64::from(height),
                    scale,
                    false,
                ))
                .await?;
            self.page
                .screenshot(
                    ScreenshotParams::builder()
                        .format(CaptureScreenshotFormat::Png)
                        .build(),
                )
                .await
        };
        timeout(self.timeout, work)
            .await
            .map_err(|_| {
                Error::Browser("the browser took too long to take the picture".to_owned())
            })?
            .map_err(Error::from)
    }

    /// The page as a PDF, one page as the page's own print rules lay it out.
    pub async fn print(&self) -> Result<Vec<u8>> {
        let work = async {
            self.page
                .execute(ClearDeviceMetricsOverrideParams::default())
                .await?;
            let params = PrintToPdfParams::builder()
                .print_background(true)
                .prefer_css_page_size(true)
                .build();
            self.page.pdf(params).await
        };
        timeout(self.timeout, work)
            .await
            .map_err(|_| Error::Browser("the browser took too long to print".to_owned()))?
            .map_err(Error::from)
    }

    /// Shuts the browser down, politely and then not.
    pub async fn close(mut self) {
        shut(&mut self.browser).await;
        for task in &self.tasks {
            task.abort();
        }
    }
}
