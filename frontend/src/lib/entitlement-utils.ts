import type { UserEntitlement } from "@/types";

/** Client-side active check; API already filters with grace period. */
export function isActiveEntitlement(entitlement: UserEntitlement): boolean {
  if (!entitlement.expires_at) return true;
  return new Date(entitlement.expires_at) > new Date();
}
