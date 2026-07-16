import heroUrl from '@/assets/brand/verql-hero.svg?url'

/**
 * Hero variant — the ribbon-V mark sized up. Stays in
 * `currentColor` since it's used inside themed surfaces (welcome page,
 * empty states). Imported as a URL and consumed as `<img>` for the same
 * "no tricks" reason as the mark.
 */
export function VerqlHero({
  size = 120,
  className,
  alt = '',
}: {
  size?: number
  className?: string
  alt?: string
}) {
  return (
    <img
      src={heroUrl}
      width={size}
      height={size}
      alt={alt}
      aria-hidden={alt === '' ? true : undefined}
      className={className}
      draggable={false}
    />
  )
}
