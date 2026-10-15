/**
 * A login name is the person's name in lower case with dots between words ("Zawed Khan" -> "zawed.khan").
 * Same rule as slugify() in the database (migration 0004).
 */
export function toLoginName(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, '.').replace(/^\.+|\.+$/g, '')
}

export const LOGIN_NAME_MIN = 3
