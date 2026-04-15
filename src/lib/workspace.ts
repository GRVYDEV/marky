/**
 * Workspace state: tabs distributed across one or two panes.
 *
 * Invariants:
 *   - There are always 1 or 2 panes.
 *   - Every tab id in `tabOrder` exists in `tabs`.
 *   - Each tab id appears in exactly one pane.
 *   - `activePaneId` is one of the panes.
 *   - A pane with no tabs is allowed momentarily during reduction;
 *     `closeEmptyPane()` is invoked at the end of every action.
 */

export type SplitDirection = "horizontal" | "vertical";

export interface TabState {
  id: string;
  filePath?: string;
  title: string;
  source: string;
}

export interface PaneState {
  id: string;
  tabIds: string[];
  activeTabId: string | null;
}

export interface WorkspaceState {
  tabs: Record<string, TabState>;
  panes: PaneState[];
  activePaneId: string;
  split: SplitDirection | null;
  nextTabId: number;
  nextPaneId: number;
}

export type Action =
  | { type: "OPEN_FILE"; path: string; title: string; source: string; paneId?: string }
  | { type: "OPEN_WELCOME"; source: string }
  | { type: "UPDATE_TAB_SOURCE"; tabId: string; source: string }
  | { type: "CLOSE_TAB"; tabId: string; paneId: string }
  | { type: "SWITCH_TAB"; paneId: string; tabId: string }
  | { type: "FOCUS_PANE"; paneId: string }
  | { type: "SPLIT"; direction: SplitDirection }
  | { type: "CLOSE_SPLIT" };

const WELCOME_TITLE = "Welcome";

export function createInitialState(welcomeSource: string): WorkspaceState {
  const tabId = "t0";
  const paneId = "p0";
  return {
    tabs: {
      [tabId]: { id: tabId, title: WELCOME_TITLE, source: welcomeSource },
    },
    panes: [{ id: paneId, tabIds: [tabId], activeTabId: tabId }],
    activePaneId: paneId,
    split: null,
    nextTabId: 1,
    nextPaneId: 1,
  };
}

function findTabByPath(state: WorkspaceState, path: string): { paneId: string; tabId: string } | null {
  for (const pane of state.panes) {
    for (const tabId of pane.tabIds) {
      if (state.tabs[tabId]?.filePath === path) {
        return { paneId: pane.id, tabId };
      }
    }
  }
  return null;
}

function withPane(state: WorkspaceState, paneId: string, fn: (p: PaneState) => PaneState): WorkspaceState {
  return { ...state, panes: state.panes.map((p) => (p.id === paneId ? fn(p) : p)) };
}

/**
 * Drop empty panes when we have a split. If the split collapses to one pane,
 * clear `split` so the layout returns to a single view.
 */
function compact(state: WorkspaceState): WorkspaceState {
  const nonEmpty = state.panes.filter((p) => p.tabIds.length > 0);
  if (nonEmpty.length === state.panes.length) return state;

  // If everything is empty, keep one pane with a fresh welcome-less state.
  // (Caller is expected to push a tab immediately; this is a transient state.)
  if (nonEmpty.length === 0) return state;

  const activeStillThere = nonEmpty.some((p) => p.id === state.activePaneId);
  return {
    ...state,
    panes: nonEmpty,
    split: nonEmpty.length === 1 ? null : state.split,
    activePaneId: activeStillThere ? state.activePaneId : nonEmpty[0].id,
  };
}

