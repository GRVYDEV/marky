import { useEffect, useState, useCallback } from "react";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { tauri, onFolderChanged, type AnnotatedFolder, type TreeNode } from "@/lib/tauri";
import { usePreferences } from "@/lib/preferences";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Plus, X, ChevronDown, ChevronRight, FolderTree, Search, Layers, List } from "lucide-react";
import { FileTreeNode } from "@/components/FileTree";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

interface Props {
  activePath?: string;
  onOpenFile: (absolutePath: string) => void;
  onOpenPalette: () => void;
  refreshNonce?: number;
}

interface RepoGroup {
  key: string;
  label: string;
  folders: AnnotatedFolder[];
}

function groupByRepo(folders: AnnotatedFolder[]): RepoGroup[] {
  const map = new Map<string, RepoGroup>();
  for (const f of folders) {
    const key = f.repo_root ?? "__none__";
    const label = f.repo_name ?? "(no repo)";
    let group = map.get(key);
    if (!group) {
      group = { key, label, folders: [] };
      map.set(key, group);
    }
    group.folders.push(f);
  }
  const groups = Array.from(map.values());
  groups.sort((a, b) => {
    if (a.key === "__none__") return 1;
    if (b.key === "__none__") return -1;
    return a.label.localeCompare(b.label);
  });
  return groups;
}

export function FolderSidebar({ activePath, onOpenFile, onOpenPalette, refreshNonce }: Props) {
  const [folders, setFolders] = useState<AnnotatedFolder[]>([]);
  const [trees, setTrees] = useState<Record<string, TreeNode>>({});
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({});
  const { sidebarGroupByRepo, setSidebarGroupByRepo } = usePreferences();

  const loadAll = useCallback(async () => {
    const list = await tauri.listFoldersGrouped();
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
      const list = await tauri.listFoldersGrouped();
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

  const renderFolder = (f: AnnotatedFolder) => {
    const tree = trees[f.id];
    const isCollapsed = collapsed[f.id];
    return (
      <div key={f.id} id={`folder-${f.id}`} className="group/folder mb-1">
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
                  "group-hover/folder:opacity-100"
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
  };

  const groups = groupByRepo(folders);

  return (
    <div className="flex h-full w-full shrink-0 flex-col border-r bg-card">
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
        <div className="flex items-center gap-0.5">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                onClick={() => setSidebarGroupByRepo(!sidebarGroupByRepo)}
                variant="ghost"
                size="icon"
                className="h-6 w-6"
              >
                {sidebarGroupByRepo ? (
                  <List className="h-3.5 w-3.5" />
                ) : (
                  <Layers className="h-3.5 w-3.5" />
                )}
              </Button>
            </TooltipTrigger>
            <TooltipContent side="right">
              {sidebarGroupByRepo ? "Flat view" : "Group by repository"}
            </TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button onClick={handleAdd} variant="ghost" size="icon" className="h-6 w-6">
                <Plus className="h-3.5 w-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="right">Add folder</TooltipContent>
          </Tooltip>
        </div>
      </div>

      {folders.length === 0 && (
        <div className="px-3 py-4 text-xs text-muted-foreground">
          No folders. Click + to add one.
        </div>
      )}

      <ScrollArea className="min-h-0 flex-1">
        <div className="px-1 pb-4">
          {sidebarGroupByRepo
            ? groups.map((group) => (
                <Collapsible
                  key={group.key}
                  open={!collapsedGroups[group.key]}
                  onOpenChange={(open) =>
                    setCollapsedGroups((c) => ({ ...c, [group.key]: !open }))
                  }
                >
                  <CollapsibleTrigger className="flex w-full items-center gap-1.5 rounded px-1 py-1 text-left hover:bg-accent">
                    {collapsedGroups[group.key] ? (
                      <ChevronRight className="h-3 w-3 shrink-0 text-muted-foreground" />
                    ) : (
                      <ChevronDown className="h-3 w-3 shrink-0 text-muted-foreground" />
                    )}
                    <span className="truncate text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                      {group.label}
                    </span>
                    <span className="ml-auto text-[10px] text-muted-foreground/60">
                      {group.folders.length}
                    </span>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <div className="pl-1">
                      {group.folders.map(renderFolder)}
                    </div>
                  </CollapsibleContent>
                </Collapsible>
              ))
            : folders.map(renderFolder)}
        </div>
      </ScrollArea>
    </div>
  );
}
