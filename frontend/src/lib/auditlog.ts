const ACTION_TYPE_LABELS: Record<number, string> = {
  1: "Settings Update",

  10: "Panel Create",
  11: "Panel Update",
  12: "Panel Delete",
  13: "Panel Resend",
  14: "Panel Reset Cooldowns",

  20: "Multi-Panel Create",
  21: "Multi-Panel Update",
  22: "Multi-Panel Delete",
  23: "Multi-Panel Resend",

  30: "Support Hours Set",
  31: "Support Hours Delete",

  40: "Form Create",
  41: "Form Update",
  42: "Form Delete",

  45: "Form Inputs Update",

  50: "Tag Create",
  51: "Tag Delete",

  60: "Team Create",
  61: "Team Delete",
  62: "Team Update",

  65: "Team Member Add",
  66: "Team Member Remove",

  70: "Staff Override Create",
  71: "Staff Override Delete",

  80: "Blacklist Add",
  81: "Blacklist Remove User",
  82: "Blacklist Remove Role",

  90: "Ticket Send Message",
  91: "Ticket Send Tag",
  92: "Ticket Close",
  93: "Ticket Close Reason Update",
  94: "Ticket Close Request",
  95: "Ticket Claim",
  96: "Ticket Unclaim",
  97: "Ticket Transfer",

  100: "Integration Activate",
  101: "Integration Update Secrets",
  102: "Integration Deactivate",

  110: "Import Trigger",

  120: "Premium Set Active Guilds",

  130: "Ticket Label Create",
  131: "Ticket Label Update",
  132: "Ticket Label Delete",
  135: "Ticket Label Assign",
  136: "Ticket Label Unassign",

  200: "User Integration Create",
  201: "User Integration Update",
  202: "User Integration Delete",
  203: "User Integration Set Public",
  204: "User Integration Approve",
  205: "User Integration Reject",
  206: "User Integration Unapprove",

  210: "Whitelabel Create",
  211: "Whitelabel Delete",
  212: "Whitelabel Create Interactions",
  213: "Whitelabel Status Set",
  214: "Whitelabel Status Delete",
  215: "Whitelabel Resync",

  300: "Bot Staff Add",
  301: "Bot Staff Remove",
  302: "Bot Staff Tier Update",
  303: "Bot Staff Global View Update",

  310: "Global Blacklist Add",
  311: "Global Blacklist Remove",

  320: "Server Blacklist Add",
  321: "Server Blacklist Remove",

  330: "Premium Key Generate",

  340: "Polar Checkout Create",
  341: "Polar Subscription Cancel",
  342: "Polar Subscription Change",

  350: "Polar Product Create",
  351: "Polar Product Update",
  352: "Polar Product Delete",

  360: "SKU Create",
  361: "SKU Update",
  362: "SKU Delete",

  370: "KB Article Create",
  371: "KB Article Update",
  372: "KB Article Delete",
  380: "KB Category Create",
  381: "KB Category Update",
  382: "KB Category Delete",
  390: "KB Settings Update",

  400: "Gallery Submit",
  401: "Gallery Approve",
  402: "Gallery Reject",
  403: "Gallery Remove",
  404: "Gallery Import",

  410: "Onboarding Complete",
  411: "Onboarding Skip",

  420: "Affiliate Apply",
  421: "Affiliate Approve",
  422: "Affiliate Revoke",
  423: "Affiliate Create",
  424: "Affiliate Redeem",
  425: "Affiliate Void",
  426: "Affiliate Update Rate",
  427: "Affiliate Update Code",

  430: "Notification Preferences Update",
  431: "User Email Update",
  432: "User Email Delete",
  433: "Notification Mark Read",
  434: "Notification Mark All Read",
  435: "Email Verify",
  436: "Email Resend Verification",

  440: "Feature Flag Toggle",
  441: "Feature Flag Create",
  442: "Feature Flag Rules Update",
};

const RESOURCE_TYPE_LABELS: Record<number, string> = {
  1: "Settings",
  2: "Panel",
  3: "Multi-Panel",
  4: "Support Hours",
  5: "Form",
  6: "Form Input",
  7: "Tag",
  8: "Team",
  9: "Team Member",
  10: "Staff Override",
  11: "Blacklist",
  12: "Ticket",
  13: "Guild Integration",
  14: "Import",
  15: "Premium",
  16: "User Integration",
  17: "Whitelabel",
  18: "Bot Staff",
  19: "Ticket Label",
  20: "Ticket Label Assignment",
  21: "Global Blacklist",
  22: "Server Blacklist",
  23: "Premium Key",
  24: "Polar Subscription",
  25: "Polar Product",
  26: "SKU",
  27: "KB Article",
  28: "KB Category",
  29: "KB Settings",
  30: "Gallery Listing",
  31: "Onboarding",
  32: "Affiliate",
  33: "Affiliate Referral",
  34: "Notification Preferences",
  35: "User Email",
  36: "Notification",
  37: "User Email Verification",
  38: "Feature Flag",
};

export function formatActionType(type: number): string {
  return ACTION_TYPE_LABELS[type] || `Unknown (${type})`;
}

export function formatResourceType(type: number): string {
  return RESOURCE_TYPE_LABELS[type] || `Unknown (${type})`;
}

export const actionTypeOptions = Object.entries(ACTION_TYPE_LABELS).map(([key, label]) => ({
  key,
  label,
}));

export const resourceTypeOptions = Object.entries(RESOURCE_TYPE_LABELS).map(([key, label]) => ({
  key,
  label,
}));

// Mirrors safeParse() in AuditLogDiff: does this JSON string hold anything to show?
export function hasJsonContent(data?: string | null): boolean {
  if (!data) return false;
  try {
    const p = JSON.parse(data);
    if (p == null) return false;
    if (Array.isArray(p)) return p.length > 0;
    if (typeof p === "object") return Object.keys(p).length > 0;
    return true; // primitive value
  } catch {
    return false;
  }
}