export function reduce(state: WorkspaceState, action: Action): WorkspaceState {
  switch (action.type) {
    case "OPEN_FILE": {
      const existing = findTabByPath(state, action.path);
      if (existing) {
        return {
          ...withPane(state, existing.paneId, (p) => ({ ...p, activeTabId: existing.tabId })),
          activePaneId: existing.paneId,
        };
      }
      const tabId = `t${state.nextTabId}`;
      const paneId = action.paneId ?? state.activePaneId;
      const newTab: TabState = {
        id: tabId,
        filePath: action.path,
        title: action.title,
        source: action.source,
      };
      return {
        ...state,
        tabs: { ...state.tabs, [tabId]: newTab },
        panes: state.panes.map((p) =>
          p.id === paneId ? { ...p, tabIds: [...p.tabIds, tabId], activeTabId: tabId } : p
        ),
        activePaneId: paneId,
        nextTabId: state.nextTabId + 1,
      };
    }

    case "OPEN_WELCOME": {
      const tabId = `t${state.nextTabId}`;
      const paneId = state.activePaneId;
      return {
        ...state,
        tabs: {
          ...state.tabs,
          [tabId]: { id: tabId, title: WELCOME_TITLE, source: action.source },
        },
        panes: state.panes.map((p) =>
          p.id === paneId ? { ...p, tabIds: [...p.tabIds, tabId], activeTabId: tabId } : p
        ),
        nextTabId: state.nextTabId + 1,
      };
    }

    case "UPDATE_TAB_SOURCE": {
      const t = state.tabs[action.tabId];
      if (!t) return state;
      return {
        ...state,
        tabs: { ...state.tabs, [action.tabId]: { ...t, source: action.source } },
      };
    }

    case "CLOSE_TAB": {
      const pane = state.panes.find((p) => p.id === action.paneId);
      if (!pane || !pane.tabIds.includes(action.tabId)) return state;
      const idx = pane.tabIds.indexOf(action.tabId);
      const remaining = pane.tabIds.filter((id) => id !== action.tabId);
      const nextActive =
        pane.activeTabId === action.tabId
          ? remaining[Math.min(idx, remaining.length - 1)] ?? null
          : pane.activeTabId;

      const { [action.tabId]: _removed, ...restTabs } = state.tabs;

      const updated: WorkspaceState = {
        ...state,
        tabs: restTabs,
        panes: state.panes.map((p) =>
          p.id === pane.id ? { ...p, tabIds: remaining, activeTabId: nextActive } : p
        ),
      };
      return compact(updated);
    }

    case "SWITCH_TAB": {
      return {
        ...withPane(state, action.paneId, (p) =>
          p.tabIds.includes(action.tabId) ? { ...p, activeTabId: action.tabId } : p
        ),
        activePaneId: action.paneId,
      };
    }

    case "FOCUS_PANE": {
      if (!state.panes.some((p) => p.id === action.paneId)) return state;
      return { ...state, activePaneId: action.paneId };
    }

    case "SPLIT": {
      if (state.panes.length >= 2) {
        // Already split; only update direction.
        return { ...state, split: action.direction };
      }
      const newPaneId = `p${state.nextPaneId}`;
      // Start the new pane empty. Cloning the active tab caused two Viewers
      // to highlight the same source concurrently and step on each other's
      // pre.outerHTML swaps — that locked the renderer up.
      return {
        ...state,
        panes: [...state.panes, { id: newPaneId, tabIds: [], activeTabId: null }],
        activePaneId: newPaneId,
        split: action.direction,
        nextPaneId: state.nextPaneId + 1,
      };
    }

    case "CLOSE_SPLIT": {
      if (state.panes.length < 2) return state;
      // Keep the active pane, drop the others.
      const keep = state.panes.find((p) => p.id === state.activePaneId) ?? state.panes[0];
      const droppedTabIds = state.panes
        .filter((p) => p.id !== keep.id)
        .flatMap((p) => p.tabIds);
      const restTabs = { ...state.tabs };
      for (const id of droppedTabIds) delete restTabs[id];
      return {
        ...state,
        tabs: restTabs,
        panes: [keep],
        split: null,
        activePaneId: keep.id,
      };
    }
  }
}

export function getActivePane(state: WorkspaceState): PaneState {
  return state.panes.find((p) => p.id === state.activePaneId) ?? state.panes[0];
}

export function getActiveTab(state: WorkspaceState): TabState | undefined {
  const pane = getActivePane(state);
  return pane.activeTabId ? state.tabs[pane.activeTabId] : undefined;
}
