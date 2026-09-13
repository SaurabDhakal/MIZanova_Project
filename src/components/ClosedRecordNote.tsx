/**
 * Why the button that used to be here is gone.
 *
 * A control that simply vanishes reads as a fault, or as a permission somebody
 * has lost and cannot explain. The banner at the top of the record says the
 * child has left; this is the same fact repeated quietly where the decision is
 * actually being made, because somebody four sections down the page has not
 * looked at the top of it for a while.
 *
 * Deliberately one muted line and no colour. It is not a warning — nothing has
 * gone wrong, and the record behaving differently is the correct behaviour.
 * The warning banner is the place that carries the weight.
 */
export default function ClosedRecordNote({ what }: { what: string }) {
  return (
    <p className="mt-3 text-sm text-muted-foreground">
      This child has left the school, so {what} cannot be added. Everything
      already here can still be read, and corrected if it is wrong.
    </p>
  )
}
