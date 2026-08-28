import { useContext, useEffect, useMemo, useState, type FC } from "react";
import { apiClient } from "@/lib/api";
import { useParams, useNavigate, Link } from "react-router";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faArrowLeft, faEyeSlash, faSpinner } from "@fortawesome/free-solid-svg-icons";
import { MainLayout } from "@/pages/layout/Main";
import DiscordMessage from "@/components/discord/DiscordMessage";
import EmptyState from "@/components/EmptyState";
import { GuildContext } from "@/state/context";
import type { GuildChannel, GuildRole, Transcript } from "@/types";

const TranscriptsView: FC = () => {
  let { guildId, id: transcriptId } = useParams();
  guildId = guildId!;
  transcriptId = transcriptId!;

  const navigate = useNavigate();
  const guild = useContext(GuildContext);
  const [transcript, setTranscript] = useState<Transcript | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [contentRestricted, setContentRestricted] = useState(false);

  const canViewAllTranscripts = (guild?.permission_level ?? 0) >= 1;

  useEffect(() => {
    const fetchTranscript = async () => {
      try {
        const transcriptRes = await apiClient.transcripts.getById(guildId, transcriptId);
        const payload = transcriptRes.data;

        if (payload.content_restricted) {
          setContentRestricted(true);
          return;
        }

        const normalized: Transcript = {
          version: 2,
          entities: {
            users: Object.fromEntries(
              Object.entries(payload.entities.users).map(([id, u]) => [
                id,
                {
                  id,
                  username: u.username,
                  avatar: u.avatar,
                  bot: u.badge === "bot",
                  admin_tier: "" as const,
                },
              ]),
            ),
            channels: Object.fromEntries(
              Object.entries(payload.entities.channels).map(([id, ch]) => [
                id,
                { id, name: ch.name } as unknown as GuildChannel,
              ]),
            ),
            roles: Object.fromEntries(
              Object.entries(payload.entities.roles).map(([id, r]) => [
                id,
                { id, name: r.name, color: r.color } as GuildRole,
              ]),
            ),
          },
          messages: payload.messages.map((msg) => ({
            id: msg.id,
            author: msg.author,
            content: msg.content,
            timestamp: new Date(msg.time).toISOString(),
            embeds: msg.embeds ?? [],
            attachments: msg.attachments ?? [],
            components: msg.components,
          })),
        };

        setTranscript(normalized);
      } catch (err) {
        const res = (err as { response?: { status?: number; data?: { error?: string } } }).response;
        if (res?.status === 403) {
          navigate("/", { replace: true });
          return;
        }
        setError(res?.data?.error ?? "Failed to load transcript. Please try again.");
      } finally {
        setLoading(false);
      }
    };

    fetchTranscript();
  }, [guildId, transcriptId, navigate]);

  const entities = useMemo(() => {
    if (!transcript) return null;
    const guildRoles = Object.fromEntries((guild?.roles ?? []).map((r) => [r.id, r]));
    return {
      ...transcript.entities,
      roles: { ...transcript.entities.roles, ...guildRoles },
    };
  }, [transcript, guild?.roles]);

  return (
    <MainLayout title={`Transcript #${transcriptId}`}>
      {canViewAllTranscripts && (
        <div className="mb-4">
          <Link
            to={`/manage/${guildId}/transcripts`}
            className="flex items-center gap-2 text-sm text-gray-400 hover:text-white transition-colors cursor-pointer"
          >
            <FontAwesomeIcon icon={faArrowLeft} />
            Back to transcripts
          </Link>
        </div>
      )}

      {loading && (
        <div className="flex items-center justify-center py-16 text-gray-400">
          <FontAwesomeIcon icon={faSpinner} spin className="mr-2" />
          Loading transcript...
        </div>
      )}

      {!loading && error && (
        <div className="flex items-center justify-center py-16 text-gray-400">{error}</div>
      )}

      {!loading && !error && contentRestricted && (
        <div className="bg-gray-800 border border-neutral-700 rounded-xl overflow-hidden">
          <EmptyState
            icon={faEyeSlash}
            title="Transcript content hidden"
            description="Your access level does not include viewing transcript message content."
            headingLevel="h2"
          />
        </div>
      )}

      {!loading && !error && !contentRestricted && transcript && entities && (
        <div className="bg-gray-800 border border-neutral-700 rounded-xl overflow-hidden">
          {transcript.messages.length === 0 ? (
            <p className="text-gray-400 text-center py-12">No messages found.</p>
          ) : (
            <div className="divide-y divide-neutral-700/50">
              {transcript.messages.map((msg) => (
                <DiscordMessage
                  key={msg.id}
                  message={msg}
                  entities={entities}
                  compact={false}
                  showTimestamp={true}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </MainLayout>
  );
};

export default TranscriptsView;
