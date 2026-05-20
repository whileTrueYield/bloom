// Persistent header. Wordmark on the left, vault path chip + settings cog on
// the right. The cog navigates to the Settings page (route #settings); it's
// only useful once a Vault is configured, but it stays visible always so the
// user has a one-click escape hatch back to settings from any view.

import { Cog6ToothIcon } from "@heroicons/react/24/outline";
import { useGetVaultQuery } from "./vaultApi";
import { useRoute } from "./useNoteRoute";

export function TopBar() {
  const { data, isLoading } = useGetVaultQuery();
  const [route, setRoute] = useRoute();

  const vaultLabel = isLoading
    ? "loading…"
    : (data?.path ?? "no vault selected");
  const onSettings = route.kind === "settings";

  return (
    <header className="flex shrink-0 items-center justify-between gap-4 border-b border-neutral-950/5 bg-white px-6 py-3">
      <a
        href="/"
        aria-label="Homepage"
        className="flex items-baseline gap-2 text-neutral-900"
      >
        <span className="text-base font-semibold tracking-tight">Bloom</span>
        <span aria-hidden="true" className="size-1.5 rounded-full bg-accent-500" />
      </a>

      <div className="flex items-center gap-4">
        <span
          title={vaultLabel}
          className="max-w-[60ch] truncate font-mono text-xs text-neutral-500"
        >
          {vaultLabel}
        </span>
        <button
          type="button"
          onClick={() => setRoute({ kind: "settings" })}
          aria-label="Open settings"
          aria-current={onSettings ? "page" : undefined}
          className={
            "rounded-md p-1.5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-600 " +
            (onSettings
              ? "bg-accent-50 text-accent-700"
              : "text-neutral-500 hover:bg-neutral-50 hover:text-neutral-700")
          }
        >
          <Cog6ToothIcon aria-hidden="true" className="size-4" />
        </button>
      </div>
    </header>
  );
}
