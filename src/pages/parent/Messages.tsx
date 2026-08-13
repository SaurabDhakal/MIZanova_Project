import Messenger from '../../components/Messenger'
import { useSelectedChild } from '../../hooks/useMyChildren'
import ChildSwitcher from '../../components/ChildSwitcher'
import { LoadingCards } from '../../components/QueryState'
import NoChildYet from '../../components/NoChildYet'

/**
 * Parent messaging - docs/Figma Pages Design/Parent Messages.png.
 * Text only in v1.
 */
export default function ParentMessages() {
  const { children, child, selectChild, isPending } = useSelectedChild()

  if (isPending) return <LoadingCards count={2} />

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

      <p className="mt-4 max-w-prose text-xs text-muted-foreground">
        Messages are stored with your child&rsquo;s records and cannot be edited
        or deleted once sent - corrections are sent as a new message. This is
        not a channel for emergencies; contact the school directly if something
        is urgent.
      </p>
    </div>
  )
}
