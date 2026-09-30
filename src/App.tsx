import { useEffect, useReducer, useState, useCallback, useRef } from "react";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { ThemeProvider } from "@/lib/theme";
import { PreferencesProvider, usePreferences } from "@/lib/preferences";
import { ResizeHandle } from "@/components/ResizeHandle";
import { TooltipProvider } from "@/components/ui/tooltip";
import { FolderSidebar } from "@/components/FolderSidebar";
import { Pane } from "@/components/Pane";
import { TableOfContents } from "@/components/TableOfContents";
import { Toolbar } from "@/components/Toolbar";
import { CommandPalette } from "@/components/CommandPalette";
import {
  tauri,
  onCliTarget,
  onFolderChanged,
  onFileChanged,
  onMenuAction,
  type AnnotatedFolder,
  type MenuAction,
} from "@/lib/tauri";
import { pickAndAddFolder } from "@/lib/folders";
import {
  createInitialState,
  reduce,
  getActivePane,
  getActiveTab,
  type SplitDirection,
} from "@/lib/workspace";
import { cn } from "@/lib/utils";

const WELCOME = `# Welcome to Marky

A fast markdown viewer with folder support.

- Press **⌘K** to open the command palette and search files.
- Press **⌘O** to open a file. **⌘F** searches inside the open document.
- Add a folder from the sidebar; it stays available across sessions.
- **⌘\\** splits the active pane vertically. **⌘⇧\\** splits horizontally.
- Drop a file onto the window to open it as a new tab.

Launch from the terminal:

\`\`\`bash
marky README.md       # open a file
marky ./docs/         # open a folder (auto-saved)
\`\`\`
`;

