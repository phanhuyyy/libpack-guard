/**
 * Package-manager workspace. npm and pnpm are kept completely apart: each has its own scan
 * file, its own security report, and only its own package manager is ever run for it.
 * Shared by server and client code.
 */
export const PMS = ["npm", "pnpm"] as const;
export type PM = (typeof PMS)[number];
export const DEFAULT_PM: PM = "npm";

export function isPm(x: unknown): x is PM {
  return typeof x === "string" && (PMS as readonly string[]).includes(x);
}
