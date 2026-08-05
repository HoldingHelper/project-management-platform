import type { TextareaHTMLAttributes } from "react";

export function TextArea({ style, ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      {...rest}
      style={{
        width: "100%",
        minHeight: 118,
        resize: "vertical",
        padding: "10px 12px",
        borderRadius: "var(--radius-2)",
        border: "1px solid var(--border-default)",
        background: "var(--surface-2)",
        color: "var(--text-primary)",
        fontFamily: "var(--font-sans)",
        fontSize: 13.5,
        lineHeight: "20px",
        outline: "none",
        ...style,
      }}
    />
  );
}
