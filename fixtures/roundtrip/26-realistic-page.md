---
id: 01M3729SP01YZHAQ3NWAQQ2WZ7
title: Reading notes on attention
type: page
created: 2026-09-23T14:02:00+02:00
updated: 2026-09-23T14:40:00+02:00
tags: [paper, reading]
props:
  status: Drafting
  venue: NeurIPS
  coauthors: [Alex, Sam]
parent: 01M36N8AA0SQP0DY9C54T2DXA1
locked: false
icon: book
x-imported-from: heptabase
---
# Reading notes on attention

These notes are hard-wrapped at eighty columns, the way many people write in a
plain text editor. A WYSIWYG editor must not unwrap them when the paragraph is
left alone.

> [!quote] Vaswani et al., 2017
> The Transformer allows for significantly more parallelization.

## Key ideas

1. Scaled dot-product attention: $\mathrm{softmax}(QK^T / \sqrt{d_k})V$.
2. Multi-head attention runs $h$ heads in parallel.
   - Each head projects to $d_k = d_{model} / h$.
3. Positional encodings are *added*, not concatenated.

| Model | BLEU (EN-DE) | Params |
|-------|-------------:|-------:|
| Base  |         27.3 |   65M |
| Big   |         28.4 |  213M |

## Open questions

- [ ] Does this transfer to video files? See [[Photo organiser roadmap#Open questions]].
- [x] Read the appendix
- [ ] Ask [[Alex]] about ![[attention.pdf#page=3]]

<details>
<summary>Raw extraction log</summary>

```text
page 3: 12 highlights
page 5: 4 highlights
```

</details>

---

Related: [[Zettelkasten method|how these cards are organised]], [paper](https://arxiv.org/abs/1706.03762).
