/**
 * Everyone signs in with a 4-digit PIN. Supabase wants a longer password, so a fixed ending is added behind
 * the scenes (the same rule is in netlify/functions/members.mjs). People only ever type the 4 digits.
 */
export const isPin = (text: string) => /^\d{4}$/.test(text)
export const pinToPassword = (pin: string) => `${pin}-family-manager`
