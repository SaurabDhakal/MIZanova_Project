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
