import { AnimatePresence, motion } from 'framer-motion'
import { useEffect } from 'react'
import { MODAL } from '../lib/motion'

// ────────────────────────────────────────────────────────────────────
// MotionModal, drop-in modal wrapper. Use it for new modals, the
// existing ones can stay on their own keyframe animations for now.
//
//   <MotionModal isOpen={open} onClose={close} maxWidth={520}>
//     <YourContent />
//   </MotionModal>
//
// - backdrop fades + blurs in
// - content scales + lifts in with a spring (variants from motion.js)
// - Esc closes
// - body scroll locked while open
// - mobile (width < 480) uses the bottomSheet variant
// ────────────────────────────────────────────────────────────────────

function useIsMobile() {
  if (typeof window === 'undefined') return false
  return window.matchMedia ? window.matchMedia('(max-width: 480px)').matches : false
}

export default function MotionModal({
  isOpen,
  onClose,
  children,
  maxWidth = 520,
  closeOnBackdrop = true,
  ariaLabel = 'Dialog',
}) {
  const mobile = useIsMobile()

  useEffect(() => {
    if (!isOpen) return
    const onKey = (e) => { if (e.key === 'Escape') onClose?.() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [isOpen, onClose])

  useEffect(() => {
    if (!isOpen) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [isOpen])

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            variants={MODAL.overlay}
            initial="initial"
            animate="animate"
            exit="exit"
            onClick={closeOnBackdrop ? onClose : undefined}
            aria-hidden
            style={{
              position: 'fixed', inset: 0,
              background: 'rgba(0,0,0,0.55)',
              zIndex: 1000,
              cursor: closeOnBackdrop ? 'pointer' : 'default',
            }}
          />
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label={ariaLabel}
            className="glass-strong"
            variants={mobile ? MODAL.bottomSheet : MODAL.content}
            initial="initial"
            animate="animate"
            exit="exit"
            onClick={e => e.stopPropagation()}
            style={mobile
              ? {
                  position: 'fixed',
                  bottom: 0, left: 0, right: 0,
                  maxHeight: '92vh',
                  overflowY: 'auto',
                  zIndex: 1001,
                  borderRadius: '20px 20px 0 0',
                  boxShadow: '0 -24px 80px rgba(0,0,0,0.4)',
                }
              : {
                  position: 'fixed',
                  top: '50%', left: '50%',
                  transform: 'translate(-50%, -50%)',
                  width: '90vw',
                  maxWidth,
                  maxHeight: '90vh',
                  overflowY: 'auto',
                  zIndex: 1001,
                  borderRadius: 20,
                  boxShadow: '0 24px 80px rgba(0,0,0,0.4)',
                }
            }
          >
            {children}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
