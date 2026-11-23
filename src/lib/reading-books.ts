import type { SupabaseClient } from '@supabase/supabase-js'
import { nextFromPage } from '@/domain/logs'
import type { Database } from '@/lib/supabase/database.types'

/** A chip in the reading sheet's book picker. */
export type PickerBook = { id: string; title: string; totalPages: number | null; nextFrom: number }

type BookRow = { id: string; title: string; total_pages: number | null; status: string; created_at: string }
type EntryRow = { book_id: string; local_date: string; from_page: number; to_page: number }

/**
 * Books you are reading, the last one you read first (then the newest), each with the page to
 * continue from. `keep` also lists that book when it is finished (editing an old reading).
 */
export function pickerBooks(books: BookRow[], entries: EntryRow[], keep?: string): PickerBook[] {
  const lastUsed = new Map<string, string>()
  for (const e of entries) {
    const prev = lastUsed.get(e.book_id)
    if (!prev || e.local_date > prev) lastUsed.set(e.book_id, e.local_date)
  }
  const asEntries = entries.map((e) => ({ date: e.local_date, bookId: e.book_id, fromPage: e.from_page, toPage: e.to_page }))
  return books
    .filter((b) => b.status === 'reading' || b.id === keep)
    .sort((a, b) => {
      if (a.id === keep) return -1
      if (b.id === keep) return 1
      const la = lastUsed.get(a.id) ?? ''
      const lb = lastUsed.get(b.id) ?? ''
      if (la !== lb) return la > lb ? -1 : 1
      return a.created_at > b.created_at ? -1 : 1
    })
    .map((b) => ({ id: b.id, title: b.title, totalPages: b.total_pages, nextFrom: nextFromPage(asEntries, b.id) }))
}

/** Confirmation copy before deleting a book with readings. */
export function bookDeleteCopy(readings: number, pages: number): string {
  if (readings === 0) return 'El libro no tiene lecturas. Tus check-ins no cambian.'
  const r = readings === 1 ? 'Se borrará 1 lectura' : `Se borrarán ${readings} lecturas`
  const p = pages === 1 ? '1 página' : `${pages} páginas`
  return `${r} (${p}). Tus check-ins no cambian.`
}

/** Books and recent readings for the picker (bounded: the last 500 readings decide order and pages). */
export async function loadPickerBooks(
  supabase: SupabaseClient<Database>,
  userId: string,
  keep?: string,
): Promise<PickerBook[]> {
  const [books, entries] = await Promise.all([
    supabase
      .from('books')
      .select('id,title,total_pages,status,created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(200),
    supabase
      .from('reading_entries')
      .select('book_id,local_date,from_page,to_page')
      .eq('user_id', userId)
      .order('local_date', { ascending: false })
      .limit(500),
  ])
  return pickerBooks(books.data ?? [], entries.data ?? [], keep)
}
