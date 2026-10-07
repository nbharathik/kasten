---
id: 01M36WF140XYGTGVFGP5Y2Y03T
title: "Frontmatter: quoting, comments & unknown keys"
type: page   # trailing comment
created: 2026-09-23T12:20:00+02:00
updated: 2026-09-23T12:20:00+02:00
tags:
  - frontmatter
  - "yaml: tricky"
aliases: [FM test, 'single quoted']
props:
  status: Exploring
  score: 0.75
  empty:
  nested:
    deep: [1, 2, 3]
x-obsidian-plugin: {cssclass: wide, publish: false}
summary: >
  Folded text that
  spans lines.
notes: |
  Literal block
    with indentation kept.
  ---
  An indented fence inside a block scalar does not end the frontmatter.
unicode: "Grüße, 你好, 🚀"
---
Body starts right after the closing fence.
