// Sticky bottom strip showing live editor + device state. Lives in the App
// shell so it spans every route — Workspace, Settings, the welcome view.
// What it shows is derived state only (RTK Query caches, editorStatus slice,
// live geolocation), so the component itself is dumb and reactive.

import { useSelector } from "react-redux";
import type { RootState } from "./store";
import { useRoute } from "./useNoteRoute";
import { useGetNoteQuery, useGetBacklinksQuery } from "./notesApi";
import { useGetDailyNoteQuery } from "./dailyApi";
import { useLiveGeo } from "./useLiveGeo";
import { wordCount } from "./wordCount";

export function StatusBar() {
  const [route] = useRoute();
  const saveStatus = useSelector((s: RootState) => s.editorStatus.saveStatus);
  const buffer = useSelector((s: RootState) => s.editorStatus.buffer);
  const geo = useLiveGeo();

  const activeNoteId = route.kind === "note" ? route.noteId : null;
  const activeDailyDate = route.kind === "daily" ? route.date : null;

  const { data: note } = useGetNoteQuery(activeNoteId ?? "", {
    skip: !activeNoteId,
  });
  const { data: daily } = useGetDailyNoteQuery(activeDailyDate ?? "", {
    skip: !activeDailyDate,
  });
  const { data: backlinks } = useGetBacklinksQuery(activeNoteId ?? "", {
    skip: !activeNoteId,
  });

  // Prefer the live buffer (set by the editor's onChange) so word count
  // updates per keystroke; fall back to the last-fetched body when the
  // buffer hasn't been hydrated yet (initial mount, no typing yet).
  const docBody = buffer ?? note?.body ?? daily?.body ?? null;
  const words = docBody == null ? null : wordCount(docBody);
  const backlinkCount = backlinks?.backlinks.length ?? null;

  return (
    <footer
      role="status"
      aria-label="Editor status"
      className="flex shrink-0 items-center justify-between gap-4 border-t border-neutral-950/5 bg-white px-6 py-1.5 text-xs text-neutral-500"
    >
      <div className="flex items-center gap-4 font-mono tabular-nums">
        <StatusCell label="words" value={words != null ? String(words) : "—"} />
        <StatusCell
          label="links"
          value={backlinkCount != null ? String(backlinkCount) : "—"}
          show={route.kind === "note"}
        />
      </div>
      <div className="flex items-center gap-4 font-mono tabular-nums">
        <SaveBadge status={saveStatus} hasDoc={docBody != null} />
        <GeoBadge accuracy={geo?.accuracy_m ?? null} />
      </div>
    </footer>
  );
}

function StatusCell({
  label,
  value,
  show = true,
}: {
  label: string;
  value: string;
  show?: boolean;
}) {
  if (!show) return null;
  return (
    <span>
      <span className="text-neutral-400">{label}</span>{" "}
      <span className="text-neutral-700">{value}</span>
    </span>
  );
}

function SaveBadge({
  status,
  hasDoc,
}: {
  status: "idle" | "saving" | "saved" | "error";
  hasDoc: boolean;
}) {
  if (!hasDoc) return null;
  if (status === "saving") return <span className="text-neutral-700">saving…</span>;
  if (status === "saved") return <span className="text-accent-700">saved</span>;
  if (status === "error") return <span className="text-red-600">save failed</span>;
  return <span className="text-neutral-400">idle</span>;
}

function GeoBadge({ accuracy }: { accuracy: number | null }) {
  if (accuracy == null) {
    return <span className="text-neutral-400" title="No geolocation">geo —</span>;
  }
  return (
    <span title={`Live accuracy ${Math.round(accuracy)} m`}>
      <span className="text-neutral-400">geo</span>{" "}
      <span className="text-neutral-700">±{Math.round(accuracy)}m</span>
    </span>
  );
}
