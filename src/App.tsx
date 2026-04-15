import { useEffect, useState, useCallback } from "react";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { ThemeProvider } from "@/lib/theme";
import { TooltipProvider } from "@/components/ui/tooltip";
import { VaultSidebar } from "@/components/VaultSidebar";
import { Viewer } from "@/components/Viewer";
import { TableOfContents } from "@/components/TableOfContents";
import { Toolbar } from "@/components/Toolbar";
import { CommandPalette } from "@/components/CommandPalette";
import { tauri, onCliTarget } from "@/lib/tauri";

const WELCOME = `# Welcome to Marky

A fast markdown viewer with vault support.

- Press **⌘K** (or **Ctrl+K**) to open the command palette and search files.
- Press **⌘O** (or **Ctrl+O**) to open a file.
- Add a vault folder from the sidebar to keep it available across sessions.
- Drop a markdown file onto the window to view it.

Launch from the terminal:

\`\`\`bash
marky README.md      # open a file
marky ./docs/        # open a folder as a vault
\`\`\`
`;

function AppShell() {
  const [filePath, setFilePath] = useState<string | undefined>();
  const [source, setSource] = useState<string>(WELCOME);
  const [paletteOpen, setPaletteOpen] = useState(false);

  const openFile = useCallback(async (path: string) => {
    try {
      const text = await tauri.readFile(path);
      setSource(text);
      setFilePath(path);
    } catch (err) {
      console.error("failed to read file", err);
    }
  }, []);

  // Initial load: from CLI target or welcome.
  useEffect(() => {
    (async () => {
      const target = await tauri.getInitialTarget();
      if (target.kind === "file") openFile(target.path);
    })();
  }, [openFile]);

  // CLI re-open via single-instance.
  useEffect(() => {
    const off = onCliTarget((t) => {
      if (t.kind === "file") openFile(t.path);
    });
    return () => {
      off.then((fn) => fn());
    };
  }, [openFile]);

  // Global keyboard shortcuts.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const meta = e.metaKey || e.ctrlKey;
      if (meta && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen((v) => !v);
      } else if (meta && e.key.toLowerCase() === "o") {
        e.preventDefault();
        handlePickFile();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // File drop.
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    (async () => {
      const off = await getCurrentWebview().onDragDropEvent((e) => {
        if (e.payload.type === "drop" && e.payload.paths.length > 0) {
          openFile(e.payload.paths[0]);
        }
      });
      unlisten = off;
    })();
    return () => unlisten?.();
  }, [openFile]);

  const handlePickFile = async () => {
    const picked = await openDialog({
      multiple: false,
      filters: [{ name: "Markdown", extensions: ["md", "markdown", "mdx"] }],
    });
    if (typeof picked === "string") openFile(picked);
  };

  return (
    <div className="flex h-full">
      <VaultSidebar activePath={filePath} onOpenFile={openFile} />
      <div className="flex min-w-0 flex-1 flex-col">
        <Toolbar
          filePath={filePath}
          onOpenPalette={() => setPaletteOpen(true)}
          onOpenFile={handlePickFile}
        />
        <div className="flex min-h-0 flex-1">
          <main className="min-w-0 flex-1">
            <Viewer source={source} filePath={filePath} />
          </main>
          <aside className="hidden w-56 shrink-0 border-l bg-card/30 lg:block">
            <TableOfContents source={source} />
          </aside>
        </div>
      </div>
      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} onOpenFile={openFile} />
    </div>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <TooltipProvider delayDuration={300}>
        <AppShell />
      </TooltipProvider>
    </ThemeProvider>
  );
}
