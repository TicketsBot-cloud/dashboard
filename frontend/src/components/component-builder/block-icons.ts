import type { IconDefinition } from "@fortawesome/fontawesome-svg-core";
import {
  faLayerGroup,
  faColumns,
  faMinus,
  faFont,
  faImages,
  faLink,
  faTicket,
} from "@fortawesome/free-solid-svg-icons";
import type { V2ComponentType } from "@/lib/component-tree";

export const BLOCK_ICONS: Record<V2ComponentType, IconDefinition> = {
  container: faLayerGroup,
  section: faColumns,
  separator: faMinus,
  text_display: faFont,
  media_gallery: faImages,
  button_row: faLink,
  panel_select: faTicket,
};
