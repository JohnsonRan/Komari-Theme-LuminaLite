import { clsx } from "clsx";

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
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="h-4 w-4 shrink-0 accent-[var(--accent-500)]"
      />
    </label>
  );
}
