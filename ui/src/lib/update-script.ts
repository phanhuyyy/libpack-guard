/**
 * Builds npm / pnpm update commands for the user to review and run themselves.
 * Nothing here executes anything. Every command uses --ignore-scripts.
 */

export type Manager = "npm" | "pnpm";
export type Selected = { root: string; global: boolean; name: string; target: string; manager: Manager };
export type Group = { root: string; global: boolean; manager: Manager; specs: string[] };

export function groupByRoot(items: Selected[]): Group[] {
  const map = new Map<string, Group>();
  for (const it of items) {
    const key = `${it.manager}\u0000${it.root}`;
    const g = map.get(key) ?? { root: it.root, global: it.global, manager: it.manager, specs: [] };
    g.specs.push(`${it.name}@${it.target}`);
    map.set(key, g);
  }
  return [...map.values()].sort((a, b) => (a.global === b.global ? a.root.localeCompare(b.root) : a.global ? -1 : 1));
}

/** PowerShell single-quoted literal: no variable expansion, ' is escaped as ''. */
export function psQuote(s: string): string {
  return `'${s.replace(/'/g, "''")}'`;
}

/** POSIX sh single-quoted literal: ' is written as '\'' . */
export function shQuote(s: string): string {
  return `'${s.replace(/'/g, `'\\''`)}'`;
}

/**
 * The package-manager invocation for one folder (without cd).
 *  npm  project: npm install --ignore-scripts a@1 b@2
 *  npm  global:  npm install -g --ignore-scripts a@1
 *  pnpm project: pnpm update --ignore-scripts a@1 b@2   (keeps dependencies / devDependencies)
 *  pnpm global:  pnpm add -g --ignore-scripts a@1
 */
function toolCommand(g: Group, q: (s: string) => string, windows: boolean): string {
  const specs = g.specs.map(q).join(" ");
  if (g.manager === "pnpm") {
    const bin = windows ? "pnpm.cmd" : "pnpm";
    return g.global ? `${bin} add -g --ignore-scripts ${specs}` : `${bin} update --ignore-scripts ${specs}`;
  }
  const bin = windows ? "npm.cmd" : "npm";
  return `${bin} install ${g.global ? "-g " : ""}--ignore-scripts ${specs}`;
}

/** One-line command for a single folder, in the shell of the machine. */
export function inlineCommand(g: Group, windows: boolean): string {
  if (windows) {
    const cmd = toolCommand(g, psQuote, true);
    return g.global ? cmd : `Set-Location -LiteralPath ${psQuote(g.root)}; ${cmd}`;
  }
  const cmd = toolCommand(g, shQuote, false);
  return g.global ? cmd : `cd ${shQuote(g.root)} && ${cmd}`;
}

/** Full script covering every folder; a failure in one folder does not stop the others. */
export function fullScript(groups: Group[], windows: boolean, generatedAt: string): string {
  const header = [
    `libpack update plan - generated ${generatedAt}`,
    "Review before running. --ignore-scripts: package install scripts will NOT run.",
    "Packages that need a build step may need 'npm rebuild <name>' / 'pnpm rebuild <name>' afterwards (only if you trust them).",
  ];
  if (windows) {
    const lines = [...header.map((h) => `# ${h}`), "", "$failed = @()"];
    for (const g of groups) {
      lines.push("", `Write-Host ${psQuote(`==> [${g.manager}] ${g.root}`)} -ForegroundColor Cyan`);
      if (g.global) {
        lines.push(toolCommand(g, psQuote, true));
      } else {
        lines.push(`Push-Location -LiteralPath ${psQuote(g.root)}`, toolCommand(g, psQuote, true));
      }
      lines.push(`if ($LASTEXITCODE -ne 0) { $failed += ${psQuote(g.root)} }`);
      if (!g.global) lines.push("Pop-Location");
    }
    lines.push(
      "",
      'if ($failed.Count) { Write-Warning ("Failed: " + ($failed -join ", ")) } else { Write-Host "Done." -ForegroundColor Green }',
      "",
    );
    return lines.join("\r\n");
  }
  const lines = ["#!/bin/sh", ...header.map((h) => `# ${h}`), "", "failed=''"];
  for (const g of groups) {
    lines.push("", `echo ${shQuote(`==> [${g.manager}] ${g.root}`)}`);
    const cmd = toolCommand(g, shQuote, false);
    const run = g.global ? cmd : `(cd ${shQuote(g.root)} && ${cmd})`;
    lines.push(`${run} || failed="$failed ${g.root.replace(/[^\w./-]/g, "_")}"`);
  }
  lines.push("", 'if [ -n "$failed" ]; then echo "Failed:$failed"; else echo "Done."; fi', "");
  return lines.join("\n");
}
