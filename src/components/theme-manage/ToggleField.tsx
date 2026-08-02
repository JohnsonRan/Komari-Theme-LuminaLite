import { clsx } from "clsx";
import { MorphIcon, iconData } from "@/components/ui/icons";

type ToggleFieldProps = {
  title: string;
  description: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  className?: string;
};

// 十余处开关行结构完全一致，只有标题/说明/绑定字段不同；样式与无障碍属性改一处即可。
export function ToggleField({
  title,
  description,
  checked,
  onChange,
  className,
}: ToggleFieldProps) {
  return (
    <label
      className={clsx(
        "surface-inset flex items-center justify-between gap-3 px-4 py-3",
        className,
      )}
    >
      <span className="min-w-0">
        <span className="block text-[13px] font-medium text-[var(--text-primary)]">{title}</span>
        <span className="mt-1 block text-[11px] text-[var(--text-tertiary)]">{description}</span>
      </span>
      <span className="relative grid h-11 w-[4.75rem] shrink-0 place-items-center">
        <input
          type="checkbox"
          checked={checked}
          onChange={(event) => onChange(event.target.checked)}
          className="peer absolute inset-0 z-10 cursor-pointer opacity-0"
        />
        <span
          aria-hidden
          className={clsx(
            "pointer-events-none flex h-9 w-[4.25rem] items-center rounded-full border p-[3px] transition-colors duration-200",
            checked
              ? "border-[color-mix(in_srgb,var(--accent-500)_55%,var(--border-subtle))] bg-[color-mix(in_srgb,var(--accent-500)_18%,var(--surface-elev))]"
              : "border-[var(--border-subtle)] bg-[var(--surface-elev)]",
            "peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-[var(--accent-500)]",
          )}
        >
          <span
            className={clsx(
              "grid h-7 w-7 place-items-center rounded-full bg-[var(--surface)] shadow-sm transition-transform duration-200",
              checked && "translate-x-8 text-[var(--accent-500)]",
              !checked && "text-[var(--text-tertiary)]",
            )}
          >
            <MorphIcon
              icon={checked ? iconData.Check : iconData.X}
              size={17}
              strokeWidth={2.4}
              spring="snappy"
            />
          </span>
        </span>
      </span>
    </label>
  );
}
