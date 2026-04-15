import { useMemo } from "react";
import { extractHeadings } from "@/lib/markdown";
import { ScrollArea } from "@/components/ui/scroll-area";

export function TableOfContents({ source }: { source: string }) {
  const headings = useMemo(() => extractHeadings(source).filter((h) => h.level >= 1 && h.level <= 4), [source]);

  if (headings.length === 0) {
    return <div className="p-4 text-xs text-muted-foreground">No headings</div>;
  }

  return (
    <ScrollArea className="h-full">
      <nav className="px-3 py-2 text-sm">
        <div className="px-1 pb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          On this page
        </div>
        <ul className="space-y-0.5">
          {headings.map((h, i) => (
            <li key={i}>
              <a
                href={`#${h.slug}`}
                className="block truncate rounded px-2 py-1 text-muted-foreground hover:bg-accent hover:text-foreground"
                style={{ paddingLeft: `${0.5 + (h.level - 1) * 0.75}rem` }}
              >
                {h.text}
              </a>
            </li>
          ))}
        </ul>
      </nav>
    </ScrollArea>
  );
}
