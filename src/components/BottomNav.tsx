"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  CalendarCheck,
  ChartBar,
  Sword,
  User,
  UsersThree,
} from "@phosphor-icons/react";

const TABS = [
  { href: "/", label: "Hoy", Icon: CalendarCheck },
  { href: "/amigos", label: "Amigos", Icon: UsersThree },
  { href: "/retos", label: "Retos", Icon: Sword },
  { href: "/resumen", label: "Resumen", Icon: ChartBar },
  { href: "/perfil", label: "Perfil", Icon: User },
] as const;

export function BottomNav() {
  const pathname = usePathname();
  if (pathname === "/listo") return null;
  return (
    <nav
      aria-label="Principal"
      className="fixed inset-x-0 bottom-0 border-t border-line bg-surface pb-[env(safe-area-inset-bottom)]"
    >
      <ul className="mx-auto flex max-w-md">
        {TABS.map(({ href, label, Icon }) => {
          const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
          return (
            <li key={href} className="flex-1">
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={`flex min-h-14 min-w-11 flex-col items-center justify-center gap-1 text-[11px] focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-accent ${
                  active ? "font-semibold text-text" : "text-muted"
                }`}
              >
                <Icon size={20} weight={active ? "regular" : "light"} aria-hidden />
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
