import type { JSX, ReactNode } from "react";

import { Icon, type IconName } from "../ui/Icon.tsx";

function Empty({ icon, title, children }: { icon: IconName; title: string; children: ReactNode }): JSX.Element {
  return (
    <div className="ks-sp-empty">
      <span className="ks-sp-empty-icon" aria-hidden="true">
        <Icon name={icon} size={20} />
      </span>
      <h3>{title}</h3>
      <p>{children}</p>
    </div>
  );
}

/** Comments: not in the tab strip yet, but a panel someone may open by name. */
export function CommentsTab(): JSX.Element {
  return (
    <Empty icon="message-square" title="Comments">
      Notes left on a slide by you or others will be listed here.
    </Empty>
  );
}
