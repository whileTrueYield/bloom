# Wikilinks store titles, not IDs

Wikilinks in the markdown body are written as `[[title]]` (Obsidian convention), not the more robust `[[20260518T1432]]` ID form. Storing titles keeps raw markdown human-readable and preserves Vault portability — the Vault opens in Obsidian, VSCode, or `cat` with zero rewriting. The cost (renames must rewrite all backlinks atomically) is paid inside Bloom's save flow by querying the link table in the Index; the Index is rebuildable, so a botched rename never corrupts the Vault.

The alternative — storing IDs and rendering titles for display — was rejected on portability grounds: it would break the "openable in any markdown tool" promise, and it would mean Bloom owns the link format rather than reusing the de facto wikilink standard. We accept the rename complexity as the price of staying compatible with the rest of the markdown ecosystem.
