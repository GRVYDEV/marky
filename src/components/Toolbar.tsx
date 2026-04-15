import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Search, Sun, Moon, Monitor, FileText } from "lucide-react";
import { useTheme } from "@/lib/theme";

interface Props {
  filePath?: string;
  onOpenPalette: () => void;
  onOpenFile: () => void;
}

export function Toolbar({ filePath, onOpenPalette, onOpenFile }: Props) {
  const { theme, setTheme } = useTheme();

  const cycleTheme = () => {
    setTheme(theme === "light" ? "dark" : theme === "dark" ? "system" : "light");
  };

  const Icon = theme === "light" ? Sun : theme === "dark" ? Moon : Monitor;

  return (
    <header className="flex h-10 shrink-0 items-center justify-between border-b bg-card/40 px-3">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <span className="truncate">{filePath ?? "No file open"}</span>
      </div>
      <div className="flex items-center gap-1">
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
