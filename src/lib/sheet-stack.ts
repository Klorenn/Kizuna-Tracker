import { createModalStack } from '@/lib/modal-stack'

/** Every open sheet, in opening order (Sheet.tsx registers here; the native back bridge closes the top one). */
export const sheetStack = createModalStack()
