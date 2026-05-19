// Vault module: filesystem operations over the user-chosen Vault folder.
// Public surface stays small (validation + bootstrap) so the rest of the app
// only sees structured results, not raw FS errors.

import { mkdir, stat } from "node:fs/promises";
import path from "node:path";

export const VAULT_SUBDIRS = ["notes", "daily", "attachments"] as const;

export type VaultValidationError =
  | "PATH_NOT_FOUND"
  | "PATH_NOT_DIRECTORY"
  | "PATH_NOT_WRITABLE";

export type VaultValidation =
  | { ok: true; path: string }
  | { ok: false; error: VaultValidationError; message: string };

export async function validateVaultPath(absPath: string): Promise<VaultValidation> {
  let info;
  try {
    info = await stat(absPath);
  } catch {
    return {
      ok: false,
      error: "PATH_NOT_FOUND",
      message: `Vault path does not exist: ${absPath}`,
    };
  }

  if (!info.isDirectory()) {
    return {
      ok: false,
      error: "PATH_NOT_DIRECTORY",
      message: `Vault path is not a directory: ${absPath}`,
    };
  }

  return { ok: true, path: absPath };
}

export async function bootstrapVaultLayout(vaultPath: string): Promise<void> {
  for (const sub of VAULT_SUBDIRS) {
    await mkdir(path.join(vaultPath, sub), { recursive: true });
  }
}
