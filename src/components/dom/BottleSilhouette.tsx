export default function BottleSilhouette({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 100 220" className={className} aria-hidden>
      <path
        d="M44 6 h12 v10 h-4 v14 h14 v10 h-32 v-10 h14 V16 h-4 Z
           M32 44 h36 c0 0 2 8 2 14 v130 a10 10 0 0 1 -10 10 h-20 a10 10 0 0 1 -10 -10 V58 c0 -6 2 -14 2 -14 Z"
        fill="currentColor"
      />
      <path d="M56 8 h16 l-3 6 h-13 Z" fill="currentColor" />
    </svg>
  );
}
