import StaffMessages from '../../components/StaffMessages'

/**
 * A school administrator's inbox.
 *
 * ---------------------------------------------------------------------------
 * IT ONLY WORKS IN ONE DIRECTION, AND THE SCREEN SAYS SO
 * ---------------------------------------------------------------------------
 * `start_message_thread` in db/009 requires the OTHER person to be a guardian
 * or an educator of that child. A school admin is neither — they reach a
 * student through their school, not through an assignment — so nobody can
 * open a conversation WITH them. They can open one with any family or teacher
 * at their school, and replies come back here.
 *
 * That is a real limitation and it is left in place rather than widened. The
 * rule is what stops a member of staff at one school messaging a family at
 * another, and loosening it to make this inbox symmetrical would be changing a
 * privacy boundary to suit a screen. What the screen owes the person instead is
 * the truth: hence the note, so an administrator does not sit waiting for
 * messages that can never arrive.
 *
 * ---------------------------------------------------------------------------
 * THE PICKER LISTS THE WHOLE SCHOOL
 * ---------------------------------------------------------------------------
 * `fetchStudents()` is uncapped and a school admin's RLS reaches every active
 * student at their school, where an educator's reaches a class. At the size
 * this product is tested at that is a few names; at four hundred it is a select
 * element nobody can use. Worth fixing when it bites, and it wants a searchable
 * picker shared by all three staff inboxes rather than something bolted on
 * here.
 */
export default function SchoolAdminMessages() {
  return (
    <StaffMessages
      subtitle="Conversations with families and staff about students at your school."
      emptyTitle="No students at your school yet"
      emptyDetail="Messaging is organised around a student, so it becomes available once students are added from Directory & Access."
      note="You can start a conversation with any family or teacher at your school, and their replies arrive here. They cannot start one with you — messaging is organised around a child, and it reaches the people assigned to that child. If a family needs to reach the office, that is still a phone call."
    />
  )
}
