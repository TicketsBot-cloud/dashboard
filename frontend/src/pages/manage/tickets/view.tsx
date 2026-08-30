import { useCallback, useEffect, useRef, useState, type FC } from "react";
import { apiClient } from "@/lib/api";
import { Navigate, useParams, useNavigate } from "react-router";

import { toast } from "sonner";
import { useAuthStore, getGuildById } from "@/stores/auth";
import { MainLayout } from "@/pages/layout/Main";
import DiscordMessage from "@/components/discord/DiscordMessage";
import EmptyState from "@/components/EmptyState";
import Button from "@/components/Button";
import Select from "@/components/Select";
import UserSearchSelect, { type UserOption } from "@/components/UserSearchSelect";
import { WS_URL } from "@/lib/constants";
import Collapsible from "@/components/Collapsible";
import type {
  Message,
  StrippedMessage,
  Tag,
  TicketMember,
  Transcript,
  TicketUser,
  TicketViewData,
  User,
} from "@/types";
import MentionTextarea from "@/components/MentionTextarea";
import NumberInput from "@/components/NumberInput";
import TextInput from "@/components/TextInput";
import ActionModal from "@/components/modal-primitives/ActionModal";
import PremiumGate from "@/components/PremiumGate";
import { faEyeSlash, faLinkSlash } from "@fortawesome/free-solid-svg-icons";
import Skeleton from "react-loading-skeleton";
import { showApiErrorToast } from "@/lib/api-error";
import { useGuildPremium } from "@/hooks/queries/useGuild";

function authorToUser(author: StrippedMessage["author"]): User {
  return {
    id: author.id,
    username: author.global_name || author.username,
    avatar: author.avatar ?? "",
    bot: author.bot ?? false,
    admin_tier: "",
  };
}

function transformMessage(msg: StrippedMessage, index: number): { user: User; message: Message } {
  const user = authorToUser(msg.author);
  return {
    user,
    message: {
      id: String(index),
      author: user.id,
      content: msg.content,
      timestamp: msg.timestamp,
      attachments: msg.attachments ?? [],
      embeds: msg.embeds ?? [],
      components: msg.components ?? [],
    },
  };
}

function transformMessages(apiMessages: StrippedMessage[]): {
  entities: Transcript["entities"];
  messages: Message[];
} {
  const users: Record<string, User> = {};
  const messages: Message[] = [];

  for (let i = 0; i < apiMessages.length; i++) {
    const { user, message } = transformMessage(apiMessages[i], i);
    users[user.id] = user;
    messages.push(message);

    for (const mentioned of apiMessages[i].mentions ?? []) {
      if (!users[mentioned.id]) {
        users[mentioned.id] = authorToUser(mentioned);
      }
    }
  }

  return {
    entities: { users, channels: {}, roles: {} },
    messages,
  };
}

const MESSAGE_REFRESH_INTERVAL = 30;

/** 400/403/404 from the ticket endpoint = invalid id, closed, deleted, or not ours - the page can't render. */
function isTicketUnavailable(error: unknown): boolean {
  const status = (error as { response?: { status?: number } })?.response?.status;
  return status === 400 || status === 403 || status === 404;
}

const InfoRow: FC<{ label: string; value: string }> = ({ label, value }) => (
  <div className="flex items-baseline gap-2">
    <span className="text-gray-400 text-sm shrink-0">{label}:</span>
    <span className="text-white text-sm">{value}</span>
  </div>
);

const UserRow: FC<{ label: string; user: TicketUser }> = ({ label, user }) => {
  const handleCopy = () => {
    navigator.clipboard.writeText(user.id);
    toast.success("Copied!");
  };
  return (
    <div className="flex items-center gap-2">
      <span className="text-gray-400 text-sm shrink-0">{label}:</span>
      <span className="text-white text-sm">{user.username}</span>
      <span className="text-gray-500 text-xs font-mono">{user.id}</span>
      <Button
        variant="ghost"
        size="icon"
        onClick={handleCopy}
        title={`Copy ${label.toLowerCase()} ID`}
      >
        <svg
          className="w-3.5 h-3.5"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
          />
        </svg>
      </Button>
    </div>
  );
};

