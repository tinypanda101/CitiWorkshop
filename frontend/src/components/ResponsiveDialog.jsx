// An MUI Dialog that fills the screen on phones, with a ✕ in the corner and its buttons kept at
// the bottom (the form inside stretches, so its content scrolls and DialogActions stay put).
// On larger screens it's an ordinary Dialog. Use it like Dialog; `closeButton={false}` for a
// popup that draws its own ✕.
import { Dialog, IconButton } from '@mui/material'
import CloseIcon from '@mui/icons-material/Close'
import { useIsPhone } from '../services/useIsPhone'

export default function ResponsiveDialog({ children, onClose, closeButton = true, ...props }) {
  const isPhone = useIsPhone()
  const phonePaper = { '& > form': { display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 } }
  return (
    <Dialog onClose={onClose} {...props} fullScreen={isPhone} slotProps={{ paper: { sx: isPhone ? phonePaper : undefined } }}>
      {isPhone && closeButton && onClose && (
        <IconButton aria-label="Close" onClick={onClose} sx={{ position: 'absolute', top: 8, right: 8, zIndex: 1 }}>
          <CloseIcon />
        </IconButton>
      )}
      {children}
    </Dialog>
  )
}
