/** Splits a remote-tracking ref name like "origin/feat/foo" into its remote
 * ("origin") and branch ("feat/foo"), tolerating branch names that
 * themselves contain slashes. */
export function splitRemoteRef(name: string): { remote: string; branch: string } {
  const idx = name.indexOf("/");
  if (idx === -1) return { remote: name, branch: name };
  return { remote: name.slice(0, idx), branch: name.slice(idx + 1) };
}
