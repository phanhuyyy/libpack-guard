import type { Pkg } from "./data";
import type { MessageKey } from "./i18n";

export type ScriptLevel = "critical" | "high" | "info";

type Rule = { level: Exclude<ScriptLevel, "info">; label: MessageKey; re: RegExp };

/**
 * Static checks on install-script TEXT only (preinstall/install/postinstall from package.json).
 * Nothing is executed. These are signals, not proof: a match means "look at this by hand".
 */
const RULES: Rule[] = [
  { level: "critical", label: "rule.pipe", re: /(^|[^|])\|(?!\|)\s*(sh|bash|zsh|powershell|pwsh|iex|node)\b/i }, // single "|" only; "||" is shell OR
  { level: "critical", label: "rule.secrets", re: /\.npmrc|\.ssh\b|id_rsa|id_ed25519|\.aws\b|\.env\b|\.git-credentials|\bkeychain\b|Login Data|\bCookies\b|wallet|\bsecrets?\b|password|credential|AWS_SECRET|NPM_TOKEN|GITHUB_TOKEN/i },
  { level: "critical", label: "rule.exfil", re: /discord(app)?\.com\/api\/webhooks|webhook\.site|pipedream|requestbin|pastebin|ngrok|interact\.sh|burpcollaborator|oast\.(fun|me|site|live|online|pro)|\btelegram\b/i },
  { level: "critical", label: "rule.revshell", re: /\/dev\/tcp\/|\b(nc|ncat|netcat)\s+-|\bsocat\b/i },
  { level: "high", label: "rule.download", re: /\b(curl|wget|Invoke-WebRequest|iwr|Invoke-RestMethod|irm|certutil|bitsadmin|Start-BitsTransfer)\b/i },
  { level: "high", label: "rule.shell", re: /\b(powershell(\.exe)?|pwsh|cmd(\.exe)?\s+\/[ck]|bash\s+-c|sh\s+-c|wscript|cscript|mshta|rundll32|regsvr32)\b/i },
  { level: "high", label: "rule.inline", re: /\bnode\s+(-e|--eval|-p|--print)\b|\beval\s*\(|\bnew Function\b/i },
  { level: "high", label: "rule.obfuscation", re: /base64|\batob\s*\(|Buffer\.from\(|(\\x[0-9a-f]{2}){4,}|[A-Za-z0-9+/]{120,}={0,2}/i },
  { level: "high", label: "rule.url", re: /https?:\/\/|\b\d{1,3}(\.\d{1,3}){3}\b/i },
  { level: "high", label: "rule.hidden", re: /-WindowStyle\s+Hidden|\bnohup\b|\bdisown\b|start\s+\/b\b|-w\s+hidden/i },
];

export type ScriptFinding = {
  name: string;
  version: string;
  level: ScriptLevel;
  /** i18n keys of the matched rules */
  reasons: MessageKey[];
  scripts: Record<string, string>;
  /** all installations of this name@version */
  installs: Pkg[];
};

const rank: Record<ScriptLevel, number> = { critical: 0, high: 1, info: 2 };

export function analyzeScripts(pkgs: Pkg[]): ScriptFinding[] {
  const map = new Map<string, ScriptFinding>();
  for (const p of pkgs) {
    if (!p.has_install_script && !p.install_scripts) continue;
    const key = `${p.name}@${p.version}`;
    let f = map.get(key);
    if (!f) {
      f = { name: p.name, version: p.version, level: "info", reasons: [], scripts: {}, installs: [] };
      map.set(key, f);
    }
    f.installs.push(p);
    for (const [hook, text] of Object.entries(p.install_scripts ?? {})) {
      if (f.scripts[hook]) continue;
      f.scripts[hook] = text;
      for (const r of RULES) {
        if (r.re.test(text) && !f.reasons.includes(r.label)) {
          f.reasons.push(r.label);
          if (rank[r.level] < rank[f.level]) f.level = r.level;
        }
      }
    }
  }
  return [...map.values()].sort((a, b) => rank[a.level] - rank[b.level] || a.name.localeCompare(b.name));
}
