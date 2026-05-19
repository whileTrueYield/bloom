// The v0 landing surface. Renders the product name and a live readout of the
// server health so it's immediately obvious whether the Bun side is reachable.
// Future slices replace this with the real shell (sidebar, editor, status bar).

import { useGetHealthQuery } from "./healthApi";

export function App() {
  const { data, isLoading, isError } = useGetHealthQuery();

  const status = isLoading
    ? "checking…"
    : isError
    ? "unreachable"
    : data?.ok
    ? "ready"
    : "down";

  return (
    <main style={{ fontFamily: "system-ui, sans-serif", padding: "3rem", maxWidth: "40rem" }}>
      <h1 style={{ marginBottom: "0.25rem" }}>Bloom</h1>
      <p style={{ color: "#666", marginTop: 0 }}>A local-first second brain.</p>
      <p>
        Server: <strong>{status}</strong>
      </p>
      <p style={{ color: "#888", fontSize: "0.875rem" }}>
        No vault selected. Vault selection lands in the next slice.
      </p>
    </main>
  );
}
