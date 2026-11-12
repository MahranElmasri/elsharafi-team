"use client";

/** An on/off switch (`role=switch`) in the ink style. The caller saves the change. */
export function Switch({
  on,
  label,
  describedBy,
  disabled,
  onToggle,
}: {
  on: boolean;
  label: string;
  describedBy?: string;
  disabled?: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      aria-describedby={describedBy}
      disabled={disabled}
      onClick={onToggle}
      className={`relative h-7 w-12 shrink-0 rounded-full border-2 border-ink transition-colors disabled:opacity-60 ${on ? "bg-ink" : "bg-sheet"}`}
    >
      <span
        aria-hidden
        className={`absolute top-0.5 size-5 rounded-full transition-[left] ${on ? "left-[22px] bg-on-ink" : "left-0.5 bg-ink"}`}
      />
    </button>
  );
}
