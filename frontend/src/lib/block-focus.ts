/**
 * The block that should receive focus after the next render. BlockList sets it before changing
 * the tree (a moved or deleted block's DOM node is replaced, which drops focus) and
 * ComponentTreeBuilder consumes it in a layout effect.
 */
export const pendingBlockFocus: { id: string | null } = { id: null };
