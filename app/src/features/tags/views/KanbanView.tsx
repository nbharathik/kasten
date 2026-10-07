// The kanban view: the board
// in kanban/, grouped by the view's select property (else the tag's first),
// or a word on how to get one when the tag has no select property.

import "../../pages/editor/styles/tokens.css";
import "./kanban/board.css";
import "./kanban/cards.css";

import { groupDef } from "../model";
import { Board } from "./kanban/Board";
import type { ViewProps } from "./types";
import { Icon } from "../../../ui/Icon";

export function KanbanView(props: ViewProps) {
  const def = groupDef(props.view, props.schema);
  if (!def) return <NoSelect tag={props.tag} />;
  return <Board {...props} def={def} />;
}

function NoSelect({ tag }: { tag: string }) {
  return (
    <div className="kasten-kanban-start" role="note">
      <span className="kasten-kanban-start-icon" aria-hidden="true">
        <Icon name="kanban" className="size-6" />
      </span>
      <h2>Nothing to make columns from yet</h2>
      <p>
        A board puts #{tag}’s notes in a column for each option of a select property, like a task’s status. Add one with <strong>Properties</strong> at
        the top of this page, give it options such as Todo, Doing and Done, and the cards sort themselves into columns you can drag them between.
      </p>
    </div>
  );
}
