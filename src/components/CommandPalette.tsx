import { useEffect, useState } from "react";
import {
  CommandDialog,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
} from "@/components/ui/command";
import { Badge } from "@/components/ui/badge";
import { tauri, type SearchResult } from "@/lib/tauri";
import { FileText, Sun, Moon, FolderPlus, Monitor } from "lucide-react";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { useTheme, type Theme } from "@/lib/theme";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onOpenFile: (path: string) => void;
}

export function CommandPalette({ open, onOpenChange, onOpenFile }: Props) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const { setTheme } = useTheme();

  useEffect(() => {
    if (!open) {
      setQuery("");
      return;
    }
    let cancelled = false;
    const t = setTimeout(async () => {
      try {
        const r = await tauri.searchVaultFiles(query, 50);
        if (!cancelled) setResults(r);
      } catch {
        if (!cancelled) setResults([]);
      }
    }, 25);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [query, open]);

  const handleAddVault = async () => {
    onOpenChange(false);
    const picked = await openDialog({ directory: true, multiple: false });
    if (typeof picked === "string") {
      await tauri.addVault(picked);
    }
  };

  const handleOpenFile = async () => {
    onOpenChange(false);
    const picked = await openDialog({ multiple: false, filters: [{ name: "Markdown", extensions: ["md", "markdown", "mdx"] }] });
    if (typeof picked === "string") onOpenFile(picked);
  };

  const setAppTheme = (t: Theme) => {
    setTheme(t);
    onOpenChange(false);
  };

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <CommandInput value={query} onValueChange={setQuery} placeholder="Search files or run a command…" />
      <CommandList>
        <CommandEmpty>No results.</CommandEmpty>

        {query === "" && (
          <CommandGroup heading="Actions">
            <CommandItem onSelect={handleOpenFile}>
              <FileText className="mr-2 h-4 w-4" />
              Open File…
            </CommandItem>
            <CommandItem onSelect={handleAddVault}>
              <FolderPlus className="mr-2 h-4 w-4" />
              Add Vault…
            </CommandItem>
            <CommandItem onSelect={() => setAppTheme("light")}>
              <Sun className="mr-2 h-4 w-4" />
              Theme: Light
            </CommandItem>
            <CommandItem onSelect={() => setAppTheme("dark")}>
              <Moon className="mr-2 h-4 w-4" />
              Theme: Dark
            </CommandItem>
            <CommandItem onSelect={() => setAppTheme("system")}>
              <Monitor className="mr-2 h-4 w-4" />
              Theme: System
            </CommandItem>
          </CommandGroup>
        )}

        {results.length > 0 && (
          <CommandGroup heading="Files">
            {results.map((r) => (
              <CommandItem
                key={r.absolute_path}
                value={`${r.vault_name}/${r.relative_path}`}
                onSelect={() => {
                  onOpenChange(false);
                  onOpenFile(r.absolute_path);
                }}
              >
                <FileText className="mr-2 h-4 w-4 shrink-0 text-muted-foreground" />
                <div className="flex-1 truncate">
                  <div className="truncate font-medium">{r.relative_path.split("/").pop()}</div>
                  <div className="truncate text-xs text-muted-foreground">{r.relative_path}</div>
                </div>
                <Badge variant="muted" className="ml-2 shrink-0">{r.vault_name}</Badge>
              </CommandItem>
            ))}
          </CommandGroup>
        )}
      </CommandList>
    </CommandDialog>
  );
}
