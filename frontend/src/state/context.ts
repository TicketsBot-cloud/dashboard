import type { Guild } from "@/types";
import { createContext } from "react";

export const GuildContext = createContext<Guild | null>(null);
