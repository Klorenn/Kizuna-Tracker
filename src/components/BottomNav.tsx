"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChartBar, House, Trophy, User, Users } from "@phosphor-icons/react";

const TABS = [
  { href: "/", label: "Hoy", Icon: House },
  { href: "/amigos", label: "Amigos", Icon: Users },
  { href: "/retos", label: "Retos", Icon: Trophy },
  { href: "/resumen", label: "Resumen", Icon: ChartBar },
  { href: "/perfil", label: "Perfil", Icon: User },
] as const;

/** Home is active for "/" and for habit screens (/habitos/...). */
export function BottomNav() {
  const pathname = usePathname();
  if (pathname === "/listo") return null;
  return (
    <nav
      aria-label="Principal"
      className="fixed inset-x-0 bottom-0 border-t border-line bg-paper pb-[env(safe-area-inset-bottom)]"
    >
      <ul className="mx-auto flex max-w-md px-2 pt-1">
        {TABS.map(({ href, label, Icon }) => {
          const active =
            href === "/"
              ? pathname === "/" || pathname.startsWith("/habitos")
              : pathname.startsWith(href);
          return (
            <li key={href} className="flex-1">
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className="flex min-h-14 min-w-11 flex-col items-center justify-center gap-1 py-2 text-[12px] focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-accent"
              >
                <span
                  className={`flex h-7 w-[52px] items-center justify-center rounded-full ${
                    active ? "bg-accent-soft text-accent" : "text-muted"
                  }`}
                >
                  <Icon size={20} weight="light" aria-hidden />
                </span>
                <span className={active ? "font-semibold text-ink" : "text-muted"}>{label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
