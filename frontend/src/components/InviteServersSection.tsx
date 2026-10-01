import type { CSSProperties, FC } from "react";

import InviteServerCard from "@/components/InviteServerCard";
import InviteServerIconTile from "@/components/InviteServerIconTile";
import type { InvitableGuild } from "@/types";

interface InviteServersSectionProps {
  guilds: InvitableGuild[];
  view: "cards" | "icons";
  animate: boolean;
  onInviteClick: () => void;
  className?: string;
}

const InviteServersSection: FC<InviteServersSectionProps> = ({
  guilds,
  view,
  animate,
  onInviteClick,
  className = "",
}) => (
  <section className={className} aria-labelledby="invite-servers-heading" data-invite-servers>
    <h2 id="invite-servers-heading" className="text-xl font-medium mb-4">
      Add Tickets to a server
    </h2>
    <p className="text-sm text-gray-300 mb-4">
      You can manage these servers, but Tickets is not in them yet.
    </p>
    <div
      className={
        view === "icons"
          ? "grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7 gap-x-6 gap-y-8 place-items-center"
          : "grid gap-4 grid-cols-1 sm:grid-cols-1 md:grid-cols-2 lg:grid-cols-3"
      }
      role="list"
      aria-label="Servers you can add Tickets to"
    >
      {guilds.map((guild, i) => (
        <div
          key={guild.id}
          role="listitem"
          className="animate-fade-in-up anim-stagger"
          style={{ "--anim-i": animate ? Math.min(i, 14) : 0 } as CSSProperties}
        >
          {view === "icons" ? (
            <InviteServerIconTile guild={guild} onInviteClick={onInviteClick} />
          ) : (
            <InviteServerCard guild={guild} onInviteClick={onInviteClick} />
          )}
        </div>
      ))}
    </div>
  </section>
);

export default InviteServersSection;
