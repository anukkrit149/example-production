/**
 * The style code is printed on every physical label, so it has to be short,
 * unambiguous and typeable: 2 to 12 characters, uppercase letters, digits and
 * hyphens, starting with a letter. Lowercase input is accepted and uppercased
 * because a merchandiser will type "lj-204" and mean "LJ-204".
 */
export const STYLE_CODE_RE = /^[A-Z][A-Z0-9-]{1,11}$/

export const normalizeStyleCode = (input: string): string => input.trim().toUpperCase()

export const isStyleCode = (input: string): boolean => STYLE_CODE_RE.test(normalizeStyleCode(input))
