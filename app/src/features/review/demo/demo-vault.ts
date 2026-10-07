// A preview vault with sample agent work: proposals waiting, agent sessions
// with their commits, and undo, so the review queue and the history view
// can be tried in a plain browser. Dev only: this folder's index.html serves
// it, and nothing in the app imports it.

import { isoDay } from "../../../lib/dates";
import type { AgentMark, ChangedFile, CommitInfo, Proposal, SessionInfo, Undone } from "../../../lib/vault/types";
import { splitFrontmatter } from "../../pages/markdown/frontmatter";
import { replaceSection } from "../../workspace/preview/memory-extras";
import { MemoryVault } from "../../workspace/preview/memory-vault";
import { IDEA, IDEA_TEXT, NEXT_STEPS, SKETCH_MORE, marksIn, withAgentWriting, type Writing } from "./demo-marks";
import { DECK, METHOD, PAPER, ROADMAP, SESSION_A, SESSION_B, SESSION_C, SKETCH, retitled, sampleProposals } from "./samples";

const pause = (ms: number) => new Promise((done) => setTimeout(done, ms));

interface Who {
  client?: string;
  session?: string;
  approvedBy?: string;
  undoes?: string;
}

const RELATED = "projects/note-taking-study/pages/related-work-notes.md";

/** Op names as commit summaries show them (kasten-core `AgentOp::name`). */
const NAMES: Record<string, string> = { trash: "trash note", rename: "rename note", edit: "propose edit", tag_schema: "update tag schema" };

/** "trash note Look at the JSON Canvas spec", as the core sums up a proposal. */
const summary = (p: Proposal) => `${NAMES[p.op.kind] ?? p.op.kind.replace(/_/g, " ")} ${p.target?.title ?? ""}`.trim();
const LIST = "library/reading-list.md";

/** `text` with its body changed by `edit`, frontmatter kept. */
function withBody(text: string, edit: (body: string) => string): string {
  const { prefix, body } = splitFrontmatter(text);
  return prefix + edit(body);
}

export class DemoVault extends MemoryVault {
  private pending: Proposal[];
  private log: CommitInfo[] = [];
  private files = new Map<string, ChangedFile[]>();
  /** Commits whose undo meets a later edit on the same lines, as the core reports it. */
  private clashes = new Map<string, { path: string; detail: string }>();
  /** The preview's own versions of writes the demo already shows as agent commits. */
  private hidden = new Set<string>();
  private seq = 0;
  /** What session A wrote that is still marked, by the commit it came in. */
  private writings = new Map<string, Writing>();
  private accepted = new Set<string>();

  constructor(private readonly seed: Record<string, string>) {
    super(withAgentWriting(seed));
    const now = Date.now();
    this.pending = sampleProposals(seed, now);
    this.sampleHistory(now);
  }

  private commit(summary: string, time: number, who: Who, files: ChangedFile[] = []): CommitInfo {
    const id = `d${(++this.seq).toString(16).padStart(3, "0")}${time.toString(16)}`;
    const info: CommitInfo = {
      id,
      summary,
      message: summary,
      author: who.client ? `agent:${who.client}` : "You",
      time,
      agent: Boolean(who.client),
      session: who.session ?? null,
      op: summary.slice(0, summary.indexOf(":")) || null,
      approvedBy: who.approvedBy ?? null,
      undoes: who.undoes ?? null,
    };
    this.log.push(info);
    this.files.set(id, files);
    return info;
  }

  private text(path: string): string {
    return this.data.files[path]?.text ?? this.seed[path] ?? "";
  }

