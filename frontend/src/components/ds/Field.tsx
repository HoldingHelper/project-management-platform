import { cloneElement, isValidElement, useId, type ReactElement, type ReactNode } from "react";

/** Label + control wrapper used by forms. */
export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  const generatedId = useId();
  const controlId = `field-${generatedId.replace(/:/g, "")}`;
  const hintId = `${controlId}-hint`;
  const control = isValidElement(children)
    ? cloneElement(children as ReactElement<{ id?: string; "aria-describedby"?: string }>, {
        id: (children.props as { id?: string }).id ?? controlId,
        "aria-describedby": hint ? hintId : (children.props as { "aria-describedby"?: string })["aria-describedby"],
      })
    : children;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <label htmlFor={(children as ReactElement<{ id?: string }>)?.props?.id ?? controlId} style={{ fontSize: 12, color: "var(--text-secondary)", fontWeight: 650 }}>{label}</label>
      {control}
      {hint && <span id={hintId} style={{ fontSize: 11.5, color: "var(--text-secondary)" }}>{hint}</span>}
    </div>
  );
}
