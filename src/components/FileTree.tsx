import { useState } from "react";
import { ChevronRight, FileText, Folder } from "lucide-react";
import type { TreeNode } from "@/lib/tauri";
import { cn } from "@/lib/utils";

interface Props {
  node: TreeNode;
  depth?: number;
  activePath?: string;
  onOpen: (absolutePath: string) => void;
  isRoot?: boolean;
}

export function FileTreeNode({ node, depth = 0, activePath, onOpen, isRoot }: Props) {
  const [open, setOpen] = useState(depth < 1);

  if (isRoot) {
    // Render only the children of the root, no row for the root itself.
    return (
      <ul className="text-sm">
        {node.children.map((c) => (
          <FileTreeNode key={c.path} node={c} depth={0} activePath={activePath} onOpen={onOpen} />
        ))}
      </ul>
    );
  }

  if (node.is_dir) {
    return (
      <li>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="flex w-full items-center gap-1 rounded px-1.5 py-0.5 text-left hover:bg-accent"
          style={{ paddingLeft: `${0.4 + depth * 0.75}rem` }}
        >
          <ChevronRight
            className={cn("h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform", open && "rotate-90")}
          />
          <Folder className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          <span className="truncate">{node.name}</span>
        </button>
        {open && (
          <ul>
            {node.children.map((c) => (
              <FileTreeNode key={c.path} node={c} depth={depth + 1} activePath={activePath} onOpen={onOpen} />
            ))}
          </ul>
        )}
      </li>
    );
  }

  const isActive = node.path === activePath;
  return (
    <li>
      <button
        type="button"
        onClick={() => onOpen(node.path)}
        className={cn(
          "flex w-full items-center gap-1 rounded px-1.5 py-0.5 text-left hover:bg-accent",
          isActive && "bg-accent text-accent-foreground"
        )}
        style={{ paddingLeft: `${0.4 + (depth + 0.6) * 0.75}rem` }}
      >
        <FileText className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        <span className="truncate">{node.name}</span>
      </button>
    </li>
  );
}
