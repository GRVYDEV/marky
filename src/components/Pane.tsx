import { useRef, useState } from "react";
import type { PaneState, TabState } from "@/lib/workspace";
import { TabBar } from "@/components/TabBar";
import { Viewer } from "@/components/Viewer";
import { DocSearch } from "@/components/DocSearch";
import { cn } from "@/lib/utils";

interface Props {
  pane: PaneState;
  tabs: Record<string, TabState>;
  isFocused: boolean;
  onSelectTab: (tabId: string) => void;
  onCloseTab: (tabId: string) => void;
  onFocusPane: () => void;
  searchOpen: boolean;
  onSearchClose: () => void;
}

export function Pane({
  pane,
  tabs,
  isFocused,
  onSelectTab,
  onCloseTab,
  onFocusPane,
  searchOpen,
  onSearchClose,
}: Props) {
  const activeTab = pane.activeTabId ? tabs[pane.activeTabId] : undefined;
  const articleRef = useRef<HTMLElement>(null);
  const [contentNonce, setContentNonce] = useState(0);

  return (
    <div
      onMouseDown={onFocusPane}
      className={cn(
        "relative flex min-h-0 min-w-0 flex-1 flex-col",
        isFocused ? "ring-1 ring-ring/30" : ""
      )}
    >
      <TabBar
        pane={pane}
        tabs={tabs}
        isFocused={isFocused}
        onSelect={onSelectTab}
        onClose={onCloseTab}
        onFocusPane={onFocusPane}
      />
      <div className="relative flex min-h-0 flex-1">
        {activeTab ? (
          <Viewer
            key={activeTab.id}
            source={activeTab.source}
            filePath={activeTab.filePath}
            articleRef={articleRef}
            onRendered={() => setContentNonce((n) => n + 1)}
          />
        ) : (
          <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
            Empty pane
          </div>
        )}
        <DocSearch
          open={searchOpen}
          onClose={onSearchClose}
          containerRef={articleRef}
          contentNonce={contentNonce}
        />
      </div>
    </div>
  );
}
