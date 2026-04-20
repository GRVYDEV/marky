let initialized = false;
let mermaidPromise: Promise<typeof import("mermaid").default> | null = null;

async function loadMermaid() {
  if (!mermaidPromise) {
    mermaidPromise = import("mermaid").then((m) => m.default);
  }
  return mermaidPromise;
}

export async function renderMermaidBlocks(root: HTMLElement, theme: "light" | "dark") {
  const blocks = root.querySelectorAll<HTMLPreElement>("pre.mermaid-pending");
  if (blocks.length === 0) return;
  const mermaid = await loadMermaid();
  if (!initialized) {
    mermaid.initialize({ startOnLoad: false, theme: theme === "dark" ? "dark" : "default" });
    initialized = true;
  } else {
    mermaid.initialize({ startOnLoad: false, theme: theme === "dark" ? "dark" : "default" });
  }

  let i = 0;
  for (const pre of Array.from(blocks)) {
    const source = pre.textContent || "";
    const id = `mermaid-${Date.now()}-${i++}`;
    const wrapper = document.createElement("div");
    wrapper.className = "mermaid-block";
    try {
      const { svg } = await mermaid.render(id, source);
      wrapper.innerHTML = svg;
    } catch (err) {
      wrapper.textContent = `Mermaid render error: ${(err as Error).message}`;
    }
    // Preserve source map attribute through mermaid replacement.
    const sourceMap = pre.getAttribute("data-source-map");
    if (sourceMap) wrapper.setAttribute("data-source-map", sourceMap);
    pre.replaceWith(wrapper);
  }
}