function AppShell() {
  const [state, dispatch] = useReducer(reduce, undefined, () => createInitialState(WELCOME));
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [searchPaneId, setSearchPaneId] = useState<string | null>(null);
  const [folders, setFolders] = useState<AnnotatedFolder[]>([]);
  const [sidebarRefresh, setSidebarRefresh] = useState(0);
  const sidebarRef = useRef<HTMLDivElement>(null);
  const {
    zoomIn, zoomOut, zoomReset,
    sidebarLeftWidth, sidebarRightWidth,
    setSidebarWidth, resetSidebarWidth,
  } = usePreferences();

  const activeTab = getActiveTab(state);
  const activePane = getActivePane(state);
  const isSplit = state.panes.length > 1;

  const refreshFolders = useCallback(async () => {
    setFolders(await tauri.listFoldersGrouped());
    setSidebarRefresh((n) => n + 1);
  }, []);

  const openFile = useCallback(async (path: string) => {
    try {
      const text = await tauri.readFile(path);
      const title = path.split("/").pop() ?? path;
      dispatch({ type: "OPEN_FILE", path, title, source: text });
    } catch (err) {
      console.error("failed to read file", err);
    }
  }, []);

  // Initial load.
  useEffect(() => {
    (async () => {
      const target = await tauri.getInitialTarget();
      if (target.kind === "file") openFile(target.path);
      if (target.kind === "folder") setSidebarRefresh((n) => n + 1);
      refreshFolders();
    })();
  }, [openFile, refreshFolders]);

  // Keep App-level folders in sync whenever folders are added/removed/changed.
  useEffect(() => {
    const off = onFolderChanged(() => {
      refreshFolders();
    });
    return () => {
      off.then((fn) => fn());
    };
  }, [refreshFolders]);

  // Re-read open files when they change on disk.
  useEffect(() => {
    const off = onFileChanged(async (paths) => {
      for (const tab of Object.values(state.tabs)) {
        if (tab.filePath && paths.includes(tab.filePath)) {
          try {
            const text = await tauri.readFile(tab.filePath);
            dispatch({ type: "UPDATE_TAB_SOURCE", tabId: tab.id, source: text });
          } catch {
            // File may have been deleted; ignore
          }
        }
      }
    });
    return () => {
      off.then((fn) => fn());
    };
  }, [state.tabs]);

  // CLI re-target via single-instance.
  useEffect(() => {
    const off = onCliTarget((t) => {
      if (t.kind === "file") openFile(t.path);
      if (t.kind === "folder") {
        // Sidebar will pick up the new folder via its own folder://changed
        // listener, but we also bump refreshNonce and scroll it into view.
        refreshFolders();
        setTimeout(() => {
          sidebarRef.current
            ?.querySelector(`#folder-${cssEscape(folderIdFromPath(t.path) ?? "")}`)
            ?.scrollIntoView({ block: "start" });
        }, 100);
      }
    });
    return () => {
      off.then((fn) => fn());
    };
  }, [openFile, refreshFolders]);

  // Map a path back to a folder id for scroll-into-view (best-effort).
  const [pathToFolderId, setPathToFolderId] = useState<Record<string, string>>({});
  useEffect(() => {
    const map: Record<string, string> = {};
    for (const f of folders) map[f.path] = f.id;
    setPathToFolderId(map);
  }, [folders]);
  function folderIdFromPath(p: string): string | null {
    return pathToFolderId[p] ?? null;
  }

  // File drop opens as new tab.
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

  const handleSplit = (d: SplitDirection) => dispatch({ type: "SPLIT", direction: d });
  const handleCloseSplit = () => dispatch({ type: "CLOSE_SPLIT" });
  const handleJumpToFolder = (folderId: string) => {
    sidebarRef.current
      ?.querySelector(`#folder-${cssEscape(folderId)}`)
      ?.scrollIntoView({ block: "start" });
  };

  // Route native menu actions. Kept in a ref (updated every render) so the
  // listener below is registered exactly once and never sees stale state.
  const menuHandlerRef = useRef<(action: MenuAction) => void>(() => {});
  menuHandlerRef.current = async (action: MenuAction) => {
    switch (action) {
      case "open":
        handlePickFile();
        break;
      case "open-folder": {
        const folder = await pickAndAddFolder();
        if (folder) refreshFolders();
        break;
      }
      case "reload-file": {
        if (activeTab?.filePath) {
          try {
            const text = await tauri.readFile(activeTab.filePath);
            dispatch({ type: "UPDATE_TAB_SOURCE", tabId: activeTab.id, source: text });
          } catch (err) {
            console.error("failed to reload file", err);
          }
        }
        break;
      }
      case "close-tab": {
        const tabId = activePane.activeTabId;
        if (tabId) dispatch({ type: "CLOSE_TAB", tabId, paneId: activePane.id });
        break;
      }
      case "find":
        setSearchPaneId(state.activePaneId);
        break;
      case "command-palette":
        setPaletteOpen((v) => !v);
        break;
      case "split-right":
        dispatch({ type: "SPLIT", direction: "vertical" });
        break;
      case "split-down":
        dispatch({ type: "SPLIT", direction: "horizontal" });
        break;
      case "close-split":
        handleCloseSplit();
        break;
      case "zoom-in":
        zoomIn();
        break;
      case "zoom-out":
        zoomOut();
        break;
      case "zoom-reset":
        zoomReset();
        break;
      case "rescan-folder":
      case "close-folder":
        // TODO(#002)
        break;
      case "print":
      case "reveal":
      case "open-with":
        // TODO(#005)
        break;
      case "export-html":
      case "export-markdown":
        // TODO(#006)
        break;
    }
  };

  useEffect(() => {
    const off = onMenuAction((action) => menuHandlerRef.current(action));
    return () => {
      off.then((fn) => fn());
    };
  }, []);

  const renderPane = (paneId: string) => {
    const pane = state.panes.find((p) => p.id === paneId)!;
    return (
      <Pane
        key={pane.id}
        pane={pane}
        tabs={state.tabs}
        isFocused={pane.id === state.activePaneId}
        onSelectTab={(tabId) => dispatch({ type: "SWITCH_TAB", paneId: pane.id, tabId })}
        onCloseTab={(tabId) => dispatch({ type: "CLOSE_TAB", tabId, paneId: pane.id })}
        onFocusPane={() => dispatch({ type: "FOCUS_PANE", paneId: pane.id })}
        searchOpen={searchPaneId === pane.id}
        onSearchClose={() => setSearchPaneId(null)}
      />
    );
  };

  return (
    <div className="flex h-full">
      <div ref={sidebarRef} className="flex h-full min-h-0 shrink-0" style={{ width: sidebarLeftWidth }}>
        <FolderSidebar
          activePath={activeTab?.filePath}
          onOpenFile={openFile}
          onOpenPalette={() => setPaletteOpen(true)}
          refreshNonce={sidebarRefresh}
        />
      </div>
      <ResizeHandle
        side="left"
        onResize={(w) => setSidebarWidth("left", w)}
        onReset={() => resetSidebarWidth("left")}
      />
      <div className="flex min-w-0 flex-1 flex-col">
        <Toolbar
          filePath={activeTab?.filePath}
          onOpenFile={handlePickFile}
          onSplit={handleSplit}
          onCloseSplit={handleCloseSplit}
          isSplit={isSplit}
          onFind={() => setSearchPaneId(state.activePaneId)}
        />
        <div className="flex min-h-0 flex-1">
          <main className="min-w-0 flex-1">
            <div
              className={cn(
                "flex h-full",
                state.split === "horizontal" ? "flex-col" : "flex-row"
              )}
            >
              {state.panes.map((p, i) => (
                <div key={p.id} className="flex min-h-0 min-w-0 flex-1">
                  {renderPane(p.id)}
                  {i < state.panes.length - 1 && (
                    <div
                      className={cn(
                        "shrink-0 bg-border",
                        state.split === "horizontal" ? "h-px w-full" : "h-full w-px"
                      )}
                    />
                  )}
                </div>
              ))}
            </div>
          </main>
          {!isSplit && (
            <>
              <ResizeHandle
                side="right"
                onResize={(w) => setSidebarWidth("right", w)}
                onReset={() => resetSidebarWidth("right")}
                className="hidden lg:flex"
              />
              <aside className="hidden shrink-0 border-l bg-card/30 lg:block" style={{ width: sidebarRightWidth }}>
                <TableOfContents source={activeTab?.source ?? ""} />
              </aside>
            </>
          )}
        </div>
      </div>
      <CommandPalette
        open={paletteOpen}
        onOpenChange={setPaletteOpen}
        onOpenFile={openFile}
        onSplit={handleSplit}
        onCloseSplit={handleCloseSplit}
        isSplit={isSplit}
        folders={folders}
        onJumpToFolder={handleJumpToFolder}
      />
    </div>
  );
}

function cssEscape(s: string): string {
  // Minimal escape for use in attribute selectors with UUID-like ids.
  return s.replace(/([^a-zA-Z0-9_-])/g, "\\$1");
}

export default function App() {
  return (
    <ThemeProvider>
      <PreferencesProvider>
        <TooltipProvider delayDuration={300}>
          <AppShell />
        </TooltipProvider>
      </PreferencesProvider>
    </ThemeProvider>
  );
}
