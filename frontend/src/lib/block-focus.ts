/**
 * The element (a block, or an Add block trigger) to focus after the next render, matched on
 * `data-block-id`. Set before changing the tree, because a moved or deleted block's DOM node is
 * replaced, which drops focus. ComponentTreeBuilder consumes it in a layout effect.
 */
export const pendingBlockFocus: { id: string | null } = { id: null };
