import type { ButtonHTMLAttributes, JSX, ReactNode, Ref } from "react";

import { type CommandContext, commandOf, isEnabled, keysOf, runCommand } from "../commands/index.ts";
import { DropMenu } from "../menus/DropMenu.tsx";
import { useDropdown } from "../menus/useDropdown.ts";
import type { EditorUi } from "../ui-state.ts";
import { IconButton } from "../ui/Button.tsx";
import { Icon, type IconName } from "../ui/Icon.tsx";
import type { MenuItem } from "../ui/Menu.tsx";

interface ToolButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children" | "title"> {
  /** The name for a screen reader and the tooltip. */
  label: string;
  /** The keys that do the same, shown in the tooltip. */
  keys?: string | undefined;
  icon?: IconName | undefined;
  /** Text after the icon. */
  text?: string;
  /** A toggle that is on. */
  on?: boolean | undefined;
  /** A small arrow after the rest: the button opens a menu. */
  menu?: boolean;
  /** More to draw inside: the bar under a colour button, a preview. */
  children?: ReactNode;
  ref?: Ref<HTMLButtonElement>;
}

/**
 * A button of the toolbar: the kit's `IconButton` (28 px, a tooltip, the mouse
 * leaves the focus where it is) when it is an icon, with text or an arrow. One
 * that also draws something of its own, such as the bar under a colour or a
 * preview, or has no icon, is the same button made here.
 */
export function ToolButton({ label, keys, icon, text, on, menu, children, className = "", ref, ...rest }: ToolButtonProps): JSX.Element {
  if (icon && children === undefined) {
    return <IconButton icon={icon} label={label} keys={keys} on={on} menu={menu} {...(text === undefined ? {} : { text: String(text) })} className={className} ref={ref} {...rest} />;
  }
  return (
    <button
      type="button"
      ref={ref}
      className={`ks-btn ks-icon-btn${on ? " is-on" : ""}${text !== undefined ? " has-text" : ""}${className ? ` ${className}` : ""}`}
      aria-label={label}
      aria-pressed={on === undefined ? undefined : on}
      data-tip={keys ? `${label} (${keys})` : label}
      data-ks-keep-focus=""
      onMouseDown={(event) => event.preventDefault()}
      {...rest}
    >
      {icon ? <Icon name={icon} /> : null}
      {text !== undefined ? <span className="ks-btn-text">{text}</span> : null}
      {children}
      {menu ? <Icon name="chevron-down" size={12} /> : null}
    </button>
  );
}

interface CommandButtonProps extends Omit<ToolButtonProps, "onClick" | "keys" | "disabled" | "label"> {
  id: string;
  ctx: CommandContext;
  /** Says something other than the command's own name. */
  label?: string;
  icon?: IconName | undefined;
  /** Disabled even where the command itself could be done. */
  disabledIf?: boolean;
}

/** A toolbar button that runs the command called `id`: its name, icon and keys, and disabled when it cannot be done. */
export function CommandButton({ id, ctx, label, icon, disabledIf, ...rest }: CommandButtonProps): JSX.Element {
  const command = commandOf(id);
  return (
    <ToolButton
      label={label ?? command.label}
      icon={icon ?? command.icon}
      keys={keysOf(id)}
      disabled={!isEnabled(command, ctx) || Boolean(disabledIf)}
      onClick={() => void runCommand(id, ctx)}
      {...rest}
    />
  );
}

interface MenuButtonProps extends Omit<ToolButtonProps, "onClick" | "menu"> {
  ui: EditorUi;
  /** The rows of the menu, built when it opens. */
  items(): MenuItem[];
}

/** A toolbar button with a small arrow that opens a menu below it. */
export function MenuButton({ ui, items, label, children, ...rest }: MenuButtonProps): JSX.Element {
  const dd = useDropdown();
  return (
    <>
      <ToolButton label={label} menu {...rest} {...dd.trigger}>
        {children}
      </ToolButton>
      <DropMenu dd={dd} ui={ui} items={items} label={label} />
    </>
  );
}
