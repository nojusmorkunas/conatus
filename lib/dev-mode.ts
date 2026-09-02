// Switches off the protections that only get in the way on a laptop: rate
// limits and invite-only registration. Read at call time rather than module
// load so tests can toggle it.
//
// Deliberately not gated on NODE_ENV. The published image runs as production,
// so a NODE_ENV check would make this flag impossible to use from the very
// compose file it exists for. That puts the responsibility on the operator,
// which is why enabling it logs a warning on every boot.
export function devModeEnabled() {
  return process.env.CONATUS_DEV_MODE === "1";
}
