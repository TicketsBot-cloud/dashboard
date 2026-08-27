/**
 * Notification category presentation.
 *
 * Mirrors `notify.AllCategories` in the dashboard backend
 * (`_src/dashboard/notify/categories.go`), which is the source of truth for which
 * categories exist. The backend also ships labels and descriptions on
 * `GET /user/settings` as `notification_categories` — prefer those where a longer,
 * descriptive label is wanted (the settings page does exactly that). This module
 * carries the presentation the API does not send: compact badge labels, colours and
 * icons for the notification feed.
 */

import {
  faCodePullRequest,
  faHandshake,
  faImages,
  faPlug,
  faShieldHalved,
} from "@fortawesome/free-solid-svg-icons";
import type { IconDefinition } from "@fortawesome/fontawesome-svg-core";

export interface CategoryPresentation {
  label: string;
  colour: string;
  icon: IconDefinition;
}

export const CATEGORY_PRESENTATION: Record<string, CategoryPresentation> = {
  affiliate: {
    label: "Affiliate",
    colour: "bg-green-600",
    icon: faHandshake,
  },
  integrations: {
    label: "Integrations",
    colour: "bg-cyan-600",
    icon: faPlug,
  },
  admin_gallery: {
    label: "Gallery",
    colour: "bg-purple-600",
    icon: faImages,
  },
  admin_affiliates: {
    label: "Affiliate Apps",
    colour: "bg-amber-600",
    icon: faShieldHalved,
  },
  admin_integrations: {
    label: "Integration Requests",
    colour: "bg-blue-600",
    icon: faCodePullRequest,
  },
};

export function categoryLabel(category: string): string {
  return CATEGORY_PRESENTATION[category]?.label ?? category;
}

export function categoryColour(category: string): string {
  return CATEGORY_PRESENTATION[category]?.colour ?? "bg-gray-600";
}

export function categoryIcon(category: string): IconDefinition {
  return CATEGORY_PRESENTATION[category]?.icon ?? faShieldHalved;
}
