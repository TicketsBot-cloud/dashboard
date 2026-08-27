import { useEffect, useState, type FC } from "react";
import { Link } from "react-router";
import Button from "@/components/Button";
import { apiClient } from "@/lib/api";
import type { PanelPermResult, PermCheckResponse } from "@/types";

const ROLE_LABELS: Record<string, string> = {
  panel_channel: "Panel channel",
  ticket_category: "Ticket category",
  notification_channel: "Notification channel",
  transcript_channel: "Transcript channel",
};

// Maps a role to the appropriate noun for "no longer exists" messages
const ROLE_ENTITY: Record<string, string> = {
  ticket_category: "category",
};

const PanelDetail: FC<{ panel: PanelPermResult; isError: boolean; guildId: string }> = ({
  panel,
  isError,
  guildId,
}) => {
  const badChannels = panel.channels.filter((ch) => !ch.ok);
  if (badChannels.length === 0) return null;

  const titleColor = isError ? "text-red-200" : "text-amber-200";
  const modeColor = isError ? "text-red-300/70" : "text-amber-300/70";
  const itemColor = isError ? "text-red-100/80" : "text-amber-100/80";
  const roleColor = isError ? "text-red-300" : "text-amber-300";
  const nameColor = isError ? "text-red-100/60" : "text-amber-100/60";
  const editLinkColor = isError
    ? "text-red-400/70 hover:text-red-300"
    : "text-amber-400/70 hover:text-amber-300";

  const editPath = `/manage/${guildId}/panels/edit/${panel.panel_id}`;

  return (
    <div>
      <p className={`text-sm font-medium ${titleColor}`}>
        {panel.panel_title}{" "}
        <span className={`font-normal ${modeColor}`}>
          ({panel.use_threads ? "thread mode" : "channel mode"})
        </span>
        {badChannels.some((ch) => ch.deleted) && (
          <>
            {" · "}
            <Link
              to={editPath}
              className={`text-xs font-normal underline underline-offset-2 ${editLinkColor} transition-colors`}
            >
              Select a replacement →
            </Link>
          </>
        )}
      </p>
      <ul className="mt-1 space-y-1 pl-3">
        {badChannels.map((ch) => (
          <li key={`${ch.channel_id}-${ch.role}`} className={`text-sm ${itemColor}`}>
            <span className={roleColor}>{ROLE_LABELS[ch.role] ?? ch.role}</span>
            {ch.deleted ? (
              <span className="text-red-400">
                {" - "}
                {ROLE_ENTITY[ch.role] ?? "channel"} no longer exists
              </span>
            ) : (
              <>
                {" "}
                <span className={nameColor}>#{ch.channel_name}</span>
                {" - "}
                <span>{ch.missing.join(", ")}</span>
              </>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
};

interface Props {
  guildId: string;
}

const PermissionWarningBanner: FC<Props> = ({ guildId }) => {
  const [data, setData] = useState<PermCheckResponse | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [rechecking, setRechecking] = useState(false);
  const [hasRechecked, setHasRechecked] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    apiClient.panels
      .checkPermissions(guildId)
      .then((res) => {
        if (!controller.signal.aborted) setData(res.data);
      })
      .catch(() => {});
    return () => controller.abort();
  }, [guildId]);

  const recheck = () => {
    setRechecking(true);
    apiClient.panels
      .checkPermissions(guildId)
      .then((res) => {
        setData(res.data);
        setHasRechecked(true);
      })
      .catch(() => {})
      .finally(() => setRechecking(false));
  };

  if (!data) return null;

  const badPanels = data.panels.filter((p) => !p.ok);
  const allOk = badPanels.length === 0;

  if (allOk && !hasRechecked) return null;

  if (allOk) {
    return (
      <div className="rounded-lg border border-green-500/40 bg-green-500/10 px-4 py-3 mb-6">
        <div className="flex items-center gap-2">
          <svg
            className="h-4 w-4 shrink-0 text-green-400"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={2}
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"
            />
          </svg>
          <p className="text-sm text-green-300">The bot has all required permissions.</p>
        </div>
      </div>
    );
  }

  const hasDeleted = badPanels.some((p) => p.channels.some((ch) => ch.deleted));
  const hasMissingPerms = badPanels.some((p) => p.channels.some((ch) => !ch.ok && !ch.deleted));

  const summaryText = (() => {
    const count = badPanels.length;
    const plural = count !== 1;
    if (hasDeleted && hasMissingPerms)
      return `${count} ${plural ? "panels have" : "panel has"} missing permissions or deleted channels`;
    if (hasDeleted)
      return plural
        ? `${count} panels reference deleted channels or categories`
        : "1 panel references a deleted channel or category";
    return `${count} ${plural ? "panels are" : "panel is"} missing bot permissions`;
  })();

  const borderColor = hasDeleted ? "border-red-500/40" : "border-amber-500/40";
  const bgColor = hasDeleted ? "bg-red-500/10" : "bg-amber-500/10";
  const iconColor = hasDeleted ? "text-red-400" : "text-amber-400";
  const textColor = hasDeleted ? "text-red-300" : "text-amber-300";
  const btnColor = hasDeleted
    ? "text-red-400/70! hover:text-red-300"
    : "text-amber-400/70! hover:text-amber-300";

  return (
    <div className={`rounded-lg border ${borderColor} ${bgColor} px-4 py-3 mb-6`}>
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-2 min-w-0">
          <svg
            className={`mt-0.5 h-4 w-4 shrink-0 ${iconColor}`}
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={2}
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z"
            />
          </svg>
          <div className="min-w-0">
            <p className={`text-sm ${textColor}`}>{summaryText}</p>
            {expanded && (
              <div className="mt-3 space-y-3">
                {badPanels.map((p) => (
                  <PanelDetail key={p.panel_id} panel={p} isError={hasDeleted} guildId={guildId} />
                ))}
              </div>
            )}
          </div>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <Button
            variant="ghost"
            size="sm"
            onClick={recheck}
            disabled={rechecking}
            title="Recheck permissions"
            className={btnColor}
          >
            {rechecking ? "Checking…" : "Recheck"}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setExpanded((v) => !v)}
            title={expanded ? "Hide details" : "Show details"}
            className={btnColor}
          >
            {expanded ? "Hide" : "Details"}
          </Button>
        </div>
      </div>
    </div>
  );
};

export default PermissionWarningBanner;
