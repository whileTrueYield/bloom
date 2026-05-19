// Persistent header. Renders the product name and a live readout of the
// current Vault path, falling back to "no vault selected" until the user
// chooses one in slice #4's settings form.

import { useGetVaultQuery } from "./vaultApi";

export function TopBar() {
  const { data, isLoading } = useGetVaultQuery();

  const vaultLabel = isLoading
    ? "loading…"
    : data?.path ?? "no vault selected";

  return (
    <header
      style={{
        display: "flex",
        alignItems: "baseline",
        gap: "0.75rem",
        padding: "0.75rem 1.5rem",
        borderBottom: "1px solid #e5e5e5",
        fontFamily: "system-ui, sans-serif",
      }}
    >
      <strong>Bloom</strong>
      <span style={{ color: "#666" }}>·</span>
      <span style={{ color: "#666" }}>{vaultLabel}</span>
    </header>
  );
}
