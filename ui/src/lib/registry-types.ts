export type RegistryInfo = {
  name: string;
  latest: string | null;
  modified: string | null;
  versionCount: number;
  latestDeprecated: string | null;
  /** deprecation message per requested version (only deprecated ones listed) */
  deprecated: Record<string, string>;
  /** requested versions that do not exist in the registry (unpublished / private) */
  missing: string[];
  /**
   * per requested version: newest stable, non-deprecated release that stays compatible
   * (same major; for 0.x also same minor), or null when there is nothing newer.
   */
  inMajor: Record<string, string | null>;
};
