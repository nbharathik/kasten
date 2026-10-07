// Buttons from the kit (ui.css): text buttons in four tones and three
// sizes, and square icon buttons that name themselves for screen readers.

import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";

import { Icon, type IconName } from "./Icon";

type Tone = "secondary" | "primary" | "quiet" | "danger";
type Size = "sm" | "md" | "lg";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  tone?: Tone;
  size?: Size;
  icon?: IconName;
  children?: ReactNode;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button({ tone = "secondary", size = "md", icon, className = "", children, type = "button", ...rest }, ref) {
  const tones = tone === "secondary" ? "" : ` is-${tone}`;
  const sizes = size === "md" ? "" : ` is-${size}`;
  return (
    <button ref={ref} type={type} className={`ui-btn${tones}${sizes} ${className}`} {...rest}>
      {icon && <Icon name={icon} className="size-4" />}
      {children}
    </button>
  );
});

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  icon: IconName;
  /** What the button does, for its tooltip and screen readers. */
  label: string;
  size?: "sm" | "md";
  /** Shown pressed: a panel it opens is open. */
  active?: boolean;
  iconClass?: string;
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton({ icon, label, size = "md", active, iconClass, className = "", type = "button", title, ...rest }, ref) {
  return (
    <button
      ref={ref}
      type={type}
      aria-label={label}
      title={title ?? label}
      aria-pressed={active}
      className={`ui-icon-btn${size === "sm" ? " is-sm" : ""} ${className}`}
      {...rest}
    >
      <Icon name={icon} className={iconClass ?? (size === "sm" ? "size-[15px]" : "size-[17px]")} />
    </button>
  );
});
