import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

export type KBFeedbackVote = "yes" | "no";

interface KBVotesState {
  votes: Record<string, KBFeedbackVote>;
  setVote: (guildId: string, slug: string, vote: KBFeedbackVote) => void;
}

const voteKey = (guildId: string, slug: string) => `${guildId}:${slug}`;

export const useKBVotesStore = create<KBVotesState>()(
  persist(
    (set) => ({
      votes: {},
      setVote: (guildId, slug, vote) =>
        set((state) => ({ votes: { ...state.votes, [voteKey(guildId, slug)]: vote } })),
    }),
    {
      name: "kb-votes",
      storage: createJSONStorage(() => localStorage),
    },
  ),
);

export const selectKBVote =
  (guildId: string | undefined, slug: string | undefined) =>
  (state: KBVotesState): KBFeedbackVote | null =>
    guildId && slug ? (state.votes[voteKey(guildId, slug)] ?? null) : null;
