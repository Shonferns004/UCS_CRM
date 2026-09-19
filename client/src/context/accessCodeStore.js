import { create } from 'zustand'

// Global in-memory "access code verified this session" flag.
// Lives at module scope (outside any component), so it survives SPA navigation
// and is shared across panels/pages. Entering the access code ANYWHERE (Accounts
// receipts/reports or the salary page) unlocks salary everywhere until a full
// browser reload clears it.
export const useAccessCodeStore = create((set) => ({
  unlocked: false,
  setUnlocked: () => set({ unlocked: true }),
  reset: () => set({ unlocked: false }),
}))
