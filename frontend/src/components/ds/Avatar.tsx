import { avatarHue, displayName, initials } from "@/lib/format";

interface Props {
  name: string;
  size?: number;
}

export function Avatar({ name, size = 28 }: Props) {
  const label = displayName(name);
  const hue = avatarHue(label);
  const accent = `hsl(${hue}, 38%, 46%)`;
  return (
    <span
      title={label}
      style={{
        width: size,
        height: size,
        flexShrink: 0,
        borderRadius: "50%",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: Math.round(size * 0.38),
        fontWeight: 600,
        color: "var(--text-primary)",
        background: `linear-gradient(135deg, color-mix(in srgb, ${accent} 28%, var(--surface-2)), var(--surface-3))`,
        border: `1px solid color-mix(in srgb, ${accent} 38%, var(--border-default))`,
        fontFamily: "var(--font-sans)",
        userSelect: "none",
      }}
    >
      {initials(label)}
    </span>
  );
}
