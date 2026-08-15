import StaffMessages from '../../components/StaffMessages'

/**
 * A specialist's inbox.
 *
 * WHY THIS EXISTS AT ALL. A specialist was already a participant in threads —
 * `start_message_thread` in db/009 puts any two members of a child's care team
 * in one, and `fetchCareTeam` offers specialists as people to write to. There
 * was simply no screen to read the reply on: the role's sidebar had Caseload,
 * Review Queue, Schedule and Resources and nothing else. A parent could message
 * their child's speech pathologist and be met with silence forever, with the
 * message sitting unread in a table.
 *
 * Found by building the notification bell, which counts unread conversations
 * and had to leave a specialist's out because there was nowhere to send them.
 *
 * The empty state matches Caseload's wording deliberately — the two screens
 * become empty for exactly the same reason, and an unverified specialist sees
 * nothing on either.
 */
export default function SpecialistMessages() {
  return (
    <StaffMessages
      subtitle="Conversations with families and staff about the students on your caseload."
      emptyTitle="No students on your caseload"
      emptyDetail="Messaging is organised around a student. A school administrator adds students to your caseload from Directory & Access — and if your own account is not verified, nothing would be visible even if there were."
    />
  )
}
