import { getWeeklyMenuView } from "@/lib/menu/view";
import { DayCard } from "@/components/DayCard";

export const dynamic = "force-dynamic";

export default async function MenyPage() {
  const menu = await getWeeklyMenuView();

  return (
    <div className="flex flex-col gap-3.5">
      <div className="text-xl font-bold text-app-text tracking-tight">Middagsplan</div>

      {menu ? (
        <>
          <div className="flex flex-col gap-0.5">
            <div className="text-[13px] font-semibold text-app-text">{menu.weekLabel}</div>
            <div className="text-xs text-app-text-muted">{menu.dateRangeLabel}</div>
          </div>

          <div className="flex flex-col gap-2">
            {menu.days.map((day) => (
              <DayCard key={day.dayIndex} day={day} />
            ))}
          </div>
        </>
      ) : (
        <div className="text-sm text-app-text-muted pt-4">
          Ingen ukesmeny er generert ennå. Den lages automatisk hver mandag kl. 10:00, eller kan
          trigges manuelt via <code>/api/cron/weekly</code>.
        </div>
      )}
    </div>
  );
}
