import { homedir } from "node:os";
import { join } from "node:path";

export const PORT = Number(process.env.CONDUCTOR_PORT ?? 4321);
export const HOST = process.env.CONDUCTOR_HOST ?? "0.0.0.0";

export const CLAUDE_PROJECTS_DIR = join(homedir(), ".claude", "projects");

// claude code rename project dir: every not-letter-not-number turn into dash.
// e.g. /Users/jane.doe/proj → -Users-jane-doe-proj (the dot in jane.doe
// also becomes dash). must match exact or file not found.
export function encodeCwd(cwd: string): string {
  return cwd.replace(/[^a-zA-Z0-9]/g, "-");
}

export function projectDirForCwd(cwd: string): string {
  return join(CLAUDE_PROJECTS_DIR, encodeCwd(cwd));
}
