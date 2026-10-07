//! The commands of the `slides` binary.

use std::io::Read;
use std::path::Path;

use serde_json::Value;
use slides_core::{Engine, ops, outline};

use crate::args::Args;
use crate::deckfile;

pub enum Failure {
    /// The words on the command line are wrong: exit 2.
    Usage(String),
    /// The command could not be done: exit 1.
    Error(String),
}

impl From<String> for Failure {
    fn from(message: String) -> Failure {
        Failure::Error(message)
    }
}

impl From<slides_core::Error> for Failure {
    fn from(e: slides_core::Error) -> Failure {
        Failure::Error(e.to_string())
    }
}

fn word<'a>(args: &'a Args, at: usize, what: &str) -> Result<&'a str, Failure> {
    args.positional
        .get(at)
        .map(String::as_str)
        .ok_or_else(|| Failure::Usage(format!("missing {what}")))
}

pub fn run(args: &Args) -> Result<(), Failure> {
    match word(args, 0, "a command")? {
        "new" => new(args),
        "info" => info(args),
        "outline" => outline_command(args),
        "ops" => operations(args),
        "op" => apply(args),
        "validate" => validate(args),
        "fmt" => format(args),
        "export" => crate::export::run(args),
        "import" => crate::import::run(args),
        "lint" => crate::lint::run(args),
        "render" => crate::drawn::render(args),
        "schema" => schema(),
        "dev" => crate::dev::run(args),
        "mcp" => crate::mcp::run(args),
        other => Err(Failure::Usage(format!("unknown command `{other}`"))),
    }
}

fn new(args: &Args) -> Result<(), Failure> {
    let path = Path::new(word(args, 1, "the deck file to make")?);
    if path.exists() {
        return Err(Failure::Error(format!("{} already exists", path.display())));
    }
    let title = args
        .value("title")
        .map(str::to_owned)
        .or_else(|| path.file_stem().map(|s| s.to_string_lossy().into_owned()))
        .unwrap_or_else(|| "Untitled".to_owned());
    let engine = Engine::create(
        &title,
        args.value("theme").unwrap_or("Light"),
        deckfile::seed(),
    )?;
    deckfile::write(path, engine.deck())?;
    println!("Made {}", path.display());
    Ok(())
}

fn info(args: &Args) -> Result<(), Failure> {
    let deck = deckfile::read(Path::new(word(args, 1, "a deck file")?))?;
    println!(
        "{} ({} theme, {} slides)",
        deck.title,
        deck.theme.name,
        deck.slides.len()
    );
    for (i, slide) in deck.slides.iter().enumerate() {
        let title = slide
            .elements
            .iter()
            .find(|e| e.base().placeholder.as_deref() == Some("title"))
            .and_then(|e| e.text())
            .map(|t| t.plain_text())
            .unwrap_or_default();
        let flags = [
            if slide.hidden { " hidden" } else { "" },
            if slide.backup { " backup" } else { "" },
        ]
        .concat();
        println!(
            "{:>3}  {}  [{}, {} elements{}]  {}",
            i + 1,
            slide.id,
            slide.layout,
            slide.elements.len(),
            flags,
            title
        );
    }
    Ok(())
}

fn outline_command(args: &Args) -> Result<(), Failure> {
    let deck = deckfile::read(Path::new(word(args, 1, "a deck file")?))?;
    print!("{}", outline::outline_of(&deck));
    Ok(())
}

fn operations(args: &Args) -> Result<(), Failure> {
    let specs = ops::specs();
    if let Some(name) = args.positional.get(1) {
        let spec = specs.iter().find(|s| &s.name == name).ok_or_else(|| {
            Failure::Error(format!(
                "there is no operation `{name}`; `slides ops` lists them"
            ))
        })?;
        println!(
            "{}",
            serde_json::to_string_pretty(spec).map_err(|e| e.to_string())?
        );
    } else if args.has("json") {
        println!(
            "{}",
            serde_json::to_string_pretty(&specs).map_err(|e| e.to_string())?
        );
    } else {
        for spec in &specs {
            println!(
                "{:<22} {}",
                spec.name,
                spec.about.split(". ").next().unwrap_or(&spec.about)
            );
        }
    }
    Ok(())
}

fn input(args: &Args) -> Result<Value, Failure> {
    let text = match args.positional.get(3).map(String::as_str) {
        Some("-") => {
            let mut text = String::new();
            std::io::stdin()
                .read_to_string(&mut text)
                .map_err(|e| e.to_string())?;
            text
        }
        Some(json) => json.to_owned(),
        None => "{}".to_owned(),
    };
    serde_json::from_str(&text).map_err(|e| Failure::Error(format!("the input is not JSON: {e}")))
}

fn apply(args: &Args) -> Result<(), Failure> {
    let path = Path::new(word(args, 1, "a deck file")?);
    let name = word(args, 2, "the operation's name")?;
    let mut engine = Engine::new(deckfile::read(path)?, deckfile::seed());
    let applied = engine.apply(name, input(args)?)?;
    if !args.has("dry-run") {
        deckfile::write(path, engine.deck())?;
    }
    println!(
        "{}",
        serde_json::to_string_pretty(&applied.output).map_err(|e| e.to_string())?
    );
    Ok(())
}

fn validate(args: &Args) -> Result<(), Failure> {
    let deck = deckfile::read(Path::new(word(args, 1, "a deck file")?))?;
    println!("ok: {} slides", deck.slides.len());
    Ok(())
}

fn format(args: &Args) -> Result<(), Failure> {
    let path = Path::new(word(args, 1, "a deck file")?);
    let deck = deckfile::read(path)?;
    deckfile::write(path, &deck)?;
    Ok(())
}

fn schema() -> Result<(), Failure> {
    let schema = schemars::schema_for!(slides_core::Deck);
    println!(
        "{}",
        serde_json::to_string_pretty(&schema).map_err(|e| e.to_string())?
    );
    Ok(())
}
