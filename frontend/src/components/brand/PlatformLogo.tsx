import { useId, type CSSProperties } from "react";

export function PlatformLogo({ size = 32, style }: { size?: number; style?: CSSProperties }) {
  const gradientId = useId();
  return (
    <span
      className="platform-logo"
      aria-hidden="true"
      style={{ width: size, height: size, ...style }}
    >
      <svg viewBox="0 0 40 40" role="presentation">
        <defs>
          <linearGradient id={gradientId} x1="5" y1="34" x2="34" y2="5" gradientUnits="userSpaceOnUse">
            <stop stopColor="#2563FF" />
            <stop offset="1" stopColor="#06B6EE" />
          </linearGradient>
        </defs>
        <path d="M5 23.5 17.5 11 24 17.5 11.5 30H5v-6.5Z" fill="#0B1F4D" />
        <path d="M15.5 30 29.5 16H35v8L24.5 34.5 15.5 30Z" fill={`url(#${gradientId})`} />
        <path d="M5 8h9l21 21v6h-8L5 13V8Z" fill={`url(#${gradientId})`} />
      </svg>
    </span>
  );
}
