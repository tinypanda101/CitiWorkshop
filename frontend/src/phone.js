// Phone numbers are saved in the international form: "+" then the country code and number,
// e.g. "+15552011234". These helpers split one into its parts and show it readably.

export const COUNTRIES = [
  { code: '1', name: 'US / Canada' }, { code: '44', name: 'UK' }, { code: '353', name: 'Ireland' },
  { code: '33', name: 'France' }, { code: '49', name: 'Germany' }, { code: '91', name: 'India' },
  { code: '61', name: 'Australia' }, { code: '65', name: 'Singapore' }, { code: '81', name: 'Japan' },
  { code: '86', name: 'China' },
]

// "+447946095800" -> { code: '44', number: '7946095800' }. Longest codes are tried first,
// so +353 isn't read as +35. A number with no known code is treated as +1.
export function splitPhone(value) {
  const digits = (value || '').replace(/\D/g, '')
  const byLength = [...COUNTRIES].sort((a, b) => b.code.length - a.code.length)
  const country = byLength.find((c) => digits.startsWith(c.code))
  return country ? { code: country.code, number: digits.slice(country.code.length) } : { code: '1', number: digits }
}

// "+15552011234" -> "+1 555 201 1234"; other countries in groups of 4: "+44 7946 0958 00".
export function formatPhone(value) {
  if (!value) return ''
  const { code, number } = splitPhone(value)
  const groups = code === '1' && number.length === 10
    ? [number.slice(0, 3), number.slice(3, 6), number.slice(6)]
    : number.match(/.{1,4}/g) || []
  return `+${code} ${groups.join(' ')}`
}
