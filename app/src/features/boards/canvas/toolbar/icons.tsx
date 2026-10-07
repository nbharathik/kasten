// The board's tool icons: the app's icon set at the toolbar's size.

import { Icon, type IconName } from "../../../../ui/Icon";

export type ToolIconName = IconName;

export function ToolIcon({ name, className = "size-[18px]" }: { name: ToolIconName; className?: string }) {
  return <Icon name={name} className={className} strokeWidth={1.7} />;
}