  /** Two days of work: your edits, a session you undid yesterday, and today's two sessions. */
  private sampleHistory(now: number): void {
    const ago = (minutes: number) => now - minutes * 60_000;
    const day = (daysAgo: number, hour: number, minute = 0) => {
      const d = new Date(now);
      return new Date(d.getFullYear(), d.getMonth(), d.getDate() - daysAgo, hour, minute).getTime();
    };
    const edit = (path: string, change: (text: string) => string): ChangedFile => ({ path, before: this.text(path), after: change(this.text(path)) });
    const append = (path: string, more: string) => edit(path, (t) => t + more);
    const you = {};
    const a = { client: "claude-code", session: SESSION_A };
    const b = { client: "claude-desktop", session: SESSION_B };
    const c = { client: "claude-code", session: SESSION_C };
    const proposal = (id: string) => ({ path: `.kasten/proposals/${id}.json`, before: null, after: `${JSON.stringify(this.pending.find((p) => p.id === id), null, 2)}\n` });

    const seeded = (path: string) => this.seed[path] ?? "";
    /** Session A's writing, still in the notes and so marked. */
    const wrote = (info: CommitInfo, path: string, text: string) =>
      this.writings.set(info.id, { path, text, mark: { session: SESSION_A, client: "claude-code", commit: info.id, time: info.time } });
    this.commit("create: Photo organiser roadmap", day(2, 10, 14), you, [{ path: ROADMAP, before: null, after: seeded(ROADMAP) }]);
    this.commit("edit: Zettelkasten method", day(2, 11, 48), you, [append(METHOD, "- Permanent notes live in projects or the library.\n")]);

    const c1 = this.commit("create: Reading list", day(1, 16, 10), c, [{ path: LIST, before: null, after: "---\ntitle: Reading list\n---\n- [ ] JSON Canvas 1.0\n- [ ] Obsidian's canvas groups\n" }]);
    const c2 = this.commit("append: Related work notes", day(1, 16, 18), c, [append(RELATED, "\n## Canvas formats\n\nObsidian and JSON Canvas store groups as nodes.\n")]);
    const c3 = this.commit("tags: Related work notes", day(1, 16, 25), c, [edit(RELATED, (t) => t.replace("tags: [", "tags: [canvas, "))]);
    for (const undone of [c3, c2, c1]) {
      const back = (this.files.get(undone.id) ?? []).map((f) => ({ path: f.path, before: f.after, after: f.before }));
      this.commit(`undo: ${undone.summary}`, day(1, 17, 2), { undoes: undone.id }, back);
    }

    this.commit(`journal: ${isoDay(new Date(now))}`, ago(190), you, [{ path: "journal/today.md", before: null, after: "- Review the agent's roadmap edits\n" }]);
    wrote(this.commit("capture: Idea: album heat map", ago(52), a, [{ path: IDEA, before: null, after: IDEA_TEXT }]), IDEA, IDEA_TEXT);
    const nextSteps = [{ path: ROADMAP, before: seeded(ROADMAP), after: seeded(ROADMAP) + NEXT_STEPS }];
    wrote(this.commit("append: Photo organiser roadmap", ago(49), a, nextSteps), ROADMAP, NEXT_STEPS);
    const method = "We give each person ten questions about notes they wrote a month earlier,\nand time how long each answer takes with search, with links and with folders.\nEach person answers the same ten questions.\n";
    const paper = this.commit("edit: Report draft: How people find old notes", ago(44), { ...a, approvedBy: "you" }, [edit(PAPER, (t) => withBody(t, (body) => replaceSection(body, "3. Method", method)))]);
    this.clashes.set(paper.id, { path: PAPER, detail: "It was edited on the same lines after the session" });
    this.commit("tags: Duplicate score sketch", ago(42), a, [{ path: SKETCH, before: seeded(SKETCH), after: seeded(SKETCH).replace("tags: [idea]", "tags: [idea, metric]") }]);
    const volume = [{ path: SKETCH, before: seeded(SKETCH), after: seeded(SKETCH) + SKETCH_MORE }];
    wrote(this.commit("append: Duplicate score sketch", ago(41), a, volume), SKETCH, SKETCH_MORE);
    for (const [p, minutes] of [[this.pending[0]!, 38], [this.pending[1]!, 35], [this.pending[2]!, 31]] as const) {
      this.commit(`propose: ${summary(p)}`, ago(minutes), a, [proposal(p.id)]);
    }
    this.commit("edit: Report draft: How people find old notes", ago(22), you, [append(PAPER, "\nThe volunteers come from three different teams.\n")]);
    // Session B's edit of the sample deck, which the history shows as slides, and the proposal that follows it.
    const deck = seeded(DECK);
    if (deck) this.commit("deck: edit Tool use in language models § set text", ago(15), b, [{ path: DECK, before: deck, after: retitled(deck, 1, "Why give a model tools at all?") }]);
    for (const p of [this.pending[3]!, this.pending[4]!, this.pending[5]]) {
      if (p) this.commit(`propose: ${summary(p)}`, ago(Math.round((now - Date.parse(p.created)) / 60_000)), b, [proposal(p.id)]);
    }
  }

  private take(id: string | undefined): Proposal {
    const p = this.pending.find((x) => x.id === id);
    if (!p) throw new Error(`No proposal ${id} is waiting`);
    return p;
  }

  override async proposals(): Promise<Proposal[]> {
    return structuredClone(this.pending);
  }

