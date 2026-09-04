import Messenger from '../../components/Messenger'
import { useSelectedChild } from '../../hooks/useMyChildren'
import ChildSwitcher from '../../components/ChildSwitcher'
import { ErrorState, LoadingCards } from '../../components/QueryState'
import NoChildYet from '../../components/NoChildYet'

/**
 * Parent messaging - docs/Figma Pages Design/Parent Messages.png.
 * Text only in v1.
 */
export default function ParentMessages() {
  const { children, child, selectChild, isPending, isError, error } =
    useSelectedChild()

  if (isPending) return <LoadingCards count={2} />

  /*
   * A FAILED LOOKUP IS NOT AN EMPTY ONE, and this screen was the only parent
   * page that treated them the same.
   *
   * `isError` was ignored, so a lookup that failed left `child` undefined and
   * fell through to NoChildYet — which tells a family "Your account is set up.
   * No child is linked to it yet" and offers them a Link a child button.
   *
   * That is a confident false statement about their own child, made to the
   * person least able to check it, and it sends them back through a linking
   * flow they have already completed. Every other parent screen handles this;
   * this one did not.
   */
  if (isError) {
    return (
      <ErrorState
        message={
          error?.message ??
          'Your children could not be loaded. This is a problem reaching the server, not a change to who is linked to your account.'
        }
      />
    )
  }

  if (!child) {
    return (
      <NoChildYet thing="Messages with the care team" />
    )
  }

  return (
    <div>
      <header className="mb-6">
        <h1 className="text-title text-foreground">Messages</h1>
        <p className="mt-1 text-muted-foreground">
          Talk to the people supporting {child.display_name} at school.
        </p>
      </header>

      <ChildSwitcher children={children} child={child} onSelect={selectChild} />


      <Messenger studentId={child.id} />

      {/* THIS SAID "cannot be edited or deleted once sent", AND HALF OF THAT
          WAS FALSE. Messenger gates Unsend on `mine && !deleted && within 15
          minutes` and on nothing else — no role check — so a family has always
          had the same fifteen minutes the staff screens tell their own users
          about. A parent who sent something about their child by mistake was
          being told it was permanent, and would never have looked for the
          button sitting on their own message. The half that was true is that
          nothing can be EDITED; that stays. */}
      <p className="mt-4 max-w-prose text-xs text-muted-foreground">
        Messages are stored with your child&rsquo;s records. You can unsend your
        own message for 15 minutes after sending it — the conversation then
        shows &ldquo;Message unsent&rdquo; in its place, so the school can see
        something was withdrawn rather than the message quietly vanishing. A
        message cannot be edited: send a correction as a new message. This is
        not a channel for emergencies; contact the school directly if something
        is urgent.
      </p>
    </div>
  )
}
