import { describe, expect, it } from "vitest";
import { sortTreeByModified } from "./fileTree";
import type { TreeNode } from "./tauri";

const file = (name: string, modified: number): TreeNode => ({
  name,
  path: `/root/${name}`,
  is_dir: false,
  modified,
  children: [],
});

const dir = (name: string, modified: number, children: TreeNode[]): TreeNode => ({
  name,
  path: `/root/${name}`,
  is_dir: true,
  modified,
  children,
});

const names = (node: TreeNode) => node.children.map((c) => c.name);

describe("sortTreeByModified", () => {
  it("orders files newest first", () => {
    const tree = dir("root", 3, [file("a.md", 1), file("b.md", 3), file("c.md", 2)]);
    expect(names(sortTreeByModified(tree))).toEqual(["b.md", "c.md", "a.md"]);
  });

  it("keeps directories before files and orders them by newest descendant", () => {
    const tree = dir("root", 9, [
      file("newest.md", 9),
      dir("old", 1, [file("x.md", 1)]),
      dir("recent", 5, [file("y.md", 5)]),
    ]);
    expect(names(sortTreeByModified(tree))).toEqual(["recent", "old", "newest.md"]);
  });

  it("sorts nested levels", () => {
    const tree = dir("root", 2, [dir("sub", 2, [file("a.md", 1), file("b.md", 2)])]);
    expect(names(sortTreeByModified(tree).children[0])).toEqual(["b.md", "a.md"]);
  });

  it("falls back to name for equal timestamps", () => {
    const tree = dir("root", 1, [file("B.md", 1), file("a.md", 1)]);
    expect(names(sortTreeByModified(tree))).toEqual(["a.md", "B.md"]);
  });

  it("does not mutate the input", () => {
    const tree = dir("root", 2, [file("a.md", 1), file("b.md", 2)]);
    sortTreeByModified(tree);
    expect(names(tree)).toEqual(["a.md", "b.md"]);
  });
});
