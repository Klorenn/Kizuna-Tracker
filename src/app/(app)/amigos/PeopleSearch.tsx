import { MagnifyingGlass } from "@phosphor-icons/react/dist/ssr";

/** The search field of Amigos and Explorar: a GET form to Explorar with the term in `q`. */
export function PeopleSearch({ defaultValue = "" }: { defaultValue?: string }) {
  return (
    <form action="/amigos/explorar" role="search" className="flex">
      <label className="flex h-12 w-full items-center gap-3 rounded-lg bg-field px-4 focus-within:shadow-[inset_0_0_0_2px_var(--color-accent)]">
        <MagnifyingGlass size={20} weight="light" className="shrink-0 text-muted" aria-hidden />
        <span className="sr-only">Buscar por nombre o @usuario</span>
        <input
          name="q"
          defaultValue={defaultValue}
          placeholder="Buscar por nombre o @usuario"
          autoCapitalize="none"
          autoCorrect="off"
          maxLength={41}
          className="min-w-0 flex-1 bg-transparent text-[17px] text-ink outline-none placeholder:text-muted"
        />
      </label>
    </form>
  );
}
