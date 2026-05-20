// Persistent header. Wordmark on the left, the current Vault path as a
// muted chip on the right, falling back to "no vault selected" until the
// user picks one in VaultSettings.

import { useGetVaultQuery } from "./vaultApi";

export function TopBar() {
  const { data, isLoading } = useGetVaultQuery();

  const vaultLabel = isLoading
    ? "loading…"
    : (data?.path ?? "no vault selected");

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

      <span
        title={vaultLabel}
        className="max-w-[60ch] truncate font-mono text-xs text-neutral-500"
      >
        {vaultLabel}
      </span>
    </header>
  );
}
