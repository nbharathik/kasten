// A row of choices with one pressed: a view's layouts, a panel's modes, a
// setting's values. The one segmented control in the app.

import { Icon, type IconName } from "./Icon";

export interface Choice<T extends string> {
  value: T;
  label: string;
  icon?: IconName;
}

interface SegmentedProps<T extends string> {
  label: string;
  value: T;
  choices: readonly Choice<T>[];
  onChange: (value: T) => void;
  className?: string;
  /** Shows only the icons, with the labels as tooltips. */
  iconsOnly?: boolean;
  /** A setting with one value: a radio group, where a view switcher is a
   * group of pressed buttons. */
  radio?: boolean;
  size?: "md" | "lg";
}

export function Segmented<T extends string>({ label, value, choices, onChange, className = "", iconsOnly = false, radio = false, size = "md" }: SegmentedProps<T>) {
  return (
    <div role={radio ? "radiogroup" : "group"} aria-label={label} className={`ui-seg${size === "lg" ? " is-lg" : ""} ${className}`}>
      {choices.map((choice) => (
        <button
          key={choice.value}
          type="button"
          role={radio ? "radio" : undefined}
          aria-checked={radio ? choice.value === value : undefined}
          aria-pressed={radio ? undefined : choice.value === value}
          aria-label={iconsOnly ? choice.label : undefined}
          title={iconsOnly ? choice.label : undefined}
          onClick={() => onChange(choice.value)}
        >
          {choice.icon && <Icon name={choice.icon} className="size-[15px]" />}
          {!iconsOnly && choice.label}
        </button>
      ))}
    </div>
  );
}
