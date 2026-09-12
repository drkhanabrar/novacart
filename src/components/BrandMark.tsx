// FILE: src/components/BrandMark.tsx
//
// The NovaCart mark, drawn as SVG.
//
// The auth screens previously loaded /logo.png — a 1.08 MB raster — and scaled
// it down to 32px tall. That is a megabyte of download on the sign-in page for
// something rendered at the size of a postage stamp, and downscaling a large
// bitmap that far is exactly what makes a logo look soft and muddy.
//
// Drawn as vector it is roughly 1 KB, stays sharp on any display, and inherits
// the brand tokens so it adapts to light and dark mode instead of carrying a
// baked-in background that fights whatever sits behind it.
//
// The mark itself: a shopping bag whose handle doubles as an arc, with a
// four-point star ("nova") set in the body. Restrained on purpose — a sign-in
// screen is a moment of hesitation for a customer, and an overworked logo reads
// as amateur exactly where you can least afford it.

export function BrandMark({
  className = "h-10 w-10",
  title = "NovaCart",
}: {
  className?: string;
  title?: string;
}) {
  return (
    <svg
      viewBox="0 0 48 48"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      role="img"
      aria-label={title}
    >
      {/* Rounded badge in the brand poppy. */}
      <rect
        width="48"
        height="48"
        rx="13"
        fill="var(--color-poppy)"
      />

      {/* Bag handle — a simple arc, stroked so it stays crisp when scaled. */}
      <path
        d="M18 18v-2.5a6 6 0 0 1 12 0V18"
        stroke="white"
        strokeWidth="2.6"
        strokeLinecap="round"
        opacity="0.92"
      />

      {/* Bag body. */}
      <path
        d="M13.5 18h21l-1.7 15.2A3.6 3.6 0 0 1 29.2 36.5H18.8a3.6 3.6 0 0 1-3.6-3.3L13.5 18Z"
        fill="white"
        fillOpacity="0.16"
        stroke="white"
        strokeWidth="2.6"
        strokeLinejoin="round"
      />

      {/* The nova: a four-point star with concave sides, which reads as a
          spark rather than a generic asterisk at small sizes. */}
      <path
        d="M24 21.5c.55 2.85 1.3 3.6 4.15 4.15-2.85.55-3.6 1.3-4.15 4.15-.55-2.85-1.3-3.6-4.15-4.15 2.85-.55 3.6-1.3 4.15-4.15Z"
        fill="white"
      />
    </svg>
  );
}

/*
 * Mark plus wordmark, for the auth screens.
 *
 * Centred and vertical rather than the horizontal lockup used in the navbar:
 * a centred card wants a centred stack, and the horizontal version leaves the
 * heading beneath it looking off-axis.
 */
export function BrandLockup({
  className = "",
}: {
  className?: string;
}) {
  return (
    <div className={`flex flex-col items-center gap-3 ${className}`}>
      <BrandMark className="h-12 w-12" />
      <div className="text-center leading-none">
        <span className="text-[19px] font-semibold tracking-[-0.02em] text-ink">
          Nova
        </span>
        <span className="text-[19px] font-semibold tracking-[-0.02em] text-poppy">
          Cart
        </span>
      </div>
    </div>
  );
}
