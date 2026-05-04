type CompassMarkProps = {
  className?: string;
};

export default function CompassMark({ className }: CompassMarkProps) {
  return (
    <svg
      role="img"
      aria-label="Compass"
      viewBox="0 0 120 120"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      <defs>
        <linearGradient id="compassGradient" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="oklch(0.82 0.13 75)" />
          <stop offset="50%" stopColor="oklch(0.72 0.17 50)" />
          <stop offset="100%" stopColor="oklch(0.62 0.14 235)" />
        </linearGradient>
      </defs>
      <circle
        cx="60"
        cy="60"
        r="46"
        fill="url(#compassGradient)"
        opacity="0.18"
      />
      <circle
        cx="60"
        cy="60"
        r="46"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        opacity="0.4"
      />
      <path
        d="M60 24 L68 60 L60 96 L52 60 Z"
        fill="currentColor"
        opacity="0.85"
      />
      <path
        d="M24 60 L60 52 L96 60 L60 68 Z"
        fill="currentColor"
        opacity="0.35"
      />
      <circle cx="60" cy="60" r="4" fill="currentColor" />
    </svg>
  );
}
