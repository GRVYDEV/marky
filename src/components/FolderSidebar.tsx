import { useEffect, useState, useCallback } from "react";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { tauri, onFolderChanged, type Folder, type TreeNode } from "@/lib/tauri";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Plus, X, ChevronDown, ChevronRight, FolderTree, Search } from "lucide-react";
import { FileTreeNode } from "@/components/FileTree";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

interface Props {
  activePath?: string;
  onOpenFile: (absolutePath: string) => void;
  onOpenPalette: () => void;
  refreshNonce?: number;
}

export function FolderSidebar({ activePath, onOpenFile, onOpenPalette, refreshNonce }: Props) {
  const [folders, setFolders] = useState<Folder[]>([]);
  const [trees, setTrees] = useState<Record<string, TreeNode>>({});
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  const loadAll = useCallback(async () => {
    const list = await tauri.listFolders();
    setFolders(list);
    const newTrees: Record<string, TreeNode> = {};
    await Promise.all(
      list.map(async (f) => {
        try {
          newTrees[f.id] = await tauri.readFolderTree(f.id);
        } catch {
          // unreadable folder
        }
      })
    );
    setTrees(newTrees);
  }, []);

  useEffect(() => {
    loadAll();
  }, [loadAll, refreshNonce]);

  useEffect(() => {
    const off = onFolderChanged(async (folderId) => {
      try {
        const tree = await tauri.readFolderTree(folderId);
        setTrees((prev) => ({ ...prev, [folderId]: tree }));
      } catch {
        // ignore
      }
      const list = await tauri.listFolders();
      setFolders(list);
    });
    return () => {
      off.then((fn) => fn());
    };
  }, []);

  const handleAdd = async () => {
    const picked = await openDialog({ directory: true, multiple: false });
    if (typeof picked === "string") {
      await tauri.addFolder(picked);
      await loadAll();
    }
  };

  const handleRemove = async (id: string) => {
    await tauri.removeFolder(id);
    await loadAll();
  };

  return (
    <div className="flex h-full w-64 shrink-0 flex-col border-r bg-card">
      <div className="px-2 pt-2">
        <button
          type="button"
          onClick={onOpenPalette}
          className="flex w-full items-center gap-2 rounded-md border bg-background px-2 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
        >
          <Search className="h-3.5 w-3.5 shrink-0" />
          <span className="flex-1 truncate text-left">Search files…</span>
          <kbd className="pointer-events-none inline-flex h-4 select-none items-center gap-0.5 rounded border bg-muted px-1 font-mono text-[10px] font-medium text-muted-foreground">
            <span className="text-xs">⌘</span>K
          </kbd>
        </button>
      </div>
      <div className="flex items-center justify-between px-3 py-2">
        <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          <FolderTree className="h-3.5 w-3.5" />
          Folders
        </div>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button onClick={handleAdd} variant="ghost" size="icon" className="h-6 w-6">
              <Plus className="h-3.5 w-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="right">Add folder</TooltipContent>
        </Tooltip>
      </div>

      {folders.length === 0 && (
        <div className="px-3 py-4 text-xs text-muted-foreground">
          No folders. Click + to add one.
        </div>
      )}

      <ScrollArea className="min-h-0 flex-1">
        <div className="px-1 pb-4">
          {folders.map((f) => {
            const tree = trees[f.id];
            const isCollapsed = collapsed[f.id];
            return (
              <div key={f.id} id={`folder-${f.id}`} className="group mb-1">
                <div className="flex items-center justify-between gap-1 rounded px-1 py-0.5 hover:bg-accent">
                  <button
                    type="button"
                    onClick={() => setCollapsed((c) => ({ ...c, [f.id]: !c[f.id] }))}
                    className="flex flex-1 items-center gap-1 truncate text-left"
                  >
                    {isCollapsed ? (
                      <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    ) : (
                      <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    )}
                    <span className="truncate text-xs font-semibold">{f.name}</span>
                  </button>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        onClick={() => handleRemove(f.id)}
                        variant="ghost"
                        size="icon"
                        className={cn(
                          "h-5 w-5 opacity-0 transition-opacity",
                          "group-hover:opacity-100"
                        )}
                      >
                        <X className="h-3 w-3" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent side="right">Remove from list</TooltipContent>
                  </Tooltip>
                </div>
                {!isCollapsed && tree && (
                  <FileTreeNode node={tree} isRoot activePath={activePath} onOpen={onOpenFile} />
                )}
              </div>
            );
          })}
        </div>
      </ScrollArea>
    </div>
  );
}
