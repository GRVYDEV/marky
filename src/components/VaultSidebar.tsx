import { useEffect, useState, useCallback } from "react";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { tauri, onVaultChanged, type Vault, type TreeNode } from "@/lib/tauri";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Plus, Trash2, FolderTree } from "lucide-react";
import { FileTreeNode } from "@/components/FileTree";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

interface Props {
  activePath?: string;
  onOpenFile: (absolutePath: string) => void;
}

export function VaultSidebar({ activePath, onOpenFile }: Props) {
  const [vaults, setVaults] = useState<Vault[]>([]);
  const [trees, setTrees] = useState<Record<string, TreeNode>>({});
  const [activeVaultId, setActiveVaultId] = useState<string | null>(null);

  const loadVaults = useCallback(async () => {
    const list = await tauri.listVaults();
    setVaults(list);
    if (list.length && !activeVaultId) setActiveVaultId(list[0].id);
    const newTrees: Record<string, TreeNode> = {};
    for (const v of list) {
      try {
        newTrees[v.id] = await tauri.readVaultTree(v.id);
      } catch {
        // vault folder might be unreadable; skip
      }
    }
    setTrees(newTrees);
  }, [activeVaultId]);

  useEffect(() => {
    loadVaults();
  }, [loadVaults]);

  useEffect(() => {
    const off = onVaultChanged(async (vaultId) => {
      try {
        const tree = await tauri.readVaultTree(vaultId);
        setTrees((prev) => ({ ...prev, [vaultId]: tree }));
      } catch {
        // ignore
      }
    });
    return () => {
      off.then((fn) => fn());
    };
  }, []);

  const handleAdd = async () => {
    const picked = await openDialog({ directory: true, multiple: false });
    if (typeof picked === "string") {
      await tauri.addVault(picked);
      await loadVaults();
    }
  };

  const handleRemove = async (id: string) => {
    await tauri.removeVault(id);
    if (activeVaultId === id) setActiveVaultId(null);
    await loadVaults();
  };

  return (
    <div className="flex h-full w-64 shrink-0 flex-col border-r bg-card/50">
      <div className="flex items-center justify-between px-3 py-2">
        <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          <FolderTree className="h-3.5 w-3.5" />
          Vaults
        </div>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button onClick={handleAdd} variant="ghost" size="icon" className="h-6 w-6">
              <Plus className="h-3.5 w-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Add vault folder</TooltipContent>
        </Tooltip>
      </div>

      {vaults.length === 0 && (
        <div className="px-3 py-4 text-xs text-muted-foreground">
          No vaults. Click + to add a folder.
        </div>
      )}

      <ScrollArea className="flex-1">
        <div className="px-1 pb-4">
          {vaults.map((v) => {
            const tree = trees[v.id];
            const isActive = v.id === activeVaultId;
            return (
              <div key={v.id} className="mb-2">
                <div
                  className="flex items-center justify-between gap-1 rounded px-2 py-1 hover:bg-accent/50"
                  onClick={() => setActiveVaultId(v.id)}
                >
                  <span className="truncate text-xs font-medium">{v.name}</span>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleRemove(v.id);
                        }}
                        variant="ghost"
                        size="icon"
                        className="h-5 w-5 opacity-0 group-hover:opacity-100"
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Remove vault</TooltipContent>
                  </Tooltip>
                </div>
                {isActive && tree && (
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
