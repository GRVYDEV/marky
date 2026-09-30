import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { tauri, type Folder } from "@/lib/tauri";

/**
 * Open the native "choose a folder" dialog and, if the user picks one,
 * register it with the backend. Shared by the sidebar's + button and the
 * File ▸ Open Folder… menu action so both go through one code path.
 */
export async function pickAndAddFolder(): Promise<Folder | null> {
  const picked = await openDialog({ directory: true, multiple: false });
  if (typeof picked !== "string") return null;
  return tauri.addFolder(picked);
}
