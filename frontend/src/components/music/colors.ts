/* Music channel accent palette. Keys are the backend `color` contract
   (music/schemas.py CHANNEL_COLORS); values resolve against theme tokens where
   one exists, with fixed fallbacks for the extra hues. */

export const MUSIC_COLORS: Record<string, string> = {
  violet: "var(--accent-primary)",
  gold: "var(--accent-gold)",
  rose: "var(--accent-secondary)",
  teal: "#14b8a6",
  blue: "#3b82f6",
  green: "#22c55e",
};

export function musicAccent(color: string): string {
  return MUSIC_COLORS[color] ?? MUSIC_COLORS.violet;
}

/** The app's established "tinted fancy box" idiom (see ChannelConversation). */
export function musicTint(color: string, pct = 14): string {
  return `color-mix(in srgb, ${musicAccent(color)} ${pct}%, transparent)`;
}
