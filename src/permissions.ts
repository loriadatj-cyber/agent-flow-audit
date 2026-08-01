import type { PermissionLevel, PermissionMap } from "./types.js";

const WRITE_CAPABILITIES = new Set([
  "actions",
  "attestations",
  "checks",
  "contents",
  "deployments",
  "discussions",
  "id-token",
  "issues",
  "packages",
  "pages",
  "pull-requests",
  "repository-projects",
  "security-events",
  "statuses",
]);

export function parsePermissions(value: unknown): PermissionMap {
  if (value === "read-all") {
    return Object.fromEntries([...WRITE_CAPABILITIES].map((name) => [name, "read"]));
  }
  if (value === "write-all") {
    return Object.fromEntries([...WRITE_CAPABILITIES].map((name) => [name, "write"]));
  }
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  const permissions: PermissionMap = {};
  for (const [name, level] of Object.entries(value as Record<string, unknown>)) {
    if (level === "read" || level === "write" || level === "none") {
      permissions[name] = level;
    }
  }
  return permissions;
}

export function writeCapabilities(permissions: PermissionMap): string[] {
  return Object.entries(permissions)
    .filter(([name, level]) => level === "write" && WRITE_CAPABILITIES.has(name))
    .map(([name]) => name)
    .sort();
}

export function permissionLevel(permissions: PermissionMap, name: string): PermissionLevel | undefined {
  return permissions[name];
}
