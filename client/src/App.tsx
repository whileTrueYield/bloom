// Top-level shell: TopBar, then either the Vault settings (no vault yet) or
// the Workspace (vault configured).

import { TopBar } from "./TopBar";
import { VaultSettings } from "./VaultSettings";
import { Workspace } from "./Workspace";
import { useGetVaultQuery } from "./vaultApi";

export function App() {
  const { data: vault, isLoading } = useGetVaultQuery();

  return (
    <>
      <TopBar />
      {isLoading ? (
        <p style={{ padding: "2rem 1.5rem", color: "#888" }}>Loading…</p>
      ) : vault?.path ? (
        <Workspace />
      ) : (
        <main
          style={{
            fontFamily: "system-ui, sans-serif",
            padding: "2rem 1.5rem",
            maxWidth: "44rem",
          }}
        >
          <p style={{ color: "#444" }}>
            Bloom needs a folder to use as your Vault. Pick one below — it can
            live in iCloud Drive, Dropbox, or a regular folder.
          </p>
          <VaultSettings />
        </main>
      )}
    </>
  );
}
