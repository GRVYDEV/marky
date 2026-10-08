import type { TreeNode } from "@/lib/tauri";

const compareByModified = (a: TreeNode, b: TreeNode): number => {
  if (a.is_dir !== b.is_dir) return a.is_dir ? -1 : 1;
  return b.modified - a.modified || a.name.toLowerCase().localeCompare(b.name.toLowerCase());
};

/** Returns a copy of the tree with directories first, then newest first at every level. */
export const sortTreeByModified = (node: TreeNode): TreeNode => ({
  ...node,
  children: node.children.map(sortTreeByModified).sort(compareByModified),
});
