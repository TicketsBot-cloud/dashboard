/**
 * Set before changing the tree: a moved or deleted block's DOM node is replaced, dropping focus.
 */
export const pendingBlockFocus: { id: string | null } = { id: null };
