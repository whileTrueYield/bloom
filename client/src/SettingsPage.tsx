// The Settings page. Reached via the cog icon in the TopBar (route #settings).
// Composes existing pieces (VaultSettings) with three new sections:
// Geolocation permission, Rebuild Index, and Storage Diagnostics.
//
// The page does not own any settings state itself — every section reads from
// or writes to a dedicated API slice or the browser's geolocation permission
// API. That keeps the file flat and easy to extend.

import { useEffect, useState } from "react";
import { VaultSettings } from "./VaultSettings";
import {
  useGetIndexStatsQuery,
  useRebuildIndexMutation,
} from "./indexApi";
import { useRoute } from "./useNoteRoute";

type PermissionState = "granted" | "denied" | "prompt" | "unknown" | "unsupported";

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(2)} MB`;
}

export function SettingsPage() {
  const [, setRoute] = useRoute();

  return (
    <main className="flex flex-1 justify-center overflow-y-auto px-6 py-12">
      <div className="w-full max-w-2xl space-y-12">
        <header className="flex items-baseline justify-between">
          <div>
            <p className="font-mono text-xs tracking-wide text-accent-700 uppercase">
              Settings
            </p>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight text-neutral-900">
              Workspace settings
            </h1>
          </div>
          <button
            type="button"
            onClick={() => setRoute({ kind: "none" })}
            className="rounded-md px-3 py-1.5 text-sm text-neutral-600 ring-1 ring-neutral-950/10 hover:bg-neutral-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-600"
          >
            Close
          </button>
        </header>

        <section>
          <SectionHeader title="Vault" />
          <div className="mt-4">
            <VaultSettings />
          </div>
        </section>

        <section>
          <SectionHeader title="Geolocation" />
          <GeolocationSection />
        </section>

        <section>
          <SectionHeader title="Index" />
          <RebuildSection />
        </section>

        <section>
          <SectionHeader title="Storage diagnostics" />
          <DiagnosticsSection />
        </section>
      </div>
    </main>
  );
}

function SectionHeader({ title }: { title: string }) {
  return (
    <h2 className="border-b border-neutral-950/5 pb-2 text-sm font-semibold tracking-wide text-neutral-700 uppercase">
      {title}
    </h2>
  );
}

function GeolocationSection() {
  const [permission, setPermission] = useState<PermissionState>("unknown");

  // The Permissions API gives us the current state without prompting the
  // user; we re-read it after a prompt to reflect their choice.
  const refresh = async () => {
    if (typeof navigator === "undefined" || !navigator.permissions) {
      setPermission("unsupported");
      return;
    }
    try {
      const status = await navigator.permissions.query({
        name: "geolocation" as PermissionName,
      });
      setPermission(status.state as PermissionState);
    } catch {
      setPermission("unsupported");
    }
  };

  useEffect(() => {
    void refresh();
  }, []);

  // Trigger a one-shot getCurrentPosition to surface the browser's prompt
  // when the state is "prompt". After the user decides, the Permissions API
  // reports the new state on the next refresh.
  const requestPermission = () => {
    if (typeof navigator === "undefined" || !navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      () => void refresh(),
      () => void refresh(),
      { timeout: 5000 },
    );
  };

  return (
    <div className="mt-4 flex items-center justify-between gap-4">
      <div>
        <p className="text-sm text-neutral-700">
          Permission status:{" "}
          <span className="font-mono text-neutral-900">{permission}</span>
        </p>
        <p className="mt-1 text-sm text-neutral-500">
          Bloom uses geolocation to stamp every Capture so you can find a
          thought by where you had it.
        </p>
      </div>
      <button
        type="button"
        onClick={requestPermission}
        disabled={permission === "unsupported"}
        className="shrink-0 rounded-md bg-white px-3 py-1.5 text-sm font-medium text-neutral-700 ring-1 ring-neutral-950/10 hover:bg-neutral-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-600 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {permission === "granted" ? "Refresh" : "Request permission"}
      </button>
    </div>
  );
}

function RebuildSection() {
  const [rebuild, { isLoading, data, error }] = useRebuildIndexMutation();

  return (
    <div className="mt-4 flex items-center justify-between gap-4">
      <div>
        <p className="text-sm text-neutral-700">
          Re-scan the Vault and rebuild the Index from scratch.
        </p>
        <p className="mt-1 text-sm text-neutral-500">
          Use this after editing Vault files outside Bloom or if search results
          seem stale.
        </p>
        {data && !isLoading && (
          <p className="mt-3 text-sm text-accent-700">
            Rebuilt {data.notes} Note{data.notes === 1 ? "" : "s"} and{" "}
            {data.daily} Daily Note{data.daily === 1 ? "" : "s"}.
          </p>
        )}
        {error && (
          <p role="alert" className="mt-3 text-sm text-red-600">
            Rebuild failed.
          </p>
        )}
      </div>
      <button
        type="button"
        onClick={() => void rebuild()}
        disabled={isLoading}
        aria-busy={isLoading}
        className="shrink-0 rounded-md bg-accent-700 px-3 py-1.5 text-sm font-medium text-white ring-1 ring-accent-700 hover:bg-accent-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-600 disabled:cursor-not-allowed disabled:bg-neutral-300 disabled:ring-neutral-300"
      >
        {isLoading ? "Rebuilding…" : "Rebuild Index"}
      </button>
    </div>
  );
}

function DiagnosticsSection() {
  const { data, isLoading, isError } = useGetIndexStatsQuery();

  if (isLoading) {
    return <p className="mt-4 text-sm text-neutral-400">Loading…</p>;
  }
  if (isError || !data) {
    return (
      <p className="mt-4 text-sm text-red-600">Failed to load diagnostics.</p>
    );
  }

  const items: { label: string; value: string }[] = [
    { label: "Notes", value: String(data.notes) },
    { label: "Daily Notes", value: String(data.daily) },
    { label: "Blocks", value: String(data.blocks) },
    { label: "Wikilinks", value: String(data.wikilinks) },
    { label: "Index file size", value: formatBytes(data.sizeBytes) },
  ];

  return (
    <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-3">
      {items.map((it) => (
        <div key={it.label}>
          <dt className="font-mono text-xs tracking-wide text-neutral-400 uppercase">
            {it.label}
          </dt>
          <dd className="mt-0.5 font-mono text-sm text-neutral-900 tabular-nums">
            {it.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}