const TicketViewPage: FC = () => {
  const navigate = useNavigate();
  const token = useAuthStore((s) => s.accessToken);
  const currentUser = useAuthStore((s) => s.user);
  let { guildId, id: ticketId } = useParams();
  guildId = guildId!;
  ticketId = ticketId!;

  const isAdmin = (getGuildById(guildId)?.permission_level ?? 0) >= 2;

  const premiumQuery = useGuildPremium(guildId, true);
  const isPremium = premiumQuery.data?.premium ?? false;

  const [ticket, setTicket] = useState<TicketViewData | null>(null);
  const [panelTitle, setPanelTitle] = useState<string | null>(null);
  const [entities, setEntities] = useState<Transcript["entities"]>({
    users: {},
    channels: {},
    roles: {},
  });
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [unavailable, setUnavailable] = useState(false);
  const [tags, setTags] = useState<Record<string, Tag>>({});
  const [closeReason, setCloseReason] = useState("");
  const [closing, setClosing] = useState(false);
  const [claimLoading, setClaimLoading] = useState(false);
  const [transferTarget, setTransferTarget] = useState<UserOption | null>(null);
  const [transferLoading, setTransferLoading] = useState(false);
  const [closeRequestReason, setCloseRequestReason] = useState("");
  const [closeRequestDelay, setCloseRequestDelay] = useState(0);
  const [sendingCloseRequest, setSendingCloseRequest] = useState(false);
  const [messageContent, setMessageContent] = useState("");
  const [sending, setSending] = useState(false);
  const [tagModalOpen, setTagModalOpen] = useState(false);
  const [selectedTag, setSelectedTag] = useState("");
  const [ticketMembers, setTicketMembers] = useState<TicketMember[]>([]);
  const [contentRestricted, setContentRestricted] = useState(false);
  const [channelMissing, setChannelMissing] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const [wsConnected, setWsConnected] = useState(false);
  const messageCountRef = useRef(0);
  const refreshTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const initialScrollDoneRef = useRef(false);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  const fetchMessages = useCallback(async () => {
    try {
      const response = await apiClient.tickets.getById(guildId, ticketId);
      setTicket(response.data.ticket);
      setPanelTitle(response.data.panel_title ?? null);

      const missing = response.data.channel_missing ?? false;
      setChannelMissing(missing);
      if (missing) {
        setMessages([]);
        messageCountRef.current = 0;
        return;
      }

      const { entities: ent, messages: msgs } = transformMessages(response.data.messages);
      setEntities((prev) => ({ ...prev, users: { ...prev.users, ...ent.users } }));
      setMessages(msgs);
      messageCountRef.current = msgs.length;
    } catch (error) {
      // The ticket may have been closed from Discord while we were viewing it
      if (isTicketUnavailable(error)) {
        setUnavailable(true);
        return;
      }
      console.error("Failed to refresh messages:", error);
    }
  }, [guildId, ticketId]);

  const startRefreshTimer = useCallback(() => {
    if (refreshTimerRef.current) clearInterval(refreshTimerRef.current);
    refreshTimerRef.current = setInterval(fetchMessages, MESSAGE_REFRESH_INTERVAL * 1000);
  }, [fetchMessages]);

  // Fetch initial data
  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        // allSettled, not all: a 403 from roles must not be mistaken for an
        // unavailable ticket, and neither should be able to blank out the whole page.
        const [ticketRes, rolesRes] = await Promise.allSettled([
          apiClient.tickets.getById(guildId, ticketId),
          apiClient.guilds.getRoles(guildId),
        ]);

        if (ticketRes.status === "rejected") {
          if (isTicketUnavailable(ticketRes.reason)) {
            setUnavailable(true);
          } else {
            showApiErrorToast(ticketRes.reason, "Failed to load the ticket.");
          }
          return;
        }

        setTicket(ticketRes.value.data.ticket);
        setPanelTitle(ticketRes.value.data.panel_title ?? null);

        const restricted = ticketRes.value.data.content_restricted ?? false;
        setContentRestricted(restricted);

        const missing = ticketRes.value.data.channel_missing ?? false;
        setChannelMissing(missing);

        if (restricted || missing) {
          return;
        }

        const { entities: ent, messages: msgs } = transformMessages(ticketRes.value.data.messages);

        const rolesById: Transcript["entities"]["roles"] = {};
        if (rolesRes.status === "fulfilled") {
          for (const role of rolesRes.value.data.roles ?? []) {
            rolesById[role.id] = role;
          }
        }
        ent.roles = rolesById;

        setEntities(ent);
        setMessages(msgs);
        messageCountRef.current = msgs.length;
      } catch (error) {
        console.error("Failed to load the ticket page:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [guildId, ticketId]);

  useEffect(() => {
    if (!isPremium || loading || contentRestricted || channelMissing) return;

    const fetchComposerData = async () => {
      try {
        const tagsRes = await apiClient.tags.getByGuild(guildId);
        setTags(tagsRes.data || {});
      } catch {
        // Tags are non-critical - don't block the page
      }

      try {
        const membersRes = await apiClient.tickets.getMembers(guildId, ticketId);
        const fetchedMembers = membersRes.data.members ?? [];
        setTicketMembers(fetchedMembers);

        // Merge into entities so DiscordContent can render mention display names
        setEntities((prev) => ({
          ...prev,
          users: {
            ...prev.users,
            ...Object.fromEntries(
              fetchedMembers.map((m) => [
                m.id,
                {
                  id: m.id,
                  username: m.username,
                  avatar: m.avatar,
                  bot: false,
                  admin_tier: "" as const,
                },
              ]),
            ),
          },
        }));
      } catch {
        // Members are non-critical - mention autocomplete just won't work
      }
    };

    void fetchComposerData();
  }, [isPremium, loading, contentRestricted, channelMissing, guildId, ticketId]);

  // Connect WebSocket when premium
  useEffect(() => {
    if (!isPremium || loading || !token || contentRestricted || channelMissing) return;

    const ws = new WebSocket(`${WS_URL}/api/${guildId}/tickets/${ticketId}/live-chat`);
    wsRef.current = ws;

    ws.onopen = () => {
      setWsConnected(true);
      ws.send(
        JSON.stringify({
          type: "auth",
          data: { token },
        }),
      );
    };

    ws.onclose = () => {
      setWsConnected(false);
    };

    ws.onmessage = (evt) => {
      let payload: { type?: string; data?: { message?: StrippedMessage } };
      try {
        payload = JSON.parse(evt.data);
      } catch {
        return;
      }

      if (payload.type === "message" && payload.data?.message) {
        const raw = payload.data.message as StrippedMessage;
        if (!raw?.author) return;
        const idx = messageCountRef.current;
        messageCountRef.current = idx + 1;
        const { user, message } = transformMessage(raw, idx);

        setEntities((prev) => ({
          ...prev,
          users: { ...prev.users, [user.id]: user },
        }));
        setMessages((prev) => [...prev, message]);
      }
    };

    return () => {
      setWsConnected(false);
      ws.close();
      wsRef.current = null;
    };
  }, [isPremium, loading, token, guildId, ticketId, contentRestricted, channelMissing]);

  // Poll only when live chat WebSocket is unavailable (non-premium or disconnected)
  useEffect(() => {
    if (loading) return;
    if (contentRestricted || channelMissing || (isPremium && wsConnected)) {
      if (refreshTimerRef.current) {
        clearInterval(refreshTimerRef.current);
        refreshTimerRef.current = null;
      }
      return;
    }
    startRefreshTimer();
    return () => {
      if (refreshTimerRef.current) clearInterval(refreshTimerRef.current);
    };
  }, [loading, isPremium, wsConnected, contentRestricted, channelMissing, startRefreshTimer]);

  // Toast once when the ticket turns out to be unviewable - the render below redirects
  useEffect(() => {
    if (unavailable) {
      toast.error(`Ticket #${ticketId} is closed or no longer available.`);
    }
  }, [unavailable, ticketId]);

  // Scroll to bottom on initial load
  useEffect(() => {
    if (!loading && messages.length > 0 && !initialScrollDoneRef.current) {
      initialScrollDoneRef.current = true;
      scrollToBottom();
    }
  }, [loading, messages, scrollToBottom]);

  const handleClose = async () => {
    setClosing(true);
    try {
      await apiClient.tickets.close(guildId, ticketId, closeReason);
      toast.success("Ticket closed successfully.");
      navigate(`/manage/${guildId}/tickets`, { state: { closedTicketId: parseInt(ticketId) } });
    } catch (error) {
      console.error("Failed to close the ticket:", error);
    } finally {
      setClosing(false);
    }
  };

  const handleClaim = async () => {
    setClaimLoading(true);
    try {
      await apiClient.tickets.claim(guildId, ticketId);
      toast.success("Ticket claimed.");
      if (currentUser) {
        setTicket((prev) =>
          prev
            ? { ...prev, claimer: { id: currentUser.id, username: currentUser.username } }
            : prev,
        );
      }
      // The worker processes the claim asynchronously; reconcile shortly after.
      setTimeout(() => void fetchMessages(), 1500);
    } catch (error) {
      console.error("Failed to claim the ticket:", error);
      // Likely already claimed by someone else - refetch to show the real claimer.
      void fetchMessages();
    } finally {
      setClaimLoading(false);
    }
  };

  const handleUnclaim = async () => {
    setClaimLoading(true);
    try {
      await apiClient.tickets.unclaim(guildId, ticketId);
      toast.success("Ticket unclaimed.");
      setTicket((prev) => (prev ? { ...prev, claimer: null } : prev));
      setTimeout(() => void fetchMessages(), 1500);
    } catch (error) {
      console.error("Failed to unclaim the ticket:", error);
      void fetchMessages();
    } finally {
      setClaimLoading(false);
    }
  };

  const loadStaffOptions = async (query: string): Promise<UserOption[]> => {
    try {
      const res = await apiClient.guilds.searchMembers(guildId, query);
      return res.data.map(({ user }) => user);
    } catch {
      return [];
    }
  };

  const handleTransfer = async () => {
    if (!transferTarget) return;
    setTransferLoading(true);
    try {
      await apiClient.tickets.transfer(guildId, ticketId, transferTarget.id);
      toast.success("Ticket transferred.");
      setTicket((prev) =>
        prev
          ? { ...prev, claimer: { id: transferTarget.id, username: transferTarget.username } }
          : prev,
      );
      setTransferTarget(null);
      setTimeout(() => void fetchMessages(), 1500);
    } catch (error) {
      console.error("Failed to transfer the ticket:", error);
      void fetchMessages();
    } finally {
      setTransferLoading(false);
    }
  };

  const handleCloseRequest = async () => {
    setSendingCloseRequest(true);
    try {
      const delay = closeRequestDelay > 0 ? closeRequestDelay : undefined;
      await apiClient.tickets.closeRequest(
        guildId,
        ticketId,
        closeRequestReason || undefined,
        delay,
      );
      toast.success("Close request sent successfully.");
      setCloseRequestReason("");
      setCloseRequestDelay(0);
    } catch (error) {
      console.error("Failed to send close request:", error);
      toast.error("Failed to send close request.");
    } finally {
      setSendingCloseRequest(false);
    }
  };

  const handleSendMessage = async () => {
    if (!messageContent.trim()) return;

    setSending(true);
    try {
      await apiClient.tickets.sendMessage(guildId, ticketId, messageContent);
      setMessageContent("");
      await fetchMessages();
      startRefreshTimer();
    } catch (error) {
      console.error("Failed to send the message:", error);
    } finally {
      setSending(false);
    }
  };

  const handleSendTag = async () => {
    if (!selectedTag) return;

    setTagModalOpen(false);
    try {
      await apiClient.tickets.sendTag(guildId, ticketId, selectedTag);
      setSelectedTag("");
      toast.success("Tag sent");
      await fetchMessages();
      startRefreshTimer();
    } catch (error) {
      console.error("Failed to send the tag:", error);
    }
  };

  const tagKeys = Object.keys(tags);

  const showComposerSlot = !contentRestricted && !channelMissing && ticket !== null;
  // Only a lookup holding no data may hide the gate - a failed refetch still has some.
  const composerLoading = loading || premiumQuery.isPending;

  // Closed, deleted or not ours - send the user back to the list rather than render a dead page
  if (unavailable) {
    return (
      <Navigate
        to={`/manage/${guildId}/tickets`}
        replace
        state={{ closedTicketId: parseInt(ticketId) }}
      />
    );
  }

  return (
    <MainLayout title={`Ticket #${ticketId}`}>
      {/* Ticket Info */}
      {ticket && (
        <Collapsible title="Ticket Info">
          <div className="space-y-2">
            <InfoRow label="ID" value={`#${ticket.id}`} />
            <InfoRow
              label="Panel"
              value={panelTitle ?? (ticket.panel_id != null ? `Panel ${ticket.panel_id}` : "None")}
            />
            <InfoRow
              label="Opened"
              value={ticket.opened_at ? new Date(ticket.opened_at).toLocaleString() : "Unknown"}
            />
            <UserRow label="Opener" user={ticket.opener} />
            {ticket.claimer != null ? (
              <UserRow label="Claimed by" user={ticket.claimer} />
            ) : (
              <InfoRow label="Claimed by" value="Unclaimed" />
            )}
          </div>
        </Collapsible>
      )}

      {/* Actions */}
      {ticket && (
        <Collapsible title="Actions">
          {!channelMissing && (
            <>
              <Collapsible title="" subtitle="Claim & Transfer" defaultOpen={true}>
                <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                  <p className="text-gray-400 text-sm flex-1">
                    {ticket.claimer == null
                      ? "This ticket is unclaimed."
                      : ticket.claimer.id === currentUser?.id
                        ? "You have claimed this ticket."
                        : `Claimed by ${ticket.claimer.username}.`}
                  </p>
                  <div className="flex gap-2">
                    {ticket.claimer == null && (
                      <Button
                        variant="secondary"
                        type="button"
                        onClick={handleClaim}
                        disabled={claimLoading}
                        className="w-full sm:w-auto rounded-lg font-medium"
                      >
                        {claimLoading ? "Claiming..." : "Claim"}
                      </Button>
                    )}
                    {ticket.claimer != null &&
                      (ticket.claimer.id === currentUser?.id || isAdmin) && (
                        <Button
                          variant="secondary"
                          type="button"
                          onClick={handleUnclaim}
                          disabled={claimLoading}
                          className="w-full sm:w-auto rounded-lg font-medium"
                        >
                          {claimLoading ? "Unclaiming..." : "Unclaim"}
                        </Button>
                      )}
                  </div>
                </div>

                {/* Transfer to another staff member */}
                <div className="mt-3 flex flex-col sm:flex-row sm:items-end gap-2">
                  <div className="flex-1">
                    <UserSearchSelect
                      value={transferTarget}
                      onChange={setTransferTarget}
                      loadOptions={loadStaffOptions}
                      label="Transfer to"
                      placeholder="Search for a staff member..."
                    />
                  </div>
                  <Button
                    variant="secondary"
                    type="button"
                    onClick={handleTransfer}
                    disabled={transferLoading || !transferTarget}
                    className="w-full sm:w-auto rounded-lg font-medium"
                  >
                    {transferLoading ? "Transferring..." : "Transfer"}
                  </Button>
                </div>
              </Collapsible>

              <Collapsible title="" subtitle="Send Close Request" defaultOpen={true}>
                <p className="text-gray-400 text-sm mb-3">
                  Ask the ticket opener to confirm the ticket can be closed. They will see Accept
                  &amp; Deny buttons in Discord.
                </p>
                <div className="flex flex-col sm:flex-row gap-2">
                  <TextInput
                    label="Reason"
                    placeholder="Reason (optional)"
                    value={closeRequestReason}
                    onChange={setCloseRequestReason}
                    className="flex-1"
                  />
                  <NumberInput
                    label="Auto-close delay (hours)"
                    value={closeRequestDelay}
                    onChange={setCloseRequestDelay}
                    min={0}
                    className="w-full sm:w-64"
                  />
                  <Button
                    variant="secondary"
                    onClick={handleCloseRequest}
                    disabled={sendingCloseRequest}
                    className="self-end w-full sm:w-auto rounded-lg font-medium bg-yellow-600 hover:bg-yellow-700"
                  >
                    {sendingCloseRequest ? "Sending..." : "Send Request"}
                  </Button>
                </div>
              </Collapsible>
            </>
          )}

          <Collapsible title="" subtitle="Close Ticket" defaultOpen={true}>
            <div className="flex flex-col sm:flex-row gap-2">
              <TextInput
                placeholder="Close reason (optional)"
                value={closeReason}
                onChange={setCloseReason}
                className="flex-1"
              />
              <Button
                variant="danger"
                type="button"
                onClick={handleClose}
                disabled={closing}
                className="w-full sm:w-auto rounded-lg font-medium"
              >
                {closing ? "Closing..." : "Close"}
              </Button>
            </div>
          </Collapsible>
        </Collapsible>
      )}

      {/* Messages */}
      <div className="mb-4 p-4 bg-gray-700 rounded-xl">
        <h3 className="text-white text-lg font-semibold mb-2">Messages</h3>
        {loading ? (
          <p className="text-gray-400">Loading messages...</p>
        ) : contentRestricted ? (
          <EmptyState
            icon={faEyeSlash}
            title="Message content hidden"
            description="Your access level does not include viewing ticket message content. Ticket metadata, status, and actions remain available above."
            headingLevel="h4"
          />
        ) : channelMissing ? (
          <EmptyState
            icon={faLinkSlash}
            title="Channel no longer exists"
            description="This ticket's Discord channel has been deleted, so its messages can't be loaded. You can still close the ticket above."
            headingLevel="h4"
          />
        ) : messages.length === 0 ? (
          <p className="text-gray-400">No messages found.</p>
        ) : (
          <div className="flex flex-col items-start">
            {messages.map((msg) => (
              <DiscordMessage
                key={msg.id}
                message={msg}
                entities={entities}
                compact={false}
                showTimestamp={true}
                className="mb-2"
              />
            ))}
            <div ref={messagesEndRef} />
          </div>
        )}

        {/* Send Message */}
        {showComposerSlot &&
          (composerLoading ? (
            <div className="flex items-end gap-2 mt-4 pt-4 border-t border-gray-600">
              <Skeleton height={76} containerClassName="flex-1" />
              <Skeleton height={76} width={104} />
            </div>
          ) : premiumQuery.isLoadingError ? null : (
            <PremiumGate
              isPremium={isPremium}
              feature="dashboard-messaging"
              description="Reply to tickets directly from the dashboard."
              variant="inline"
            >
              <div className="flex items-end gap-2 mt-4 pt-4 border-t border-gray-600">
                <MentionTextarea
                  placeholder="Type your message here. Use @ to mention users."
                  value={messageContent}
                  onChange={setMessageContent}
                  members={ticketMembers}
                  disabled={!isPremium}
                  rows={3}
                  className="flex-1 bg-gray-800 text-white rounded-lg px-3 py-2 border border-gray-600 focus:border-blue-500 focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed resize-none"
                  onSubmit={handleSendMessage}
                />
                <div className="flex flex-col gap-2">
                  <Button
                    variant="primary"
                    type="button"
                    onClick={handleSendMessage}
                    disabled={sending || !messageContent.trim()}
                    className="rounded-lg font-medium"
                  >
                    {sending ? "Sending..." : "Send"}
                  </Button>
                  <Button
                    variant="secondary"
                    onClick={() => setTagModalOpen(true)}
                    disabled={tagKeys.length === 0}
                    className="rounded-lg font-medium"
                  >
                    Select Tag
                  </Button>
                </div>
              </div>
            </PremiumGate>
          ))}
      </div>

      {!contentRestricted && (
        <ActionModal
          isOpen={tagModalOpen}
          onClose={() => {
            setTagModalOpen(false);
            setSelectedTag("");
          }}
          className="max-w-md p-6"
          ariaLabelledBy="send-tag-title"
        >
          <h3 id="send-tag-title" className="text-white text-lg font-semibold">
            Send Tag
          </h3>
          <Select
            onChange={(v) => setSelectedTag(v ?? "")}
            value={selectedTag}
            className="py-4"
            placeholder="Select a tag..."
            options={tagKeys.map((tag) => ({ key: tag, label: tag }))}
            hideSearch={tagKeys.length <= 5}
          />
          <div className="flex justify-end gap-2">
            <Button
              variant="secondary"
              type="button"
              onClick={() => {
                setTagModalOpen(false);
                setSelectedTag("");
              }}
              className="rounded-lg font-medium"
            >
              Close
            </Button>
            <Button
              variant="primary"
              type="button"
              onClick={handleSendTag}
              disabled={!selectedTag}
              className="rounded-lg font-medium"
            >
              Send
            </Button>
          </div>
        </ActionModal>
      )}
    </MainLayout>
  );
};

export default TicketViewPage;
