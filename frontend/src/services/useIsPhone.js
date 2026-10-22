// True on a phone-sized screen (under 600 px wide), using React Responsive. 600 px is also
// where MUI's "sm" size starts, so this agrees with the sx={{ xs: ..., sm: ... }} sizes.
// Pages use it where a phone shows something different (a menu button, cards instead of a table).
import { useMediaQuery } from 'react-responsive'

export const PHONE_MAX_WIDTH = 599

export function useIsPhone() {
  return useMediaQuery({ maxWidth: PHONE_MAX_WIDTH })
}
