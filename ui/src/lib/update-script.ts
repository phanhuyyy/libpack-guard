/**
 * Builds npm update commands for the user to review and run themselves.
 * Nothing here executes anything. Every command uses --ignore-scripts.
 */

export type Selected = { root: string; global: boolean; name: string; target: string };
export type Group = { root: string; global: boolean; specs: string[] };

export function groupByRoot(items: Selected[]): Group[] {
  const map = new Map<string, Group>();
  for (const it of items) {
    const g = map.get(it.root) ?? { root: it.root, global: it.global, specs: [] };
    g.specs.push(`${it.name}@${it.target}`);
    map.set(it.root, g);
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

function npmArgs(g: Group, q: (s: string) => string): string {
  return `install ${g.global ? "-g " : ""}--ignore-scripts ${g.specs.map(q).join(" ")}`;
}

/** One-line command for a single folder, in the shell of the machine. */
export function inlineCommand(g: Group, windows: boolean): string {
  if (windows) {
    const npm = `npm.cmd ${npmArgs(g, psQuote)}`;
    return g.global ? npm : `Set-Location -LiteralPath ${psQuote(g.root)}; ${npm}`;
  }
  const npm = `npm ${npmArgs(g, shQuote)}`;
  return g.global ? npm : `cd ${shQuote(g.root)} && ${npm}`;
}

/** Full script covering every folder; a failure in one folder does not stop the others. */
export function fullScript(groups: Group[], windows: boolean, generatedAt: string): string {
  const header = [
    `libpack update plan - generated ${generatedAt}`,
    "Review before running. --ignore-scripts: package install scripts will NOT run.",
    "Packages that need a build step may need 'npm rebuild <name>' afterwards (only if you trust them).",
  ];
  if (windows) {
    const lines = [...header.map((h) => `# ${h}`), "", "$failed = @()"];
    for (const g of groups) {
      lines.push("", `Write-Host ${psQuote(`==> ${g.root}`)} -ForegroundColor Cyan`);
      if (g.global) {
        lines.push(`npm.cmd ${npmArgs(g, psQuote)}`);
      } else {
        lines.push(`Push-Location -LiteralPath ${psQuote(g.root)}`, `npm.cmd ${npmArgs(g, psQuote)}`);
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
    lines.push("", `echo ${shQuote(`==> ${g.root}`)}`);
    const run = g.global ? `npm ${npmArgs(g, shQuote)}` : `(cd ${shQuote(g.root)} && npm ${npmArgs(g, shQuote)})`;
    lines.push(`${run} || failed="$failed ${g.root.replace(/[^\w./-]/g, "_")}"`);
  }
  lines.push("", 'if [ -n "$failed" ]; then echo "Failed:$failed"; else echo "Done."; fi', "");
  return lines.join("\n");
}
