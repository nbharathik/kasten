import type { ReactNode } from "react";

import { Icon } from "../../ui/Icon";
import { Segmented } from "../../ui/Segmented";
import { INBOX, KINDS, NO_FILTERS, PAGES, SORTS, SORT_LABELS, UPDATED, firstDir, hasFilters, type Filters, type Sort, type TagCount } from "./filters";
import { Glyph } from "./parts";

export interface FilterBarProps {
  filters: Filters;
  onFilters(patch: Partial<Filters>): void;
  /** Projects by folder, with their titles. */
  projects: readonly { folder: string; title: string }[];
  tags: readonly TagCount[];
  /** Whether link and board counts have loaded (the toggles need them). */
  counted: boolean;
}

const control =
  "h-8 rounded-lg border text-13 outline-none transition-colors  focus-visible:ring-2 focus-visible:ring-accent/50";
const idle = "border-line bg-raised text-ink hover:bg-hover";
const set = "border-accent/55 bg-accent/12 font-medium text-accent";

/** Type, project, tag and date filters, and the board toggles. */
export function FilterBar({ filters, onFilters, projects, tags, counted }: FilterBarProps) {
  const placeKnown = filters.place === null || filters.place === INBOX || filters.place === PAGES || projects.some((p) => p.folder === filters.place);
  const tagKnown = filters.tag === null || tags.some((t) => t.tag === filters.tag);

  return (
    <div className="flex flex-wrap items-center gap-2" role="toolbar" aria-label="Filters">
      {/* Scrolls sideways rather than spill out of a narrow pane. */}
      <Segmented
        label="Type"
        size="lg"
        className="max-w-full overflow-x-auto [scrollbar-width:none]"
        value={filters.kind}
        choices={KINDS.map((kind) => ({ value: kind.id, label: kind.label }))}
        onChange={(kind) => onFilters({ kind })}
      />

      <Select label="Project" value={filters.place ?? ""} active={filters.place !== null} onChange={(v) => onFilters({ place: v || null })}>
        <option value="">Any project</option>
        <option value={INBOX}>Inbox</option>
        <option value={PAGES}>Pages (no project)</option>
        {projects.length > 0 && (
          <optgroup label="Projects">
            {projects.map((p) => (
              <option key={p.folder} value={p.folder}>
                {p.title}
              </option>
            ))}
          </optgroup>
        )}
        {!placeKnown && <option value={filters.place!}>{filters.place}</option>}
      </Select>

      <Select label="Tag" value={filters.tag ?? ""} active={filters.tag !== null} onChange={(v) => onFilters({ tag: v || null })}>
        <option value="">Any tag</option>
        {tags.map((t) => (
          <option key={t.tag} value={t.tag}>
            #{t.label} ({t.count})
          </option>
        ))}
        {!tagKnown && <option value={filters.tag!}>#{filters.tag}</option>}
      </Select>

      <Select label="Updated" value={filters.updated} active={filters.updated !== "any"} onChange={(v) => onFilters({ updated: v as Filters["updated"] })}>
        {UPDATED.map((u) => (
          <option key={u.id} value={u.id}>
            {u.id === "any" ? "Updated any time" : `Updated ${u.label.toLowerCase()}`}
          </option>
        ))}
      </Select>

      <Toggle on={filters.noBoard} waiting={!counted} onClick={() => onFilters({ noBoard: !filters.noBoard })} hint="Notes that sit on no whiteboard">
        On no board
      </Toggle>
      <Toggle on={filters.orphans} waiting={!counted} onClick={() => onFilters({ orphans: !filters.orphans })} hint="No links in or out, and on no board">
        Orphans
      </Toggle>

      {hasFilters(filters) && (
        <button
          type="button"
          onClick={() => onFilters(NO_FILTERS)}
          className="h-8 rounded-lg px-2 text-13 text-muted outline-none transition-colors hover:bg-line/50 hover:text-ink focus-visible:ring-2 focus-visible:ring-accent/50"
        >
          Clear
        </button>
      )}

    </div>
  );
}

/** Updated, Created, Title or Most linked, and which way. */
export function SortControl({ sort, onSort }: { sort: Sort; onSort(sort: Sort): void }) {
  const preset = SORTS.some((s) => s.key === sort.key);
  return (
    <div className="flex items-center gap-1">
      <Select label="Sort" value={sort.key} active={false} onChange={(v) => onSort({ key: v as Sort["key"], dir: SORTS.find((s) => s.key === v)?.dir ?? firstDir(v as Sort["key"]) })}>
        {SORTS.map((s) => (
          <option key={s.key} value={s.key}>
            Sort: {s.label}
          </option>
        ))}
        {!preset && <option value={sort.key}>Sort: {SORT_LABELS[sort.key]}</option>}
      </Select>
      <button
        type="button"
        aria-label={sort.dir === "asc" ? "Ascending; switch to descending" : "Descending; switch to ascending"}
        title={sort.dir === "asc" ? "Ascending" : "Descending"}
        onClick={() => onSort({ ...sort, dir: sort.dir === "asc" ? "desc" : "asc" })}
        className={`${control} ${idle} grid w-8 place-items-center text-muted`}
      >
        <Glyph name={sort.dir === "asc" ? "up" : "down"} className="size-3.5" />
      </button>
    </div>
  );
}

function Select({ label, value, active, onChange, children }: { label: string; value: string; active: boolean; onChange(value: string): void; children: ReactNode }) {
  return (
    <span className="relative inline-flex">
      <select
        aria-label={label}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className={`${control} ${active ? set : idle} max-w-[13rem] cursor-pointer appearance-none truncate pl-2.5 pr-7`}
      >
        {children}
      </select>
      <Icon name="chevron" className={`pointer-events-none absolute right-2 top-1/2 size-3.5 -translate-y-1/2 rotate-90 ${active ? "text-accent" : "text-muted"}`} />
    </span>
  );
}

function Toggle({ on, waiting, onClick, hint, children }: { on: boolean; waiting: boolean; onClick(): void; hint: string; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      title={waiting ? `${hint} (counting links…)` : hint}
      onClick={onClick}
      className={`${control} ${on ? set : idle} flex items-center gap-1.5 px-2.5`}
    >
      <span aria-hidden="true" className={`size-1.5 rounded-full transition-colors ${on ? "bg-accent" : "bg-muted/40"}`} />
      {children}
    </button>
  );
}
