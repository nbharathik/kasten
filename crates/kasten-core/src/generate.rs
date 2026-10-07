//! A synthetic vault for benchmarks and performance checks: 10,000 notes
//! and 50 boards in `fixtures/big-vault`. Deterministic for a given seed.

use std::fs;
use std::path::Path;

use crate::error::Result;
use crate::id::ulid_at;

const WORDS: [&str; 48] = [
    "model",
    "layout",
    "edit",
    "accuracy",
    "diff",
    "graph",
    "photo",
    "frame",
    "folder",
    "camera",
    "reading",
    "paper",
    "draft",
    "review",
    "result",
    "method",
    "idea",
    "plan",
    "trip",
    "budget",
    "meeting",
    "project",
    "roadmap",
    "sketch",
    "question",
    "answer",
    "note",
    "chapter",
    "section",
    "figure",
    "table",
    "dataset",
    "experiment",
    "hypothesis",
    "baseline",
    "metric",
    "schema",
    "export",
    "import",
    "pixel",
    "thumbnail",
    "album",
    "cache",
    "index",
    "search",
    "garden",
    "coffee",
    "museum",
];

const SYLLABLES: [&str; 24] = [
    "ka", "ten", "lo", "mir", "sa", "vu", "tre", "po", "den", "fi", "gar", "nu", "shi", "bel",
    "or", "qua", "zen", "ri", "mo", "tas", "ly", "cor", "phe", "da",
];

struct Rng(u64);

impl Rng {
    fn next(&mut self) -> u64 {
        self.0 = self
            .0
            .wrapping_mul(6_364_136_223_846_793_005)
            .wrapping_add(1_442_695_040_888_963_407);
        self.0 >> 33
    }
    fn below(&mut self, n: usize) -> usize {
        (self.next() % n as u64) as usize
    }
    fn word(&mut self) -> &'static str {
        WORDS[self.below(WORDS.len())]
    }
    /// Mostly rarer words, as real notes have: one in ten is a common one.
    fn any_word(&mut self) -> String {
        if self.below(10) == 0 {
            return self.word().to_owned();
        }
        let n = self.below(6000);
        let (a, b, c) = (n % 24, (n / 24) % 24, (n / 576) % 11);
        format!(
            "{}{}{}",
            SYLLABLES[a],
            SYLLABLES[b],
            if c < 10 { SYLLABLES[c] } else { "" }
        )
    }
    fn sentence(&mut self, words: usize) -> String {
        let mut out: Vec<String> = (0..words).map(|_| self.any_word()).collect();
        let first = out[0].clone();
        out[0] = format!("{}{}", first[..1].to_uppercase(), &first[1..]);
        format!("{}.", out.join(" "))
    }
}

/// Writes `notes` notes and `boards` boards under `root`.
pub fn generate_vault(root: &Path, notes: usize, boards: usize, seed: u64) -> Result<()> {
    let mut rng = Rng(seed);
    let projects = 20;
    let mut titles: Vec<String> = Vec::with_capacity(notes);
    let mut paths: Vec<String> = Vec::with_capacity(notes);
    for i in 0..notes {
        let title = format!("{} {} {i}", rng.word(), rng.word());
        let (dir, kind) = match i % 10 {
            0 => ("inbox".to_owned(), "card"),
            1 => ("library".to_owned(), "page"),
            2..=6 => (format!("projects/p{}/pages", i % projects), "page"),
            _ => (format!("projects/p{}/cards", i % projects), "card"),
        };
        paths.push(format!("{dir}/n{i}.md"));
        titles.push(title);
        let _ = kind;
    }
    for p in 0..projects {
        fs::create_dir_all(root.join(format!("projects/p{p}/boards")))?;
        fs::write(
            root.join(format!("projects/p{p}/_project.md")),
            format!("---\ntitle: Project {p}\ntype: project\n---\nProject {p} overview.\n"),
        )?;
    }
    for (i, path) in paths.iter().enumerate() {
        let file = root.join(path);
        fs::create_dir_all(file.parent().unwrap_or(root))?;
        let kind = if path.contains("/cards/") || path.starts_with("inbox/") {
            "card"
        } else {
            "page"
        };
        let tags = ["paper", "idea", "task", "travel", "meeting"];
        let mut text = format!(
            "---\nid: {}\ntitle: {}\ntype: {kind}\ncreated: 2026-0{}-1{}T09:00:00Z\nupdated: 2026-09-2{}T10:00:00Z\ntags: [{}]\n---\n",
            ulid_at(1_780_000_000_000 + i as u64),
            titles[i],
            1 + i % 9,
            i % 10,
            i % 10,
            tags[i % tags.len()]
        );
        let lines = 5 + rng.below(35);
        for line in 0..lines {
            match line % 9 {
                0 => text.push_str(&format!("## {}\n\n", rng.sentence(3))),
                3 => text.push_str(&format!(
                    "- [ ] {} [[{}]]\n",
                    rng.sentence(5),
                    titles[rng.below(notes)]
                )),
                5 => text.push_str(&format!("- {}\n", rng.sentence(6))),
                7 => text.push_str(&format!(
                    "See [[{}]] and **{}**.\n\n",
                    titles[rng.below(notes)],
                    rng.word()
                )),
                _ => text.push_str(&format!("{}\n\n", rng.sentence(12))),
            }
        }
        fs::write(file, text)?;
    }
    for journal in 0..60.min(notes) {
        let day = format!("2026-{:02}-{:02}", 7 + journal / 28, 1 + journal % 28);
        fs::create_dir_all(root.join("journal/2026"))?;
        fs::write(
            root.join(format!("journal/2026/{day}.md")),
            format!(
                "---\ntitle: \"{day}\"\ntype: journal\n---\n{}\n",
                rng.sentence(20)
            ),
        )?;
    }
    for b in 0..boards {
        let count = 10 + rng.below(90);
        let nodes: Vec<String> = (0..count)
            .map(|n| {
                let target = &paths[rng.below(paths.len())];
                format!(r#"{{"id":"n{n}","type":"file","file":"{target}","x":{},"y":{},"width":260,"height":140}}"#, (n % 10) * 300, (n / 10) * 200)
            })
            .collect();
        let edges: Vec<String> = (1..count.min(30))
            .map(|e| format!(r#"{{"id":"e{e}","fromNode":"n{}","toNode":"n{e}"}}"#, e - 1))
            .collect();
        fs::write(
            root.join(format!(
                "projects/p{}/boards/board-{b}.canvas",
                b % projects
            )),
            format!(
                r#"{{"nodes":[{}],"edges":[{}]}}"#,
                nodes.join(","),
                edges.join(",")
            ),
        )?;
    }
    Ok(())
}
