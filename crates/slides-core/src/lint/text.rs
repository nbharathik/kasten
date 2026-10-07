//! A report as lines a person or an agent reads: how many problems, then each
//! with where it is, which rule found it, what is wrong and how to fix it.

use super::model::{Report, Severity};

/// What of a report to write.
pub struct View<'a> {
    /// What the report is of, such as a deck's file name.
    pub name: &'a str,
    /// Only issues at least this serious.
    pub least: Severity,
    /// Only the issues of this slide.
    pub slide: Option<&'a str>,
    /// The most issues to write; the rest are counted.
    pub most: usize,
}

/// "1 error, 2 warnings, 0 info": how many of each there are.
pub fn summary(report: &Report) -> String {
    let counted =
        |n: usize, one: &str, many: &str| format!("{n} {}", if n == 1 { one } else { many });
    format!(
        "{}, {}, {} info",
        counted(report.count(Severity::Error), "error", "errors"),
        counted(report.count(Severity::Warning), "warning", "warnings"),
        report.count(Severity::Info)
    )
}

/// The report as lines of text.
pub fn to_text(report: &Report, view: &View) -> String {
    let issues: Vec<_> = report
        .issues
        .iter()
        .filter(|i| i.severity <= view.least && view.slide.is_none_or(|s| i.slide == s))
        .collect();
    let mut lines = vec![format!(
        "Lint of {}: {}{}.",
        view.name,
        summary(report),
        if report.has_errors() {
            "; fix the errors before you finish"
        } else {
            ""
        }
    )];
    for issue in issues.iter().take(view.most) {
        let at = issue
            .element
            .as_deref()
            .map_or_else(|| issue.slide.clone(), |e| format!("{} {e}", issue.slide));
        let fix = issue
            .hint
            .as_deref()
            .map(|h| format!(" Fix: {h}"))
            .unwrap_or_default();
        lines.push(format!(
            "{:<7} {at} {}: {}{fix}",
            issue.severity.as_str(),
            issue.rule,
            issue.message
        ));
    }
    if issues.len() > view.most {
        lines.push(format!(
            "... and {} more; ask for one slide, or for errors only.",
            issues.len() - view.most
        ));
    }
    for skipped in &report.skipped {
        lines.push(format!("Not checked: {}: {}", skipped.rule, skipped.reason));
    }
    lines.join("\n")
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::lint::model::{Issue, SkippedRule};

    fn issue(rule: &str, severity: Severity, slide: &str) -> Issue {
        Issue {
            rule: rule.to_owned(),
            severity,
            slide: slide.to_owned(),
            element: Some("e-1".to_owned()),
            message: "Something is wrong.".to_owned(),
            hint: Some("Do this.".to_owned()),
        }
    }

    #[test]
    fn writes_a_summary_each_issue_with_its_fix_and_what_was_not_checked() {
        let report = Report {
            issues: vec![
                issue("off-slide", Severity::Error, "s-1"),
                issue("margin", Severity::Warning, "s-2"),
            ],
            skipped: vec![SkippedRule {
                rule: "unresolved-citation".to_owned(),
                reason: "No list.".to_owned(),
            }],
        };
        let all = to_text(
            &report,
            &View {
                name: "a.deck",
                least: Severity::Info,
                slide: None,
                most: 10,
            },
        );
        let lines: Vec<&str> = all.lines().collect();
        assert_eq!(
            lines[0],
            "Lint of a.deck: 1 error, 1 warning, 0 info; fix the errors before you finish."
        );
        assert_eq!(
            lines[1],
            "error   s-1 e-1 off-slide: Something is wrong. Fix: Do this."
        );
        assert_eq!(lines[3], "Not checked: unresolved-citation: No list.");
        let errors = to_text(
            &report,
            &View {
                name: "a.deck",
                least: Severity::Error,
                slide: None,
                most: 10,
            },
        );
        assert!(!errors.contains("margin"));
        let cut = to_text(
            &report,
            &View {
                name: "a.deck",
                least: Severity::Info,
                slide: None,
                most: 1,
            },
        );
        assert!(cut.contains("... and 1 more"));
        let slide = to_text(
            &report,
            &View {
                name: "a.deck",
                least: Severity::Info,
                slide: Some("s-2"),
                most: 10,
            },
        );
        assert!(slide.contains("margin") && !slide.contains("off-slide"));
    }
}
