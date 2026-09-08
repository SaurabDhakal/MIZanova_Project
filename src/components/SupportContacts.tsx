/**
 * Who to call. The three lines, and only the three lines.
 *
 * ---------------------------------------------------------------------------
 * THE NUMBERS ARE SHARED, THE SENTENCE ABOVE THEM IS NOT
 * ---------------------------------------------------------------------------
 * These are a statement made to somebody in distress, and BACKLOG.md has them
 * waiting on Special Miles to sign off. A number written in two files is a
 * number that will be corrected in one of them, so they live here once.
 *
 * What is deliberately NOT here is the paragraph that introduces them, because
 * it cannot be the same in both places and being wrong about this would matter.
 * The individual's version says "nobody has been told and nothing has been
 * reported", which is true of somebody with no school. It is FALSE of a parent:
 * db/007 shows a home observation to the child's assigned staff the moment it
 * is written, so the school has already read what they wrote. Reassuring them
 * otherwise would be a lie told at the worst possible moment.
 */
export default function SupportContacts() {
  return (
    <ul className="mt-2 space-y-1 text-sm text-foreground">
      <li>
        <strong>Lifeline</strong> &mdash; 13 11 14, any time, any day.
      </li>
      <li>
        <strong>Emergency</strong> &mdash; 000, if someone is in danger right
        now.
      </li>
      <li>Your GP, for anything that needs a proper look.</li>
    </ul>
  )
}
