"use client";

type Size = "sm" | "md" | "lg";

const SIZE_PX: Record<Size, number> = { sm: 20, md: 28, lg: 40 };
const FRAME_PX: Record<Size, number> = { sm: 32, md: 44, lg: 56 };

type Props = {
  size?: Size;
  framed?: boolean;
  className?: string;
  "aria-hidden"?: boolean;
};

// Roue de barre (helm) façon Kubernetes : 7 rayons, moyeu central, hexagone.
function Wheel() {
  const spokes = Array.from({ length: 7 }, (_, i) => i);
  return (
    <svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" width="100%" height="100%" aria-hidden>
      {/* Hexagone extérieur */}
      <path
        d="M24 4 L41.3 14 L41.3 34 L24 44 L6.7 34 L6.7 14 Z"
        stroke="currentColor"
        strokeWidth="1.1"
        opacity="0.35"
        strokeLinejoin="round"
      />
      <g className="kubehub-logo-spin">
        {/* Anneau du gouvernail */}
        <circle cx="24" cy="24" r="12.5" stroke="currentColor" strokeWidth="1.4" opacity="0.75" />
        <circle cx="24" cy="24" r="4.2" stroke="currentColor" strokeWidth="1.4" opacity="0.9" />
        {spokes.map((i) => {
          const angle = (i * 360) / 7 - 90;
          const rad = (angle * Math.PI) / 180;
          const x1 = 24 + Math.cos(rad) * 4.2;
          const y1 = 24 + Math.sin(rad) * 4.2;
          const x2 = 24 + Math.cos(rad) * 15.5;
          const y2 = 24 + Math.sin(rad) * 15.5;
          const nx = 24 + Math.cos(rad) * 12.5;
          const ny = 24 + Math.sin(rad) * 12.5;
          return (
            <g key={i}>
              <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="currentColor" strokeWidth="1.2" opacity="0.7" strokeLinecap="round" />
              <circle cx={nx} cy={ny} r="1.5" fill="currentColor" className="kubehub-logo-node" style={{ animationDelay: `${i * 0.25}s` }} />
            </g>
          );
        })}
      </g>
      <circle cx="24" cy="24" r="1.6" fill="currentColor" />
    </svg>
  );
}

export function KubeHubLogo({ size = "md", framed = false, className = "", ...rest }: Props) {
  const px = SIZE_PX[size];
  const frame = FRAME_PX[size];

  const inner = (
    <span style={{ width: px, height: px }} className="inline-flex" aria-hidden={rest["aria-hidden"] ?? true}>
      <Wheel />
    </span>
  );

  if (!framed) {
    return <span className={`inline-flex shrink-0 ${className}`}>{inner}</span>;
  }

  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground ${className}`}
      style={{ width: frame, height: frame }}
    >
      {inner}
    </span>
  );
}

export function KubeHubBrand({
  size = "md",
  showText = true,
  className = "",
}: {
  size?: Size;
  showText?: boolean;
  className?: string;
}) {
  return (
    <span className={`inline-flex items-center gap-2.5 ${className}`}>
      <KubeHubLogo size={size} framed />
      {showText && <span className="text-sm font-semibold tracking-tight text-foreground">KubeHub</span>}
    </span>
  );
}

export function KubeHubHero({ size = 280 }: { size?: number }) {
  return (
    <div className="relative text-primary" style={{ width: size, height: size }}>
      <div className="absolute inset-0 flex items-center justify-center">
        <span style={{ width: size * 0.8, height: size * 0.8 }} className="inline-flex">
          <Wheel />
        </span>
      </div>
    </div>
  );
}
