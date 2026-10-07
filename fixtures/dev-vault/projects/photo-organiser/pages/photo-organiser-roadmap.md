---
id: 01M36N8AA0SQP0DY9C54T2DXA1
title: Photo organiser roadmap
type: page
created: 2026-09-23T10:14:00+02:00
updated: 2026-09-23T11:05:00+02:00
tags: [project, paper]
props:
  status: Drafting
  venue: Tech conference 2027
  deadline: 2026-10-15
---
# Photo organiser roadmap

| Phase | Goal | Status |
| --- | --- | :---: |
| 1 | Import photo libraries | done |
| 2 | Thumbnails and a cache | in progress |
| 3 | Duplicate score, see [[Duplicate score for photos]] | todo |

## Open questions

1. How do we score a cropped copy versus an edited one?
2. Do we need $O(n \log n)$ matching, or is a hash join enough?

```rust
fn score(a: &Photo, b: &Photo) -> f64 {
    distance(a, b) / a.size().diagonal()
}
```
