import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Search, Sun, Moon, Monitor, FileText, SplitSquareHorizontal, SplitSquareVertical, X } from "lucide-react";
import { useTheme } from "@/lib/theme";
import type { SplitDirection } from "@/lib/workspace";

interface Props {
  filePath?: string;
  onOpenPalette: () => void;
  onOpenFile: () => void;
  onSplit: (d: SplitDirection) => void;
  onCloseSplit: () => void;
  isSplit: boolean;
  onFind: () => void;
}

export function Toolbar({ filePath, onOpenPalette, onOpenFile, onSplit, onCloseSplit, isSplit, onFind }: Props) {
  const { theme, setTheme } = useTheme();
  const cycleTheme = () =>
    setTheme(theme === "light" ? "dark" : theme === "dark" ? "system" : "light");
  const Icon = theme === "light" ? Sun : theme === "dark" ? Moon : Monitor;

  return (
    <header className="flex h-9 shrink-0 items-center justify-between border-b bg-card/40 px-3">
      <div className="truncate text-xs text-muted-foreground">{filePath ?? "No file open"}</div>
      <div className="flex items-center gap-1">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button onClick={onFind} variant="ghost" size="icon" className="h-7 w-7">
              <Search className="h-3.5 w-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Find in document (⌘F)</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button onClick={onOpenFile} variant="ghost" size="icon" className="h-7 w-7">
              <FileText className="h-3.5 w-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Open file (⌘O)</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button onClick={onOpenPalette} variant="ghost" size="icon" className="h-7 w-7">
              <Search className="h-3.5 w-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Quick open (⌘K)</TooltipContent>
        </Tooltip>
        {isSplit ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button onClick={onCloseSplit} variant="ghost" size="icon" className="h-7 w-7">
                <X className="h-3.5 w-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Close split</TooltipContent>
          </Tooltip>
        ) : (
          <>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button onClick={() => onSplit("vertical")} variant="ghost" size="icon" className="h-7 w-7">
                  <SplitSquareVertical className="h-3.5 w-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Split vertically (⌘\)</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button onClick={() => onSplit("horizontal")} variant="ghost" size="icon" className="h-7 w-7">
                  <SplitSquareHorizontal className="h-3.5 w-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Split horizontally (⌘⇧\)</TooltipContent>
            </Tooltip>
          </>
        )}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button onClick={cycleTheme} variant="ghost" size="icon" className="h-7 w-7">
              <Icon className="h-3.5 w-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Theme: {theme}</TooltipContent>
        </Tooltip>
      </div>
    </header>
  );
}
