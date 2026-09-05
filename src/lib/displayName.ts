/**
 * Ending a sentence with a child's name.
 *
 * `students.display_name` is a GENERATED column (db/002). It is the parent-safe
 * form of the name — first name plus the surname's initial — and the initial
 * carries its own full stop: "Felix A.". Four screens ended a sentence with it
 * and added a second, so the family's own home screen read
 *
 *     Here is the latest on Felix A..
 *
 * on its most prominent line, in the product a parent trusts with their child's
 * record. Not a crash, not caught by a type, and visible to every family.
 *
 * A BLANKET TRIM WOULD BE WRONG. The generated column deliberately omits the
 * stop when there is no surname to take an initial from — its own comment says
 * the `case` exists "so we never render 'Ethan .'" — so a child recorded with
 * one name renders as "Ethan", and a sentence ending there still needs its
 * punctuation. The test is what the string actually ends with, not what we
 * expect it to be.
 */
export function withFullStop(name: string): string {
  return /[.!?]$/.test(name.trimEnd()) ? name : `${name}.`
}

/**
 * A child's full name, for the family that child belongs to.
 *
 * ---------------------------------------------------------------------------
 * THIS REVERSES A DECISION db/002 MARKED "LOCKED", DELIBERATELY
 * ---------------------------------------------------------------------------
 * That migration generates `display_name` as "Ethan M." and its comment says
 * parents see first name plus initial only. The rule was written to stop one
 * family ever reading another family's surname, and for that job it is right
 * and it stays: `display_name` remains the only name on any screen that can
 * show more than one household's children.
 *
 * Applied uniformly, though, it also shortened a child's name for the people
 * who named them. A parent read "Ethan M." on every screen about their own son,
 * and on a page headed "About your child" that stops looking like a privacy
 * measure and starts looking like a defect.
 *
 * WHY IT IS SAFE HERE, WHICH IS THE ONLY REASON IT IS BEING DONE. RLS decides
 * which rows arrive, not the screen: `students_select` is `can_view_student(id)`
 * and a guardian satisfies that only through `is_guardian_of()`. A parent's
 * query has never been able to return another family's child, so the full name
 * of a row a parent already holds tells them nothing they did not know before
 * the software existed. The generated column was a second belt around a rule
 * the database was already keeping.
 *
 * USE IT ONLY ON PARENT SCREENS. Staff screens keep their own naming: an
 * educator's roster is many families at once, which is the case display_name
 * was built for.
 */
export function fullName(child: {
  first_name: string
  last_name: string
}): string {
  const last = child.last_name?.trim() ?? ''
  return last === '' ? child.first_name.trim() : `${child.first_name.trim()} ${last}`
}
