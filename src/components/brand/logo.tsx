import { cn } from "@/lib/utils"

/**
 * FLUX.AI brand mark.
 *
 * Palette:
 *   navy   #0B1E3F  — "FLUX"
 *   cyan   #22D3EE  — ".AI" + accent glow
 *   green  #10B981  — circuit / growth accent
 */

export function LogoMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 48 48"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={cn("h-8 w-8", className)}
      aria-hidden
    >
      <defs>
        <linearGradient id="flux-arrow" x1="0" y1="48" x2="48" y2="0" gradientUnits="userSpaceOnUse">
          <stop stopColor="#22D3EE" />
          <stop offset="1" stopColor="#10B981" />
        </linearGradient>
      </defs>
      {/* rounded tile */}
      <rect width="48" height="48" rx="10" fill="#0B1E3F" />
      {/* circuit nodes */}
      <circle cx="10" cy="24" r="1.6" fill="#22D3EE" />
      <circle cx="38" cy="14" r="1.6" fill="#10B981" />
      <path d="M10 24 L16 24 M32 24 L38 24" stroke="#22D3EE" strokeWidth="1.2" strokeLinecap="round" />
      {/* stylised R */}
      <path
        d="M17 34 V14 H26 A6 6 0 0 1 26 26 H21 L28 34"
        stroke="#22D3EE"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      {/* growth arrow */}
      <path
        d="M30 32 L40 18 M40 18 H33 M40 18 V25"
        stroke="url(#flux-arrow)"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </svg>
  )
}

export function LogoWordmark({
  className,
  variant = "dark",
  showTagline = false,
}: {
  className?: string
  variant?: "dark" | "light"
  showTagline?: boolean
}) {
  const fluxColor = variant === "light" ? "text-white" : "text-[#0B1E3F]"
  const taglineColor = variant === "light" ? "text-cyan-200/80" : "text-gray-500"
  return (
    <div className={cn("flex flex-col leading-tight", className)}>
      <div className="flex items-baseline">
        <span className={cn("font-extrabold tracking-tight", fluxColor)}>FLUX</span>
        <span className="font-extrabold tracking-tight text-cyan-400">.AI</span>
      </div>
      {showTagline && (
        <span className={cn("text-[9px] uppercase tracking-[0.2em] mt-0.5", taglineColor)}>
          HR Expenses &amp; Intelligence
        </span>
      )}
    </div>
  )
}

export function Logo({
  className,
  variant = "dark",
  showTagline = false,
  size = "md",
}: {
  className?: string
  variant?: "dark" | "light"
  showTagline?: boolean
  size?: "sm" | "md" | "lg"
}) {
  const mark = { sm: "h-7 w-7", md: "h-9 w-9", lg: "h-11 w-11" }[size]
  const word = { sm: "text-lg", md: "text-xl", lg: "text-2xl" }[size]
  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      <LogoMark className={mark} />
      <LogoWordmark variant={variant} showTagline={showTagline} className={word} />
    </div>
  )
}
