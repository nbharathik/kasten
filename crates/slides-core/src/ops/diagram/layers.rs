//! Layering: which column (or row) each box goes in, and in what order down
//! the column. The boxes are a directed graph; a cycle is broken at the edge
//! that closes it, which is then drawn going back. An edge that skips layers
//! gets a stand-in slot in each layer it crosses, so real boxes make room for
//! the line instead of sitting on it.

use std::collections::HashMap;

/// The graph: how many boxes, and the edges between them by index.
pub struct Graph {
    pub nodes: usize,
    pub edges: Vec<(usize, usize)>,
}

/// A place in a layer: a box, or the room an edge takes as it passes.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash)]
pub enum Slot {
    Node(usize),
    Dummy(usize),
}

pub struct Layering {
    /// The layer of each box.
    pub layer: Vec<usize>,
    /// The slots of each layer, in order.
    pub layers: Vec<Vec<Slot>>,
    /// Whether an edge goes against the direction of the layers.
    pub back: Vec<bool>,
}

/// The edges that close a cycle, found by walking from the boxes in order.
fn back_edges(graph: &Graph) -> Vec<bool> {
    let mut out: Vec<Vec<(usize, usize)>> = vec![Vec::new(); graph.nodes];
    for (e, &(u, v)) in graph.edges.iter().enumerate() {
        out[u].push((e, v));
    }
    // 0 unseen, 1 on the way down, 2 done.
    let mut state = vec![0u8; graph.nodes];
    let mut back = vec![false; graph.edges.len()];
    for root in 0..graph.nodes {
        if state[root] != 0 {
            continue;
        }
        let mut stack = vec![(root, 0usize)];
        state[root] = 1;
        while let Some(&(u, next)) = stack.last() {
            match out[u].get(next) {
                Some(&(e, v)) => {
                    if let Some(top) = stack.last_mut() {
                        top.1 += 1;
                    }
                    match state[v] {
                        0 => {
                            state[v] = 1;
                            stack.push((v, 0));
                        }
                        1 => back[e] = true,
                        _ => {}
                    }
                }
                None => {
                    state[u] = 2;
                    stack.pop();
                }
            }
        }
    }
    back
}

pub fn layer(graph: &Graph) -> Layering {
    let back = back_edges(graph);
    // The edges as the layers see them: forward.
    let forward: Vec<(usize, usize)> = graph
        .edges
        .iter()
        .zip(&back)
        .map(|(&(u, v), &b)| if b { (v, u) } else { (u, v) })
        .collect();
    let mut ins: Vec<Vec<usize>> = vec![Vec::new(); graph.nodes];
    let mut outs: Vec<Vec<usize>> = vec![Vec::new(); graph.nodes];
    for (e, &(u, v)) in forward.iter().enumerate() {
        outs[u].push(e);
        ins[v].push(e);
    }
    // Topological order, the lowest index first among those that are ready.
    let mut waiting: Vec<usize> = ins.iter().map(Vec::len).collect();
    let mut ready: Vec<usize> = (0..graph.nodes).filter(|&v| waiting[v] == 0).collect();
    let mut order = Vec::with_capacity(graph.nodes);
    while !ready.is_empty() {
        ready.sort_unstable_by(|a, b| b.cmp(a));
        let Some(u) = ready.pop() else { break };
        order.push(u);
        for &e in &outs[u] {
            let v = forward[e].1;
            waiting[v] -= 1;
            if waiting[v] == 0 {
                ready.push(v);
            }
        }
    }
    let mut layer = vec![0usize; graph.nodes];
    for &v in &order {
        layer[v] = ins[v]
            .iter()
            .map(|&e| layer[forward[e].0] + 1)
            .max()
            .unwrap_or(0);
    }
    // A box nothing leads to sits next to the first thing it leads to, not at the far end.
    for &v in order.iter().rev() {
        if ins[v].is_empty()
            && let Some(nearest) = outs[v].iter().map(|&e| layer[forward[e].1]).min()
        {
            layer[v] = nearest.saturating_sub(1);
        }
    }
    let count = layer.iter().max().map_or(1, |m| m + 1);
    let mut layers: Vec<Vec<Slot>> = vec![Vec::new(); count];
    for (v, &l) in layer.iter().enumerate() {
        layers[l].push(Slot::Node(v));
    }
    for (e, &(u, v)) in forward.iter().enumerate() {
        for crossed in layers.iter_mut().take(layer[v]).skip(layer[u] + 1) {
            crossed.push(Slot::Dummy(e));
        }
    }
    let above = |slot: Slot, l: usize| -> Vec<Slot> {
        let edges: Vec<usize> = match slot {
            Slot::Node(v) => ins[v].clone(),
            Slot::Dummy(e) => vec![e],
        };
        edges
            .into_iter()
            .map(|e| {
                if layer[forward[e].0] + 1 == l {
                    Slot::Node(forward[e].0)
                } else {
                    Slot::Dummy(e)
                }
            })
            .collect()
    };
    let below = |slot: Slot, l: usize| -> Vec<Slot> {
        let edges: Vec<usize> = match slot {
            Slot::Node(u) => outs[u].clone(),
            Slot::Dummy(e) => vec![e],
        };
        edges
            .into_iter()
            .map(|e| {
                if layer[forward[e].1] == l + 1 {
                    Slot::Node(forward[e].1)
                } else {
                    Slot::Dummy(e)
                }
            })
            .collect()
    };
    // Sweep down and up, putting each slot at the middle of its neighbours in the next layer.
    for _ in 0..4 {
        for l in 1..count {
            reorder(&mut layers, l, l - 1, |s| above(s, l));
        }
        for l in (0..count.saturating_sub(1)).rev() {
            reorder(&mut layers, l, l + 1, |s| below(s, l));
        }
    }
    Layering {
        layer,
        layers,
        back,
    }
}