  override async acceptProposal(id?: string): Promise<unknown> {
    await pause(350);
    const p = this.take(id);
    // A full rewrite whose note changed since meets the core's merge refusal.
    if (p.op.kind === "edit") throw new Error("The note changed on the same lines since this edit was proposed");
    const who = { client: p.client, session: p.session, approvedBy: "you" };
    const path = p.target?.path ?? "";
    const title = p.target?.title ?? "";
    const before = this.text(path);
    // The preview keeps its own version of each write; the demo's commit stands for it.
    const known = new Set((await super.history(null, 10_000)).map((c) => c.id));
    if (p.op.kind === "replace_section") await this.replaceSection(path, String(p.op.heading), String(p.op.markdown));
    else if (p.op.kind === "edit_deck") this.put(path, String(p.op.text));
    else if (p.op.kind === "trash") await this.trash(path);
    else if (p.op.kind === "rename") await this.rename(path, String(p.op.title));
    for (const c of await super.history(null, 10_000)) if (!known.has(c.id)) this.hidden.add(c.id);
    const verbs: Record<string, string> = { trash: `trash: ${title}`, rename: `rename: ${title} → ${String(p.op.title)}`, tag_schema: "schema: paper" };
    this.commit(verbs[p.op.kind] ?? `edit: ${title}`, Date.now(), who, path ? [{ path, before, after: this.data.files[path]?.text ?? null }] : []);
    this.pending = this.pending.filter((x) => x.id !== p.id);
    return {};
  }

  override async rejectProposal(id?: string): Promise<void> {
    await pause(250);
    const p = this.take(id);
    this.pending = this.pending.filter((x) => x.id !== p.id);
    this.commit(`reject: ${summary(p)}`, Date.now(), {});
  }

  override async history(path: string | null, limit = 100): Promise<CommitInfo[]> {
    if (path) return super.history(path, limit);
    const own = (await super.history(null, limit)).filter((c) => !this.hidden.has(c.id));
    return [...own, ...this.log].sort((x, y) => y.time - x.time).slice(0, limit);
  }

  override async commitChanges(rev: string): Promise<ChangedFile[]> {
    return this.files.get(rev) ?? super.commitChanges(rev);
  }

  override async sessions(limit = 50): Promise<SessionInfo[]> {
    const undone = new Set(this.log.flatMap((c) => (c.undoes ? [c.undoes] : [])));
    const by = new Map<string, SessionInfo>();
    for (const c of this.log) {
      if (!c.session) continue;
      const s = by.get(c.session) ?? { id: c.session, client: c.author.replace(/^agent:/, ""), started: c.time, last: c.time, commits: 0, undone: true };
      s.commits += 1;
      s.started = Math.min(s.started, c.time);
      s.last = Math.max(s.last, c.time);
      s.undone &&= undone.has(c.id);
      by.set(c.session, s);
    }
    return [...by.values()].sort((x, y) => y.last - x.last).slice(0, limit);
  }

  /** Reverts newest first, as the core does, and stops at a clash. */
  override async undoSession(session?: string): Promise<Undone> {
    await pause(400);
    const done = new Set(this.log.flatMap((c) => (c.undoes ? [c.undoes] : [])));
    const own = this.log.filter((c) => c.session === session && !done.has(c.id)).sort((x, y) => y.time - x.time);
    const reverted: string[] = [];
    for (const c of own) {
      const clash = this.clashes.get(c.id);
      if (clash) return { reverted, conflict: { commit: c.id, summary: c.summary, ...clash } };
      const back = (this.files.get(c.id) ?? []).map((f) => ({ path: f.path, before: f.after, after: f.before }));
      this.commit(`undo: ${c.summary}`, Date.now(), { undoes: c.id }, back);
      // Undoing a proposal's commit removes its file, and so the proposal.
      for (const f of back) if (f.path.startsWith(".kasten/proposals/")) this.pending = this.pending.filter((p) => !f.path.includes(p.id));
      await this.takeBack(c.id);
      reverted.push(c.id);
    }
    return { reverted, conflict: null };
  }

  /** Undoing a commit with session A's writing takes the writing out again. */
  private async takeBack(commit: string): Promise<void> {
    const writing = this.writings.get(commit);
    if (!writing) return;
    this.writings.delete(commit);
    const text = this.text(writing.path);
    if (!text.includes(writing.text)) return;
    const known = new Set((await super.history(null, 10_000)).map((c) => c.id));
    this.put(writing.path, text.replace(writing.text, ""));
    for (const c of await super.history(null, 10_000)) if (!known.has(c.id)) this.hidden.add(c.id);
  }

  override async agentMarks(path: string): Promise<AgentMark[]> {
    if (this.accepted.has(path)) return [];
    return [...this.writings.values()].filter((w) => w.path === path).flatMap((w) => marksIn(w, this.text(path)));
  }

  override async acceptAgentMarks(path: string): Promise<void> {
    await pause(250);
    if ((await this.agentMarks(path)).length === 0) return;
    this.accepted.add(path);
    this.commit(`accept: ${(await this.read(path)).meta.title}`, Date.now(), {});
  }

  override async agentMarked(paths: string[]): Promise<string[]> {
    const marked: string[] = [];
    for (const path of paths) if ((await this.agentMarks(path)).length > 0) marked.push(path);
    return marked;
  }

  override async trustSession(): Promise<void> {
    await pause(200);
  }
}
