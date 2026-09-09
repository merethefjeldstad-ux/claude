import { TagIcon, ClockIcon } from "./icons";
import type { MenuDayView } from "@/lib/menu/view";

const ACCENT = "#4C6B8A";

const CATEGORY_STYLE: Record<string, { bg: string; fg: string }> = {
  KJAPT: { bg: "oklch(94% 0.05 150)", fg: "oklch(32% 0.08 150)" },
  MIDDELS: { bg: "oklch(94% 0.06 80)", fg: "oklch(38% 0.09 80)" },
  TIDKREVENDE: { bg: "oklch(94% 0.05 30)", fg: "oklch(40% 0.09 30)" },
};

export function DayCard({ day }: { day: MenuDayView }) {
  const cat = CATEGORY_STYLE[day.timeCategory] ?? CATEGORY_STYLE.MIDDELS;

  return (
    <div
      className="flex flex-row gap-3 items-stretch rounded-xl px-3.5 py-2.5"
      style={{
        background: day.isToday ? "oklch(97% 0.01 230)" : "oklch(99% 0.002 80)",
        border: day.isToday ? `2px solid ${ACCENT}` : "1px solid oklch(90% 0.004 80)",
      }}
    >
      <div className="flex flex-col items-start justify-center min-w-[46px]">
        <div className="text-[11px] font-semibold uppercase tracking-wide text-app-text-muted">
          {day.day}
        </div>
        <div className="text-xs text-app-text-faint">{day.date}</div>
      </div>

      <div className="w-px self-stretch bg-app-border" />

      <div className="flex flex-col gap-1.5 grow min-w-0">
        <div className="text-[14.5px] font-semibold text-app-text">{day.dish}</div>

        <div className="flex flex-row flex-wrap gap-1.5 items-center">
          <span
            className="text-[11px] font-semibold px-2.5 py-[3px] rounded-full"
            style={{ background: cat.bg, color: cat.fg }}
          >
            {day.timeLabel}
          </span>

          {day.hasOffer ? (
            <span className="flex flex-row items-center gap-[3px] text-[11.5px] text-app-text-muted">
              <TagIcon color="oklch(45% 0.01 260)" />
              {day.offerLabel} · {day.store}
            </span>
          ) : (
            <span className="text-[11.5px] text-app-text-faint italic">
              Favoritt uten tilbud denne uken
            </span>
          )}

          {day.wasRebalanced && (
            <span className="text-[11.5px] text-app-text-faint">· justert i dag</span>
          )}
        </div>

        <div className="flex flex-row items-center gap-1 text-[11.5px] text-app-text-muted">
          <ClockIcon color="oklch(52% 0.01 260)" />
          Ledig tid i kveld: {day.availableMinutesLabel}
        </div>
      </div>
    </div>
  );
}
