//! Benchmarks against Kasten's performance budgets, on a generated vault
//! of 10,000 notes and 50 boards. Run with `cargo bench -p kasten-core`.

use std::path::PathBuf;
use std::sync::OnceLock;

use criterion::{Criterion, criterion_group, criterion_main};
use kasten_core::agent::{AgentOp, Session};
use kasten_core::history::Actor;
use kasten_core::index::Index;
use kasten_core::vectors::Embedded;
use kasten_core::{Instant, Kasten, Outcome, frontmatter};

const NOTES: usize = 10_000;

fn big_vault() -> &'static PathBuf {
    static DIR: OnceLock<PathBuf> = OnceLock::new();
    DIR.get_or_init(|| {
        let dir = std::env::temp_dir().join(format!("kasten-bench-{NOTES}"));
        if !dir.join(".kasten/cache/index.sqlite").exists() {
            let _ = std::fs::remove_dir_all(&dir);
            kasten_core::generate::generate_vault(&dir, NOTES, 50, 42).unwrap();
            Kasten::open(&dir).unwrap();
        }
        // Earlier runs' saves are merged, as the app's clock does between edits.
        let mut index = Index::open(&dir.join(".kasten/cache/index.sqlite")).unwrap();
        while index.tidy().unwrap() {}
        dir
    })
}

fn budgets(c: &mut Criterion) {
    let dir = big_vault();
    let k = Kasten::open(dir).unwrap();

    // "Cold start to usable sidebar: under 1 s": open the vault and list it.
    c.bench_function("open vault and list 10k notes", |b| {
        b.iter(|| {
            let k = Kasten::open(dir).unwrap();
            k.list().unwrap().len()
        })
    });
    // "Open a note: under 50 ms".
    c.bench_function("read a note", |b| {
        b.iter(|| k.read("projects/p3/pages/n3.md").unwrap())
    });
    // "Full-text search: under 50 ms".
    c.bench_function("search two words", |b| {
        b.iter(|| k.search("layout accuracy", 20).unwrap())
    });
    c.bench_function("search with filters", |b| {
        b.iter(|| k.search("tag:paper project:p2 model", 20).unwrap())
    });
    // "Command palette results per keystroke: under 30 ms".
    c.bench_function("search a prefix", |b| {
        b.iter(|| k.search("thum", 12).unwrap())
    });
    c.bench_function("backlinks", |b| {
        let title = k.read("library/n1.md").unwrap().meta.title;
        b.iter(|| k.backlinks(&title).unwrap())
    });
    // The right panel's related notes load with the note: well under 50 ms.
    c.bench_function("related notes", |b| {
        b.iter(|| k.related("projects/p3/pages/n3.md", 8).unwrap())
    });
    // Search by meaning: 10,000 vectors of 1,536 numbers (OpenAI's small
    // model), made up here; the model's own call is the app's.
    let dims = 1536;
    let made_up = |seed: u64| -> Vec<f32> {
        let mut x = seed.wrapping_mul(0x9E37_79B9_7F4A_7C15) | 1;
        (0..dims)
            .map(|_| {
                x ^= x << 13;
                x ^= x >> 7;
                x ^= x << 17;
                (x % 2000) as f32 / 1000.0 - 1.0
            })
            .collect()
    };
    let mut seed = 0;
    loop {
        let todo = k.to_embed("bench-model", 500).unwrap();
        if todo.is_empty() {
            break;
        }
        let made: Vec<Embedded> = todo
            .into_iter()
            .map(|t| {
                seed += 1;
                Embedded {
                    path: t.path,
                    stamp: t.stamp,
                    hash: t.hash,
                    vector: made_up(seed),
                }
            })
            .collect();
        k.keep_vectors("bench-model", &made).unwrap();
    }
    let question = made_up(7);
    c.bench_function("search by meaning, 10k notes", |b| {
        b.iter(|| k.nearest("bench-model", &question, 20).unwrap())
    });
    // "Autosave: write under 20 ms". The vault is kept between runs, so the
    // note starts without earlier runs' lines and each save changes its last
    // line: the note stays the size of a real one instead of growing.
    let path = "projects/p4/pages/n4.md";
    let first = k.read(path).unwrap();
    let base: String = frontmatter::split(&first.text)
        .body
        .lines()
        .filter(|line| !line.starts_with("Typed "))
        .map(|line| format!("{line}\n"))
        .collect();
    let mut n = 0u64;
    c.bench_function("save a body (typing, batched)", |b| {
        b.iter(|| {
            n += 1;
            let note = k.read(path).unwrap();
            let body = format!("{base}Typed {n}.\n");
            k.save_body(&Actor::Human, path, &body, &note.hash, Instant::now())
                .unwrap()
        })
    });
}

