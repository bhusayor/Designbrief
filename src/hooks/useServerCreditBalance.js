import { useEffect } from 'react'

// Mirrors the authoritative balance emitted by the server AI client.
// This hook never performs a deduction; billing remains server-only.
export function useServerCreditBalance({ setUserCredits, setCreditsUsed }) {
  useEffect(() => {
    const handleCreditsUpdated = (event) => {
      const remaining = event?.detail?.creditsRemaining
      if (!Number.isFinite(remaining)) return
      setUserCredits(remaining)
      setCreditsUsed(previous => {
        const next = Number.isFinite(event?.detail?.creditsUsed)
          ? event.detail.creditsUsed
          : event?.detail?.charged && Number.isFinite(event?.detail?.creditCost)
            ? previous + event.detail.creditCost
            : previous
        try {
          const current = JSON.parse(localStorage.getItem('db-plan-state') || '{}')
          localStorage.setItem('db-plan-state', JSON.stringify({
            ...current,
            credits: remaining,
            creditsUsed: next,
          }))
        } catch {
          // An unavailable local cache must not affect the in-memory balance.
        }
        return next
      })
    }
    window.addEventListener('designbrief:credits-updated', handleCreditsUpdated)
    return () => window.removeEventListener('designbrief:credits-updated', handleCreditsUpdated)
  }, [setCreditsUsed, setUserCredits])
}
