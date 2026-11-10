import type { CSSProperties } from "react";

/** One entry: an ink stamp when approved, a dashed pencil circle when pending. */
export function Stamp({
  letter,
  color,
  pending = false,
  half = null,
  tilt = 0,
  showHalfMark = true,
}: {
  letter: string;
  color: string; // a colour token such as "--urlaub"
  pending?: boolean;
  half?: "am" | "pm" | null;
  tilt?: number;
  showHalfMark?: boolean;
}) {
  const cls = ["stamp", pending && "pending", half, letter.length > 1 && "two"]
    .filter(Boolean)
    .join(" ");
  const style = { "--c": `var(${color})`, "--r": `${tilt}deg` } as CSSProperties;
  return (
    <span className={cls} style={style} aria-hidden>
      {half && showHalfMark && <i className="half-mark not-italic">½</i>}
      {letter}
    </span>
  );
}
