import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuCheckboxItem,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
} from "@/components/ui/dropdown-menu";
import { Search, Sun, Moon, Monitor, FileText, SplitSquareHorizontal, SplitSquareVertical, X, Settings } from "lucide-react";
import { useTheme, type Theme } from "@/lib/theme";
import { usePreferences } from "@/lib/preferences";
import type { SplitDirection } from "@/lib/workspace";

interface Props {
  filePath?: string;
  onOpenFile: () => void;
  onSplit: (d: SplitDirection) => void;
  onCloseSplit: () => void;
  isSplit: boolean;
  onFind: () => void;
}

export function Toolbar({ filePath, onOpenFile, onSplit, onCloseSplit, isSplit, onFind }: Props) {
  const { theme, setTheme } = useTheme();
  const { copyAsMarkdown, setCopyAsMarkdown } = usePreferences();
  const ThemeIcon = theme === "light" ? Sun : theme === "dark" ? Moon : Monitor;

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
        <DropdownMenu>
          <Tooltip>
            <TooltipTrigger asChild>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-7 w-7">
                  <Settings className="h-3.5 w-3.5" />
                </Button>
              </DropdownMenuTrigger>
            </TooltipTrigger>
            <TooltipContent>Settings</TooltipContent>
          </Tooltip>
          <DropdownMenuContent align="end">
            <DropdownMenuLabel>Settings</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuCheckboxItem
              checked={copyAsMarkdown}
              onCheckedChange={setCopyAsMarkdown}
            >
              Copy as Markdown
            </DropdownMenuCheckboxItem>
            <DropdownMenuSeparator />
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>
                <ThemeIcon className="h-3.5 w-3.5" />
                Theme
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent>
                <DropdownMenuRadioGroup value={theme} onValueChange={(v) => setTheme(v as Theme)}>
                  <DropdownMenuRadioItem value="light">
                    <Sun className="h-3.5 w-3.5" />
                    Light
                  </DropdownMenuRadioItem>
                  <DropdownMenuRadioItem value="dark">
                    <Moon className="h-3.5 w-3.5" />
                    Dark
                  </DropdownMenuRadioItem>
                  <DropdownMenuRadioItem value="system">
                    <Monitor className="h-3.5 w-3.5" />
                    System
                  </DropdownMenuRadioItem>
                </DropdownMenuRadioGroup>
              </DropdownMenuSubContent>
            </DropdownMenuSub>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
