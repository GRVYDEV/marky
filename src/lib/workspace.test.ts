import { describe, expect, it } from "vitest";
import { createInitialState, reduce, getActivePane, getActiveTab } from "./workspace";

const open = (state: ReturnType<typeof createInitialState>, path: string, source = "x") =>
  reduce(state, { type: "OPEN_FILE", path, title: path, source });

describe("workspace reducer", () => {
  it("starts with one welcome tab in one pane", () => {
    const s = createInitialState("welcome");
    expect(s.panes).toHaveLength(1);
    expect(Object.keys(s.tabs)).toHaveLength(1);
    expect(getActiveTab(s)?.title).toBe("Welcome");
  });

  it("OPEN_FILE adds a new tab and activates it", () => {
    let s = createInitialState("w");
    s = open(s, "/a.md");
    expect(getActivePane(s).tabIds).toHaveLength(2);
    expect(getActiveTab(s)?.filePath).toBe("/a.md");
  });

  it("OPEN_FILE on an already-open path switches to existing tab instead of duplicating", () => {
    let s = createInitialState("w");
    s = open(s, "/a.md");
    s = open(s, "/b.md");
    s = open(s, "/a.md"); // same path again
    expect(getActivePane(s).tabIds).toHaveLength(3);
    expect(getActiveTab(s)?.filePath).toBe("/a.md");
  });

  it("CLOSE_TAB removes the tab and picks a sibling as active", () => {
    let s = createInitialState("w");
    s = open(s, "/a.md");
    s = open(s, "/b.md"); // active is b
    const pane = getActivePane(s);
    const aTabId = pane.tabIds[1]; // a is index 1
    s = reduce(s, { type: "CLOSE_TAB", tabId: aTabId, paneId: pane.id });
    expect(getActivePane(s).tabIds).toHaveLength(2);
    expect(getActiveTab(s)?.filePath).toBe("/b.md");
  });

  it("SPLIT clones the active tab into a new pane and switches focus", () => {
    let s = createInitialState("w");
    s = open(s, "/a.md");
    s = reduce(s, { type: "SPLIT", direction: "vertical" });
    expect(s.panes).toHaveLength(2);
    expect(s.split).toBe("vertical");
    const newPane = s.panes[1];
    expect(s.activePaneId).toBe(newPane.id);
    const clonedTab = s.tabs[newPane.activeTabId!];
    expect(clonedTab.filePath).toBe("/a.md");
  });

  it("OPEN_FILE goes into the active pane after split", () => {
    let s = createInitialState("w");
    s = open(s, "/a.md");
    s = reduce(s, { type: "SPLIT", direction: "vertical" });
    s = open(s, "/c.md");
    const right = s.panes[1];
    expect(right.tabIds.map((id) => s.tabs[id].filePath)).toContain("/c.md");
  });

  it("CLOSE_SPLIT collapses to the focused pane", () => {
    let s = createInitialState("w");
    s = open(s, "/a.md");
    s = reduce(s, { type: "SPLIT", direction: "horizontal" });
    s = open(s, "/c.md");
    s = reduce(s, { type: "CLOSE_SPLIT" });
    expect(s.panes).toHaveLength(1);
    expect(s.split).toBeNull();
    expect(getActiveTab(s)?.filePath).toBe("/c.md");
  });

  it("closing the last tab in the second pane collapses split automatically", () => {
    let s = createInitialState("w");
    s = open(s, "/a.md");
    s = reduce(s, { type: "SPLIT", direction: "vertical" });
    const newPane = s.panes[1];
    const onlyTab = newPane.activeTabId!;
    s = reduce(s, { type: "CLOSE_TAB", tabId: onlyTab, paneId: newPane.id });
    expect(s.panes).toHaveLength(1);
    expect(s.split).toBeNull();
  });

  it("UPDATE_TAB_SOURCE mutates only the targeted tab", () => {
    let s = createInitialState("w");
    s = open(s, "/a.md", "old");
    const tabId = getActiveTab(s)!.id;
    s = reduce(s, { type: "UPDATE_TAB_SOURCE", tabId, source: "new" });
    expect(s.tabs[tabId].source).toBe("new");
  });

  it("FOCUS_PANE switches active pane only when the id exists", () => {
    let s = createInitialState("w");
    s = open(s, "/a.md");
    s = reduce(s, { type: "SPLIT", direction: "vertical" });
    const left = s.panes[0].id;
    s = reduce(s, { type: "FOCUS_PANE", paneId: left });
    expect(s.activePaneId).toBe(left);

    const before = s.activePaneId;
    s = reduce(s, { type: "FOCUS_PANE", paneId: "nonexistent" });
    expect(s.activePaneId).toBe(before);
  });
});
