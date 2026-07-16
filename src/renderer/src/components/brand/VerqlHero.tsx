import heroUrl from '@/assets/brand/verql-hero.svg?url'

/**
 * Hero variant — the ribbon mark sized up for brand moments (boot splash,
 * welcome page, release notes). Unlike `<VerqlMark>` it carries the brand
 * gradient rather than `currentColor`: the hero is one of the few surfaces
 * the gradient is reserved for, so it does not tint to the active theme.
 * Imported as a URL and consumed as `<img>` for the same "no tricks" reason
 * as the mark.
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
