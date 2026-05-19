// v0 shell: persistent TopBar plus a center column that exposes the Vault
// settings form. Once a Vault is chosen, future slices replace the body with
// the real Note editor and sidebar.

import { TopBar } from "./TopBar";
import { VaultSettings } from "./VaultSettings";
import { useGetHealthQuery } from "./healthApi";
import { useGetVaultQuery } from "./vaultApi";

export function App() {
  const { data: health, isLoading: healthLoading, isError: healthError } =
    useGetHealthQuery();
  const { data: vault } = useGetVaultQuery();

  const serverStatus = healthLoading
    ? "checking…"
    : healthError
    ? "unreachable"
    : health?.ok
    ? "ready"
    : "down";

  return (
    <>
      <TopBar />
      <main
        style={{
          fontFamily: "system-ui, sans-serif",
          padding: "2rem 1.5rem",
          maxWidth: "44rem",
        }}
      >
        <p style={{ color: "#666" }}>
          Server: <strong>{serverStatus}</strong>
        </p>

        {vault?.path ? (
          <p style={{ color: "#444" }}>
            Vault ready. Slice #5 will land the Note editor.
          </p>
        ) : (
          <p style={{ color: "#444" }}>
            Bloom needs a folder to use as your Vault. Pick one below — it can
            live in iCloud Drive, Dropbox, or a regular folder.
          </p>
        )}

        <VaultSettings />
      </main>
    </>
  );
}
