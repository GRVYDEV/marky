import { describe, it, expect } from "vitest";
import { highlightMatches, setActiveMatch } from "./docSearch";

function setup(html: string) {
  const root = document.createElement("div");
  root.innerHTML = html;
  document.body.appendChild(root);
  return root;
}

describe("highlightMatches", () => {
  it("wraps every case-insensitive match", () => {
    const root = setup("<p>Hello world, hello there</p>");
    const h = highlightMatches(root, "hello");
    expect(h.matches).toHaveLength(2);
    expect(root.querySelectorAll("mark.doc-search-match")).toHaveLength(2);
  });

  it("ignores empty queries", () => {
    const root = setup("<p>some text</p>");
    const h = highlightMatches(root, "");
    expect(h.matches).toHaveLength(0);
    expect(root.querySelector("mark")).toBeNull();
  });

  it("returns a clear() that restores original text", () => {
    const root = setup("<p>foo bar foo</p>");
    const h = highlightMatches(root, "foo");
    expect(h.matches).toHaveLength(2);
    h.clear();
    expect(root.querySelector("mark")).toBeNull();
    expect(root.textContent).toBe("foo bar foo");
  });

  it("does not match inside SCRIPT or STYLE", () => {
    const root = setup("<style>foo</style><p>foo</p><script>foo</script>");
    const h = highlightMatches(root, "foo");
    expect(h.matches).toHaveLength(1);
  });
});

describe("setActiveMatch", () => {
  it("toggles active class to one element at a time", () => {
    const root = setup("<p>a a a</p>");
    const h = highlightMatches(root, "a");
    setActiveMatch(h.matches, 0);
    expect(h.matches[0].classList.contains("doc-search-active")).toBe(true);
    setActiveMatch(h.matches, 1);
    expect(h.matches[0].classList.contains("doc-search-active")).toBe(false);
    expect(h.matches[1].classList.contains("doc-search-active")).toBe(true);
  });

  it("wraps negative indices", () => {
    const root = setup("<p>a a</p>");
    const h = highlightMatches(root, "a");
    const target = setActiveMatch(h.matches, -1);
    expect(target).toBe(h.matches[1]);
  });
});
