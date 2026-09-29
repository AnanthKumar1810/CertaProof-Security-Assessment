import React from "react";

interface EvidenceSealProps {
  size?: number;
  variant?: "navy-teal" | "dark" | "light" | "single-color";
  className?: string;
  ariaHidden?: boolean;
  ariaLabel?: string;
}

export function EvidenceSeal({
  size = 28,
  variant = "navy-teal",
  className = "",
  ariaHidden = true,
  ariaLabel = "CertaProof Evidence Seal",
}: EvidenceSealProps) {
  // Variant color definitions
  // navy-teal: Navy outer C-ring (#111C2D) with vibrant Teal checkmark (#087F78) and document fold
  // dark: White/silver outer ring with teal checkmark for dark sidebar backgrounds
  // light: Dark navy outer ring with deep teal checkmark for light surfaces
  // single-color: uses currentColor
  const ringColor =
    variant === "dark"
      ? "#E2E8F0"
      : variant === "single-color"
      ? "currentColor"
      : "#111C2D";

  const tealColor =
    variant === "dark"
      ? "#14B8A6"
      : variant === "single-color"
      ? "currentColor"
      : "#087F78";

  const foldColor =
    variant === "dark"
      ? "#2DD4BF"
      : variant === "single-color"
      ? "currentColor"
      : "#0EA5E9";

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      role={ariaHidden ? "presentation" : "img"}
      aria-hidden={ariaHidden ? "true" : undefined}
      aria-label={ariaHidden ? undefined : ariaLabel}
    >
      {/* Outer C-shaped Boundary Ring representing the assessment perimeter */}
      {/* Path curves around from upper-right document corner, through top, left, bottom, to lower-right */}
      <path
        d="M23.5 6.5H16C8.82 6.5 3 12.32 3 19.5C3 26.68 8.82 32.5 16 32.5C23.18 32.5 29 26.68 29 19.5C29 18.2 28.8 16.94 28.43 15.75"
        stroke={ringColor}
        strokeWidth="2.75"
        strokeLinecap="round"
        transform="scale(0.85) translate(2.5, 0.5)"
      />

      {/* Document fold corner in upper right negative space */}
      <path
        d="M21 3L27 9M27 9H22C21.4477 9 21 8.55228 21 8V3Z"
        fill="none"
        stroke={foldColor}
        strokeWidth="1.75"
        strokeLinejoin="round"
        strokeLinecap="round"
      />

      {/* Connected Proof Checkmark resolving incoming signal into confirmed evidence */}
      <path
        d="M8.5 16.25L13.25 21L23.5 10.75"
        stroke={tealColor}
        strokeWidth="2.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {/* Signal entry pip indicating structured data ingestion */}
      <circle cx="8.5" cy="16.25" r="1.5" fill={tealColor} />
    </svg>
  );
}

export function BrandLockup({
  variant = "dark",
  compact = false,
  className = "",
}: {
  variant?: "navy-teal" | "dark" | "light";
  compact?: boolean;
  className?: string;
}) {
  const isDark = variant === "dark";
  return (
    <div
      className={`inline-flex items-center gap-3 select-none ${className}`}
      aria-label="CertaProof: Evidence-based security assessment"
    >
      <div className="flex-shrink-0 flex items-center justify-center p-1 rounded-lg">
        <EvidenceSeal size={compact ? 24 : 30} variant={variant} ariaHidden={true} />
      </div>
      <div>
        <div className="flex items-center gap-2">
          <span
            className={`font-semibold tracking-tight ${
              isDark ? "text-white" : "text-[#172435]"
            } ${compact ? "text-base" : "text-lg"}`}
            style={{ fontFamily: "'Inter', sans-serif" }}
          >
            CertaProof
          </span>
        </div>
        {!compact && (
          <div
            className={`text-xs ${
              isDark ? "text-[#8899A6]" : "text-[#526176]"
            } font-normal mt-0.5`}
            style={{ fontFamily: "'Inter', sans-serif" }}
          >
            Evidence-based security assessment
          </div>
        )}
      </div>
    </div>

  );
}
