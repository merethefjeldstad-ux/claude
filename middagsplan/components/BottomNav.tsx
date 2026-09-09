"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChecklistIcon, MenuIcon } from "./icons";

const ACCENT = "#4C6B8A";
const INACTIVE = "oklch(62% 0.01 260)";

export function BottomNav() {
  const pathname = usePathname();
  const onHandleliste = pathname?.startsWith("/handleliste");

  return (
    <nav className="flex flex-row border-t border-app-border bg-app-panel px-5 pb-3.5 pt-2.5 gap-2 shrink-0">
      <Link
        href="/"
        className="flex flex-1 flex-col items-center gap-[3px]"
        aria-current={!onHandleliste ? "page" : undefined}
      >
        <MenuIcon color={!onHandleliste ? ACCENT : INACTIVE} />
        <span
          className="text-[11px]"
          style={{
            color: !onHandleliste ? ACCENT : INACTIVE,
            fontWeight: !onHandleliste ? 600 : 500,
          }}
        >
          Meny
        </span>
      </Link>
      <Link
        href="/handleliste"
        className="flex flex-1 flex-col items-center gap-[3px]"
        aria-current={onHandleliste ? "page" : undefined}
      >
        <ChecklistIcon color={onHandleliste ? ACCENT : INACTIVE} />
        <span
          className="text-[11px]"
          style={{
            color: onHandleliste ? ACCENT : INACTIVE,
            fontWeight: onHandleliste ? 600 : 500,
          }}
        >
          Handleliste
        </span>
      </Link>
    </nav>
  );
}
