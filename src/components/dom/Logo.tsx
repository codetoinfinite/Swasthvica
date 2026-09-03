export default function Logo({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" fill="none" className={className} aria-hidden>
      {/* open gold ring, gap at top for the dot */}
      <path
        d="M 36.5 5.6 A 27 27 0 1 1 27.5 5.6"
        stroke="#c9a24a"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
      {/* dew-drop dot at 12 o'clock */}
      <circle cx="32" cy="4.5" r="2.6" fill="#c9a24a" />
      {/* leaf sprig */}
      <g stroke="#4e5d3b" strokeWidth="1.6" strokeLinecap="round" fill="#4e5d3b">
        <path d="M32 48 V 20" fill="none" />
        <path d="M32 26 C 26 24 22 19 22 14 C 28 15 31 19 32 24 Z" strokeWidth="0.5" />
        <path d="M32 26 C 38 24 42 19 42 14 C 36 15 33 19 32 24 Z" strokeWidth="0.5" />
        <path d="M32 35 C 27 33.5 24 30 23.5 26 C 28.5 27 31 30.5 32 33.5 Z" strokeWidth="0.5" />
        <path d="M32 35 C 37 33.5 40 30 40.5 26 C 35.5 27 33 30.5 32 33.5 Z" strokeWidth="0.5" />
        <path d="M32 43 C 28 42 25.5 39.5 25 36.5 C 29 37.5 31 40 32 42 Z" strokeWidth="0.5" />
        <path d="M32 43 C 36 42 38.5 39.5 39 36.5 C 35 37.5 33 40 32 42 Z" strokeWidth="0.5" />
      </g>
    </svg>
  );
}
