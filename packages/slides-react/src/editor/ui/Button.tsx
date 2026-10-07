import type { ButtonHTMLAttributes, ReactNode, Ref } from "react";

import { Icon, type IconName } from "./Icon.tsx";

/** The name a person sees in a tooltip, with the keys that do the same, such as "Bold" and "Ctrl+B". */
export interface Label {
  name: string;
  keys?: string;
}

interface IconButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children" | "title"> {
  icon: IconName;
  label: string;
  keys?: string;
  /** A toggle that is on. */
  on?: boolean;
  /** A small arrow beside the icon: the button opens a menu. */
  menu?: boolean;
  /** Text after the icon. */
  text?: string;
  ref?: Ref<HTMLButtonElement>;
}

/**
 * The tooltip is drawn by the stylesheet from `data-tip`; the name for
 * assistive technology is `aria-label`. `data-ks-keep-focus` stops a text
 * editor from ending its edit when this button takes the focus.
 */
export function IconButton({ icon, label, keys, on, menu, text, className = "", ref, ...rest }: IconButtonProps) {
  return (
    <button
      type="button"
      ref={ref}
      className={`ks-btn ks-icon-btn${on ? " is-on" : ""}${text ? " has-text" : ""} ${className}`}
      aria-label={label}
      aria-pressed={on === undefined ? undefined : on}
      data-tip={keys ? `${label} (${keys})` : label}
      data-ks-keep-focus=""
      onMouseDown={(event) => event.preventDefault()}
      {...rest}
    >
      <Icon name={icon} />
      {text ? <span className="ks-btn-text">{text}</span> : null}
      {menu ? <Icon name="chevron-down" size={12} /> : null}
    </button>
  );
}

interface TextButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  primary?: boolean;
  children: ReactNode;
}

export function TextButton({ primary, className = "", children, ...rest }: TextButtonProps) {
  return (
    <button type="button" className={`ks-btn ks-text-btn${primary ? " is-primary" : ""} ${className}`} {...rest}>
      {children}
    </button>
  );
}

/** A thin rule between groups in a toolbar. */
export function Divider() {
  return <span className="ks-divider" role="separator" aria-orientation="vertical" />;
}
