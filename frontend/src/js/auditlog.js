export const ACTION_TYPE_LABELS = {
  1: "Settings Update",

  10: "Panel Create",
  11: "Panel Update",
  12: "Panel Delete",
  13: "Panel Resend",

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

  100: "Integration Activate",
  101: "Integration Update Secrets",
  102: "Integration Deactivate",

  110: "Import Trigger",

  120: "Premium Set Active Guilds",

  200: "User Integration Create",
  201: "User Integration Update",
  202: "User Integration Delete",
  203: "User Integration Set Public",

  210: "Whitelabel Create",
  211: "Whitelabel Delete",
  212: "Whitelabel Create Interactions",
  213: "Whitelabel Status Set",
  214: "Whitelabel Status Delete",

  300: "Bot Staff Add",
  301: "Bot Staff Remove",
};

export const RESOURCE_TYPE_LABELS = {
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
};

export function formatActionType(type) {
  return ACTION_TYPE_LABELS[type] || `Unknown (${type})`;
}

export function formatResourceType(type) {
  return RESOURCE_TYPE_LABELS[type] || `Unknown (${type})`;
}
