// The v0 Vault picker: a free-text absolute-path input + submit pair posting
// to /api/vault. Bun on macOS can't expose a native folder picker over HTTP,
// so the field is plain text; a native picker can replace it in a later
// polish slice without changing this component's external contract.

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
  const hasVault = Boolean(current?.path);

  return (
    <section>
      <h2 className="text-base font-medium text-neutral-900">
        {hasVault ? "Change Vault" : "Choose your Vault folder"}
      </h2>

      <form onSubmit={submit} className="mt-4 space-y-3">
        <div>
          <label
            htmlFor="vault-path"
            className="block text-sm font-medium text-neutral-700"
          >
            Absolute path
          </label>
          <input
            id="vault-path"
            name="vault-path"
            type="text"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="/Users/you/Library/Mobile Documents/com~apple~CloudDocs/Bloom"
            className="mt-1.5 block w-full rounded-md bg-white px-3 py-2 font-mono text-sm text-neutral-900 ring-1 ring-neutral-950/10 outline-none placeholder:text-neutral-400 focus:ring-2 focus:ring-accent-600"
          />
        </div>

        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={isLoading || !draft.trim()}
            className="inline-flex items-center rounded-md bg-accent-700 px-3.5 py-2 text-sm font-medium text-white shadow-xs ring-1 ring-accent-700 hover:bg-accent-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-600 disabled:cursor-not-allowed disabled:bg-neutral-300 disabled:ring-neutral-300"
          >
            {isLoading ? "Saving…" : hasVault ? "Update Vault" : "Open Vault"}
          </button>
          {hasVault && (
            <p className="text-sm text-neutral-500">
              Currently using{" "}
              <code className="rounded bg-neutral-100 px-1.5 py-0.5 font-mono text-xs text-neutral-700">
                {current!.path}
              </code>
            </p>
          )}
        </div>
      </form>

      {apiError && (
        <p
          role="alert"
          className="mt-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 ring-1 ring-red-200"
        >
          <span className="font-medium">{apiError.error}:</span>{" "}
          {apiError.message}
        </p>
      )}
    </section>
  );
}
