// Top-level shell: a column with the persistent TopBar, the active route's
// surface (Workspace, SettingsPage, or vault-onboarding), and a sticky
// StatusBar pinned at the bottom across every route.

import { TopBar } from "./TopBar";
import { VaultSettings } from "./VaultSettings";
import { Workspace } from "./Workspace";
import { SettingsPage } from "./SettingsPage";
import { StatusBar } from "./StatusBar";
import { useGetVaultQuery } from "./vaultApi";
import { useRoute } from "./useNoteRoute";

export function App() {
  const { data: vault, isLoading } = useGetVaultQuery();
  const [route] = useRoute();

  return (
    <div className="flex h-full flex-col">
      <TopBar />
      {isLoading ? (
        <main className="flex flex-1 items-center justify-center">
          <p className="text-sm text-neutral-500">Loading…</p>
        </main>
      ) : route.kind === "settings" ? (
        <SettingsPage />
      ) : vault?.path ? (
        <Workspace />
      ) : (
        <main className="flex flex-1 items-start justify-center overflow-y-auto px-6 py-16 sm:py-24">
          <div className="w-full max-w-xl">
            <p className="font-mono text-xs tracking-wide text-accent-700 uppercase">
              Welcome to Bloom
            </p>
            <h1 className="mt-3 text-3xl font-semibold tracking-tight text-balance text-neutral-900 sm:text-4xl">
              Plant your Vault somewhere it can grow.
            </h1>
            <p className="mt-4 max-w-[60ch] text-pretty text-neutral-600">
              Bloom keeps every Note as plain markdown in a folder you own —
              iCloud Drive, Dropbox, or anywhere on disk. Point Bloom at that
              folder and we'll grow the index, the link graph, and the daily
              capture inbox on top of it.
            </p>
            <div className="mt-10">
              <VaultSettings />
            </div>
          </div>
        </main>
      )}
      <StatusBar />
    </div>
  );
}