fn rebuild(c: &mut Criterion) {
    let dir = big_vault();
    let k = Kasten::open(dir).unwrap();
    let mut group = c.benchmark_group("slow");
    group.sample_size(10);
    // "Full index rebuild: under 10 s".
    group.bench_function("rebuild the index of 10k notes", |b| {
        b.iter(|| k.reindex().unwrap())
    });
    group.finish();
}

/// A vault of 500 notes with history, and a note an agent wrote with 50
/// commits of history, every other one a person's edit; then `later`
/// commits to other notes, so a walk back from HEAD has that far to go.
fn marks_vault(name: &str, later: usize) -> (PathBuf, String) {
    let dir = std::env::temp_dir().join(format!("kasten-bench-{name}"));
    let _ = std::fs::remove_dir_all(&dir);
    kasten_core::generate::generate_vault(&dir, 500, 2, 7).unwrap();
    let k = Kasten::open(&dir).unwrap();
    k.start_history().unwrap();
    let s = Session::start("claude-code", Instant::now());
    let run = |op: AgentOp| match k.agent_run(&s, &op, Instant::now()).unwrap() {
        Outcome::Done { result } => result,
        Outcome::PendingReview { reason, .. } => panic!("{reason}"),
    };
    let made = run(AgentOp::CreateNote {
        note_type: "page".into(),
        title: "Agent notes".into(),
        body: "An agent's first paragraph.\n".into(),
        project: None,
        tags: vec![],
        props: Default::default(),
        parent: None,
        template: None,
    });
    let path = made["path"].as_str().unwrap().to_owned();
    let type_into = |path: &str, line: String| {
        let note = k.read(path).unwrap();
        let body = format!("{}\n{line}\n", frontmatter::split(&note.text).body);
        k.save_body(&Actor::Human, path, &body, &note.hash, Instant::now())
            .unwrap();
        k.commit_edits().unwrap();
    };
    for n in 1..50 {
        if n % 2 == 1 {
            run(AgentOp::Append {
                path: path.clone(),
                markdown: format!("Agent paragraph {n}, with a few more words to it."),
                heading: None,
            });
        } else {
            type_into(&path, format!("My paragraph {n}."));
        }
    }
    for n in 0..later {
        let other = format!("library/n{}.md", 1 + 10 * (n % 50));
        type_into(&other, format!("Typed {n}."));
    }
    (dir, path)
}

fn marks(c: &mut Criterion) {
    let (dir, path) = marks_vault("marks", 0);
    let k = Kasten::open(&dir).unwrap();
    assert_eq!(k.agent_marks(&path).unwrap().len(), 26);
    // The margin marks of an agent's writing,
    // blamed from 50 commits, then from the index's cache.
    c.bench_function("agent marks, 50 commits, cold", |b| {
        b.iter(|| {
            k.forget_agent_marks().unwrap();
            k.agent_marks(&path).unwrap()
        })
    });
    c.bench_function("agent marks, 50 commits, cached", |b| {
        b.iter(|| k.agent_marks(&path).unwrap())
    });
    let notes: Vec<String> = k.list().unwrap().into_iter().map(|n| n.path).collect();
    c.bench_function("agent marked, 500 notes, cached", |b| {
        b.iter(|| k.agent_marked(&notes).unwrap())
    });
}

fn long_history(c: &mut Criterion) {
    let (dir, path) = marks_vault("marks-long", 2000);
    let k = Kasten::open(&dir).unwrap();
    let notes: Vec<String> = k.list().unwrap().into_iter().map(|n| n.path).collect();
    let mut group = c.benchmark_group("slow");
    group.sample_size(10);
    // The first read of an old note walks back through every later commit.
    group.bench_function("agent marks, 2,050 commits back, cold", |b| {
        b.iter(|| {
            k.forget_agent_marks().unwrap();
            k.agent_marks(&path).unwrap()
        })
    });
    group.bench_function("agent marked, 500 notes, 2,050 commits, cold", |b| {
        b.iter(|| {
            k.forget_agent_marks().unwrap();
            k.agent_marked(&notes).unwrap()
        })
    });
    group.finish();
}

criterion_group!(benches, budgets, rebuild, marks, long_history);
criterion_main!(benches);
