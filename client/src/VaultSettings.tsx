// The v0 vault picker: an input + submit pair that posts the absolute path
// to /api/vault. Bun on macOS does not expose an OS folder picker over HTTP,
// so the input is a free-text field for now; a native picker can replace it
// in a later polish slice.

import { useState } from "react";
import type { ApiError } from "@shared/types";
import { useGetVaultQuery, useSetVaultMutation } from "./vaultApi";

export function VaultSettings() {
  const { data: current } = useGetVaultQuery();
  const [draft, setDraft] = useState("");
  const [setVault, { isLoading, error }] = useSetVaultMutation();

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!draft.trim()) return;
    await setVault({ path: draft.trim() });
  };

  const apiError = error as ApiError | undefined;

  return (
    <section
      style={{
        marginTop: "1.5rem",
        padding: "1rem 1.5rem",
        border: "1px solid #e5e5e5",
        borderRadius: "0.5rem",
        fontFamily: "system-ui, sans-serif",
      }}
    >
      <h2 style={{ marginTop: 0 }}>
        {current?.path ? "Change vault" : "Pick a vault to get started"}
      </h2>

      <form onSubmit={submit}>
        <label style={{ display: "block" }}>
          Absolute path to a folder
          <input
            type="text"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="/Users/you/Library/Mobile Documents/com~apple~CloudDocs/Bloom"
            style={{
              display: "block",
              width: "100%",
              marginTop: "0.25rem",
              padding: "0.5rem",
              fontFamily: "ui-monospace, monospace",
              fontSize: "0.875rem",
            }}
          />
        </label>

        <button
          type="submit"
          disabled={isLoading || !draft.trim()}
          style={{ marginTop: "0.75rem", padding: "0.5rem 1rem" }}
        >
          {isLoading ? "Saving…" : "Save"}
        </button>
      </form>

      {apiError && (
        <p style={{ color: "#b00020", marginTop: "0.75rem" }}>
          <strong>{apiError.error}:</strong> {apiError.message}
        </p>
      )}

      {current?.path && (
        <p style={{ color: "#666", marginTop: "0.75rem", fontSize: "0.875rem" }}>
          Currently using <code>{current.path}</code>
        </p>
      )}
    </section>
  );
}
