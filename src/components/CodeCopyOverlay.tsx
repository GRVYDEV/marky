import * as React from "react";

/**
 * Adds a "Copy" button to every <pre> in the rendered viewer.
 * Buttons are appended directly into the DOM (after sanitization)
 * to avoid the cost of rebuilding the markdown tree as React nodes.
 */
export function attachCopyButtons(root: HTMLElement) {
  const pres = root.querySelectorAll<HTMLPreElement>("pre");
  pres.forEach((pre) => {
    if (pre.querySelector(".copy-code-btn")) return;
    if (pre.classList.contains("mermaid-pending")) return;
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "copy-code-btn";
    btn.textContent = "Copy";
    btn.addEventListener("click", () => {
      const code = pre.querySelector("code")?.textContent ?? pre.textContent ?? "";
      navigator.clipboard.writeText(code).then(() => {
        btn.textContent = "Copied!";
        setTimeout(() => (btn.textContent = "Copy"), 1200);
      });
    });
    pre.appendChild(btn);
  });
}

export default function _Unused() {
  return null as unknown as React.ReactElement;
}
