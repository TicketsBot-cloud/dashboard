import { createContext, useContext } from "react";

export const GuildBootstrapContext = createContext(false);

export function useGuildBootstrapReady(): boolean {
  return useContext(GuildBootstrapContext);
}
