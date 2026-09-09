import { useEffect, useRef, useState } from 'react'

/**
 * Content that arrives as it comes into view.
 *
 * ---------------------------------------------------------------------------
 * WHY THIS IS ALLOWED WHEN ALMOST NO OTHER MOTION IS
 * ---------------------------------------------------------------------------
 * The rule this product holds to is that motion has to do a job. A scroll
 * reveal does one: a long marketing page is a sequence, and a section that
 * settles as it arrives tells the eye where the next thing starts. It is the
 * cheapest way to make a page feel composed rather than dumped.
 *
 * It is also the effect most easily overdone, so it is deliberately small:
 * fourteen pixels of rise, four hundred milliseconds, exponential ease-out,
 * and it happens ONCE. No parallax, no scale, no horizontal drift, nothing
 * that re-plays when you scroll back up. A section that re-animates every time
 * it crosses the fold stops being furniture and starts being a distraction.
 *
 * ---------------------------------------------------------------------------
 * IT IS NEVER ALLOWED TO HIDE ANYTHING PERMANENTLY
 * ---------------------------------------------------------------------------
 * This is the failure mode of every reveal-on-scroll implementation: content
 * starts at opacity 0, the observer never fires — because JavaScript failed,
 * or the element was already on screen at load, or the browser has no
 * IntersectionObserver — and the page is simply blank. The content is in the
 * DOM, the crawler sees it, the human sees nothing.
 *
 * Three things stop that here:
 *
 *   1. `useState(false)` plus an effect that fires on mount. If the element is
 *      already in view when the observer attaches, IntersectionObserver calls
 *      back immediately — it does not wait for a scroll event.
 *   2. If the API is missing, the constructor is never called and `shown` is
 *      set to true outright.
 *   3. Reduced motion skips the whole mechanism and renders the content
 *      plainly, because the preference is a request for less movement and this
 *      is movement.
 */
export default function Reveal({
  children,
  /** Stagger inside a group. Kept small: 70ms between siblings reads as one
      movement with a direction; 200ms reads as a queue you wait for. */
  delayMs = 0,
  className,
  /**
   * THE ELEMENT THIS RENDERS AS, AND WHY IT IS NOT ALWAYS A DIV.
   *
   * Most of these wrap a section or a block, where a div is right. Inside a
   * list it is not: a <ul> may contain nothing but <li>, so wrapping each card
   * in a revealing div produces invalid markup and hands a screen reader a
   * list whose items are not items. Passing as="li" puts the animation on the
   * list item itself, which is where it belonged anyway.
   */
  as: Tag = 'div',
}: {
  children: React.ReactNode
  delayMs?: number
  className?: string
  as?: 'div' | 'li'
}) {
  const ref = useRef<HTMLElement>(null)

  /*
   * DECIDED DURING RENDER, NOT INSIDE THE EFFECT.
   *
   * The obvious shape for this is useState(false) plus an effect that calls
   * setShown(true) when the preference is set or the API is missing — and the
   * react-hooks lint rule rejects it, correctly: a synchronous setState in an
   * effect renders once with the content hidden and then again to reveal it,
   * which is a cascading render and, for one frame, a blank section.
   *
   * A lazy initialiser answers the same question before the first paint. The
   * effect is then left doing only what an effect is for: subscribing to an
   * external thing and setting state when that thing calls back.
   */
  const [shown, setShown] = useState(() => {
    if (typeof window === 'undefined') return true
    if (typeof IntersectionObserver === 'undefined') return true
    return Boolean(
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches,
    )
  })

  useEffect(() => {
    if (shown) return
    const el = ref.current
    if (!el) return

    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue
          setShown(true)
          io.disconnect()
        }
      },
      /* A negative bottom margin so a section starts moving slightly before its
         top edge reaches the fold, rather than after the reader is already
         looking at it. */
      { rootMargin: '0px 0px -12% 0px', threshold: 0.05 },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [shown])

  return (
    <Tag
      ref={ref as React.Ref<HTMLDivElement & HTMLLIElement>}
      className={className}
      style={{
        opacity: shown ? 1 : 0,
        transform: shown ? 'none' : 'translateY(14px)',
        transition: `opacity 400ms cubic-bezier(0.23, 1, 0.32, 1) ${delayMs}ms, transform 400ms cubic-bezier(0.23, 1, 0.32, 1) ${delayMs}ms`,
      }}
    >
      {children}
    </Tag>
  )
}
