import StaffMessages from '../../components/StaffMessages'

/**
 * An educator's inbox. The screen itself is shared with the specialist's — see
 * StaffMessages for why one component serves both.
 */
export default function EducatorMessages() {
  return (
    <StaffMessages
      subtitle="Conversations with families about the students you support."
      emptyTitle="No students assigned to you yet"
      emptyDetail="Messaging is organised around a student, so it becomes available once you are assigned to one."
    />
  )
}