fn reorder(
    layers: &mut [Vec<Slot>],
    at: usize,
    beside: usize,
    neighbours: impl Fn(Slot) -> Vec<Slot>,
) {
    let places: HashMap<Slot, usize> = layers[beside]
        .iter()
        .enumerate()
        .map(|(i, &s)| (s, i))
        .collect();
    let mut keyed: Vec<(f64, usize, Slot)> = layers[at]
        .iter()
        .enumerate()
        .map(|(i, &slot)| {
            let found: Vec<f64> = neighbours(slot)
                .iter()
                .filter_map(|n| places.get(n))
                .map(|&p| p as f64)
                .collect();
            let middle = if found.is_empty() {
                i as f64
            } else {
                found.iter().sum::<f64>() / found.len() as f64
            };
            (middle, i, slot)
        })
        .collect();
    keyed.sort_by(|a, b| a.0.total_cmp(&b.0).then(a.1.cmp(&b.1)));
    layers[at] = keyed.into_iter().map(|(_, _, s)| s).collect();
}

#[cfg(test)]
mod tests {
    use super::*;

    fn graph(nodes: usize, edges: &[(usize, usize)]) -> Graph {
        Graph {
            nodes,
            edges: edges.to_vec(),
        }
    }

    #[test]
    fn a_chain_has_a_layer_for_each_box() {
        let l = layer(&graph(4, &[(0, 1), (1, 2), (2, 3)]));
        assert_eq!(l.layer, [0, 1, 2, 3]);
        assert!(l.back.iter().all(|b| !b));
        assert!(l.layers.iter().all(|s| s.len() == 1));
    }

    #[test]
    fn a_long_edge_leaves_a_stand_in_in_each_layer_it_crosses() {
        let l = layer(&graph(3, &[(0, 1), (1, 2), (0, 2)]));
        assert_eq!(l.layer, [0, 1, 2]);
        assert_eq!(l.layers[1].len(), 2);
        assert!(l.layers[1].contains(&Slot::Dummy(2)));
    }

    #[test]
    fn a_cycle_is_broken_at_the_edge_that_closes_it() {
        let l = layer(&graph(3, &[(0, 1), (1, 2), (2, 0)]));
        assert_eq!(l.back, [false, false, true]);
        assert_eq!(l.layer, [0, 1, 2]);
    }

    #[test]
    fn a_box_nothing_leads_to_sits_next_to_what_it_leads_to() {
        // 3 has no incoming edge and leads to 2, which is in layer 2.
        let l = layer(&graph(4, &[(0, 1), (1, 2), (3, 2)]));
        assert_eq!(l.layer[3], 1);
    }

    #[test]
    fn the_same_graph_is_always_laid_out_the_same_way() {
        let g = graph(6, &[(0, 3), (0, 4), (1, 3), (2, 4), (3, 5), (4, 5), (5, 0)]);
        let a = layer(&g);
        let b = layer(&g);
        assert_eq!(a.layers, b.layers);
        assert_eq!(a.layer, b.layer);
    }
}
