import type { IconProp } from "@fortawesome/fontawesome-svg-core";
import {
  faBan,
  faBook,
  faChartLine,
  faClipboardList,
  faGauge,
  faHistory,
  faImages,
  faPeopleGroup,
  faRectangleList,
  faRobot,
  faScroll,
  faTag,
  faTicket,
} from "@fortawesome/free-solid-svg-icons";

export interface NavItem {
  to: string;
  icon: IconProp;
  label: string;
  permission_level_needed?: number;
  children?: NavItem[];
}

export interface NavSection {
  label: string;
  items: NavItem[];
}

export type NavEntry = NavItem | NavSection;

export const isNavSection = (entry: NavEntry): entry is NavSection => "items" in entry;

export function getGuildNavLinks(guildId: string): NavEntry[] {
  return [
    {
      to: `/manage/${guildId}`,
      icon: faGauge,
      label: "Overview",
      permission_level_needed: 1,
    },
    {
      label: "Tickets",
      items: [
        {
          to: `/manage/${guildId}/tickets`,
          icon: faTicket,
          label: "Tickets",
          permission_level_needed: 1,
        },
        {
          to: `/manage/${guildId}/transcripts`,
          icon: faScroll,
          label: "Transcripts",
          permission_level_needed: 1,
        },
        {
          to: `/manage/${guildId}/analytics`,
          icon: faChartLine,
          label: "Analytics",
          permission_level_needed: 1,
        },
      ],
    },
    {
      label: "Setup",
      items: [
        {
          to: `/manage/${guildId}/settings`,
          icon: "cog" as IconProp,
          label: "Settings",
          permission_level_needed: 2,
        },
        {
          to: `/manage/${guildId}/panels`,
          icon: faRectangleList,
          label: "Panels",
          permission_level_needed: 2,
        },
        {
          to: `/manage/${guildId}/forms`,
          icon: faClipboardList,
          label: "Forms",
          permission_level_needed: 2,
        },
        {
          to: `/manage/${guildId}/integrations`,
          icon: faRobot,
          label: "Integrations",
          permission_level_needed: 2,
        },
      ],
    },
    {
      label: "Content",
      items: [
        {
          to: `/manage/${guildId}/kb`,
          icon: faBook,
          label: "Knowledge Base",
          permission_level_needed: 1,
        },
        {
          to: `/manage/${guildId}/tags`,
          icon: faTag,
          label: "Tags",
          permission_level_needed: 1,
        },
      ],
    },
    {
      label: "Moderation",
      items: [
        {
          to: `/manage/${guildId}/teams`,
          icon: faPeopleGroup,
          label: "Staff Teams",
          permission_level_needed: 2,
        },
        {
          to: `/manage/${guildId}/blacklist`,
          icon: faBan,
          label: "Blacklist",
          permission_level_needed: 1,
        },
        {
          to: `/manage/${guildId}/audit-log`,
          icon: faHistory,
          label: "Audit Log",
          permission_level_needed: 2,
        },
      ],
    },
  ];
}

export const defaultNavLinks: NavItem[] = [
  { to: "/", icon: "server" as IconProp, label: "Servers" },
  { to: "/gallery", icon: faImages, label: "Gallery" },
];

export function flattenNavEntries(entries: NavEntry[], permissionLevel: number): NavItem[] {
  const items: NavItem[] = [];
  for (const entry of entries) {
    if (isNavSection(entry)) {
      for (const item of entry.items) {
        if (permissionLevel >= (item.permission_level_needed ?? 0)) {
          items.push(item);
        }
      }
    } else {
      if (permissionLevel >= (entry.permission_level_needed ?? 0)) {
        items.push(entry);
      }
    }
  }
  return items;
}
