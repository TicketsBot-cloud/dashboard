import type { FC } from "react";
import { Link, useNavigate } from "react-router";
import Button from "@/components/Button";

interface DoneStepProps {
  guildId: string;
  teamsCreated: number;
  formsCreated: number;
  panelsCreated: number;
}

function pluralise(count: number, singular: string): string {
  return `${count} ${singular}${count === 1 ? "" : "s"}`;
}

function buildSummary(teams: number, forms: number, panels: number): string {
  const parts: string[] = [];
  if (teams > 0) parts.push(pluralise(teams, "team"));
  if (forms > 0) parts.push(pluralise(forms, "form"));
  if (panels > 0) parts.push(pluralise(panels, "panel"));

  if (parts.length === 0) {
    return "Your server is ready to go.";
  }

  if (parts.length === 1) {
    return `You created ${parts[0]}.`;
  }

  if (parts.length === 2) {
    return `You created ${parts[0]} and ${parts[1]}.`;
  }

  return `You created ${parts[0]}, ${parts[1]}, and ${parts[2]}.`;
}

const nextSteps = (guildId: string) => [
  { to: `/manage/${guildId}/panels`, label: "View your panels" },
  { to: `/manage/${guildId}/teams`, label: "Manage your teams" },
  { to: "/gallery", label: "Explore the gallery" },
  { to: `/manage/${guildId}/settings`, label: "Advanced settings" },
];

const linkDelays = ["anim-delay-400", "anim-delay-500", "anim-delay-600", "anim-delay-700"];

const DoneStep: FC<DoneStepProps> = ({ guildId, teamsCreated, formsCreated, panelsCreated }) => {
  const navigate = useNavigate();

  return (
    <div className="text-center py-8">
      <div className="relative mx-auto mb-6 h-20 w-20">
        <div className="animate-pulse-ring absolute inset-0 rounded-full bg-green-500/20" />
        <div className="animate-scale-fade-in relative flex h-20 w-20 items-center justify-center rounded-full bg-green-500/20">
          <svg
            className="h-10 w-10 text-green-400"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            aria-hidden="true"
          >
            <path
              className="animate-draw-check"
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M5 13l4 4L19 7"
            />
          </svg>
        </div>
      </div>

      <h2 className="animate-fade-in-up anim-delay-200 text-3xl font-bold text-white mb-2">
        You're all set!
      </h2>

      <p className="animate-fade-in-up anim-delay-300 text-gray-400 mb-8">
        {buildSummary(teamsCreated, formsCreated, panelsCreated)}
      </p>

      <nav
        className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-lg mx-auto mb-10"
        aria-label="Next steps"
      >
        {nextSteps(guildId).map((step, i) => (
          <Link
            key={step.to}
            to={step.to}
            className={`animate-fade-in-up ${linkDelays[i]} flex items-center gap-3 rounded-lg bg-gray-800 p-4 text-left transition-colors hover:bg-gray-700`}
          >
            <span className="text-blue-400" aria-hidden="true">
              &rarr;
            </span>
            <span className="text-gray-300">{step.label}</span>
          </Link>
        ))}
      </nav>

      <div className="animate-fade-in-up anim-delay-800">
        <Button variant="primary" onClick={() => navigate(`/manage/${guildId}/settings`)}>
          Go to Dashboard
        </Button>
      </div>
    </div>
  );
};

export default DoneStep;
