// Daily Notes section of the left sidebar: a "Today" link that ensures and
// opens today's Daily Note, followed by the list of existing dated Daily
// Notes in descending order. Sibling of NotesSidebar — Notes and Daily Notes
// are distinct concepts in the Bloom vocabulary, so they get distinct rails.

import { useListDailyNotesQuery, useEnsureTodayMutation } from "./dailyApi";

export interface DailySidebarProps {
  activeDate: string | null;
  onOpenDaily: (date: string) => void;
}

// `Date.toLocaleDateString("en-CA")` happens to format YYYY-MM-DD in every
// locale because en-CA pins to ISO-8601. We need this string to match the
// filenames Capture wrote in the host's local timezone — not UTC.
function todayLocalDate(): string {
  return new Date().toLocaleDateString("en-CA");
}

const dailyFormatter = new Intl.DateTimeFormat(undefined, {
  weekday: "short",
  month: "short",
  day: "numeric",
});

function formatDailyDate(iso: string): string {
  // Anchor at noon to dodge timezone shifts that would tip the date back a day
  // in negative-offset locales.
  const d = new Date(`${iso}T12:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return dailyFormatter.format(d);
}

export function DailySidebar({ activeDate, onOpenDaily }: DailySidebarProps) {
  const { data, isLoading, isError } = useListDailyNotesQuery();
  const [ensureToday] = useEnsureTodayMutation();
  const today = todayLocalDate();
  const isTodayActive = activeDate === today;

  const onTodayClick = async () => {
    const result = await ensureToday().unwrap();
    onOpenDaily(result.date);
  };

  return (
    <nav aria-label="Daily Notes" className="flex flex-col gap-2">
      <h2 className="px-1 font-mono text-xs tracking-wide text-neutral-400 uppercase">
        Daily
      </h2>

      <button
        type="button"
        onClick={() => void onTodayClick()}
        aria-current={isTodayActive ? "page" : undefined}
        className={
          "flex items-center justify-between rounded-md px-2.5 py-1.5 text-left text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-600 " +
          (isTodayActive
            ? "bg-accent-50 font-medium text-accent-900"
            : "text-neutral-700 hover:bg-neutral-50")
        }
      >
        <span>Today</span>
        <span className="font-mono text-xs text-neutral-400 tabular-nums">
          {today}
        </span>
      </button>

      {isLoading && (
        <p className="px-1 text-sm text-neutral-400">Loading…</p>
      )}
      {isError && (
        <p className="px-1 text-sm text-red-600">Failed to load Daily Notes.</p>
      )}

      {!isLoading && !isError && (data?.daily ?? []).length > 0 && (
        // TODO: virtualize once Daily Notes counts climb (per #12 AC). A plain
        // list works fine for the first few hundred days; @tanstack/react-virtual
        // is the obvious upgrade when it's needed.
        <ul role="list" className="flex flex-col gap-0.5">
          {(data?.daily ?? [])
            .filter((d) => d.date !== today)
            .map((d) => {
              const isActive = d.date === activeDate;
              return (
                <li key={d.date}>
                  <button
                    type="button"
                    onClick={() => onOpenDaily(d.date)}
                    aria-current={isActive ? "page" : undefined}
                    className={
                      "flex w-full items-center justify-between rounded-md px-2.5 py-1.5 text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-600 " +
                      (isActive
                        ? "bg-accent-50 text-accent-900"
                        : "text-neutral-700 hover:bg-neutral-50")
                    }
                  >
                    <span className="truncate text-sm">
                      {formatDailyDate(d.date)}
                    </span>
                    <span className="font-mono text-xs text-neutral-400 tabular-nums">
                      {d.date}
                    </span>
                  </button>
                </li>
              );
            })}
        </ul>
      )}
    </nav>
  );
}
