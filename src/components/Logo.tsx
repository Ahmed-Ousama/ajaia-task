/** Ajaia Docs mark: a folded page with text lines on a blue tile (same artwork as app/icon.svg). */
export function LogoMark({ size = 36, className = "" }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" className={className} aria-hidden>
      <defs>
        <linearGradient id="ajaia-logo-bg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#3b82f6" />
          <stop offset="1" stopColor="#4f46e5" />
        </linearGradient>
      </defs>
      <rect width="32" height="32" rx="8" fill="url(#ajaia-logo-bg)" />
      <path d="M11 6.5h7.5L24 12v12.5a1.5 1.5 0 0 1-1.5 1.5H11a1.5 1.5 0 0 1-1.5-1.5V8A1.5 1.5 0 0 1 11 6.5z" fill="#fff" />
      <path d="M18.5 6.5V11a1 1 0 0 0 1 1H24z" fill="#c7d2fe" />
      <rect x="12.5" y="15" width="8.5" height="1.8" rx=".9" fill="#4f46e5" />
      <rect x="12.5" y="18.6" width="8.5" height="1.8" rx=".9" fill="#93c5fd" />
      <rect x="12.5" y="22.2" width="5.5" height="1.8" rx=".9" fill="#93c5fd" />
    </svg>
  );
}

/** Mark + wordmark. */
export default function Logo({ size = 36, light = false }: { size?: number; light?: boolean }) {
  return (
    <span className="flex items-center gap-2.5">
      <LogoMark size={size} />
      <span className={`text-lg font-semibold tracking-tight ${light ? "text-white" : "text-gray-900"}`}>
        Ajaia <span className={light ? "font-normal text-blue-100" : "font-normal text-gray-500"}>Docs</span>
      </span>
    </span>
  );
}
