import type { ReactNode } from "react";

export interface SelectInfo {
  title: string;
  description: ReactNode;
  imageSrc: string;
  imageAlt: string;
}

export const PANEL_MESSAGE_INFO: SelectInfo = {
  title: "Panel Message",
  description: (
    <>
      <p>
        The <strong>panel message</strong> is the embed users see in Discord — title, description,
        and an <strong>Open Ticket</strong> button. The bot sends or updates it in the{" "}
        <strong>Panel Channel</strong> you choose here.
      </p>
      <p>
        Pick a text channel members can view. In <strong>thread mode</strong>, new tickets are
        created as threads under this channel. In <strong>channel mode</strong>, tickets open in
        your ticket category, but the panel message still lives in this channel.
      </p>
    </>
  ),
  imageSrc: "/images/panel_message.png",
  imageAlt: "Example panel message embed with an Open Ticket button in Discord",
};

export const TRANSCRIPT_CHANNEL_INFO: SelectInfo = {
  title: "Transcript Channel",
  description: (
    <>
      <p>
        When a ticket on this panel is closed, the bot posts a <strong>Ticket Closed</strong>{" "}
        summary here with ticket ID, opener/closer, timestamps, and a link to the online transcript.
      </p>
      <p>
        Choose a text channel your staff can access, or leave empty to disable posting. Works with{" "}
        <strong>Enable Transcripts</strong> on the same panel.
      </p>
    </>
  ),
  imageSrc: "/images/transcript_channel.png",
  imageAlt: "Example Ticket Closed message posted to a transcript channel in Discord",
};

export const THREAD_NOTIFICATION_CHANNEL_INFO: SelectInfo = {
  title: "Thread Notification Channel",
  description: (
    <>
      <p>
        When <strong>Create Tickets as Threads</strong> is enabled, new tickets open as threads. The
        bot posts a <strong>Join Ticket</strong> message in this channel so staff see new tickets
        and can join with one click.
      </p>
      <p>
        Required in thread mode — pick a staff-facing text channel where your team monitors new
        tickets.
      </p>
    </>
  ),
  imageSrc: "/images/notification_channel.png",
  imageAlt: "Example Join Ticket notification posted to a thread notification channel in Discord",
};
