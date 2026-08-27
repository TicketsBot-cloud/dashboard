import type { RouteObject } from "react-router";

import {
  ActivateIntegrationPage,
  AnalyticsPage,
  AuditLogPage,
  BlacklistPage,
  ConfigureIntegrationPage,
  CreateFormPage,
  CreateIntegrationPage,
  CreateKBArticlePage,
  CreateMultiPanelPage,
  CreatePanelPage,
  EditFormPage,
  EditKBArticlePage,
  EditMultiPanelPage,
  EditPanelPage,
  FormsPage,
  GuildSettings,
  IntegrationsPage,
  KBPage,
  ManageIntegrationPage,
  Overview,
  PanelsPage,
  StaffDetailPage,
  StaffOverridePage,
  TagsPage,
  TeamsPage,
  TicketsIndex,
  TicketsView,
  TranscriptsIndex,
  TranscriptsView,
  ViewIntegrationPage,
} from "@/router/lazy-pages";
import { LegacyEditMultiPanelRedirect, SiblingRouteRedirect } from "@/router/redirects/components";
import { guildPage } from "@/router/wrap";

/** Child routes under `/manage/:guildId`. */
export const guildRoutes: RouteObject[] = [
  { index: true, element: guildPage(1, <Overview />) },
  { path: "settings", element: guildPage(2, <GuildSettings />) },
  { path: "appearance", element: <SiblingRouteRedirect to="settings" /> },
  {
    path: "transcripts",
    children: [
      { path: "", element: guildPage(1, <TranscriptsIndex />) },
      { path: "view/:id", element: guildPage(1, <TranscriptsView />) },
    ],
  },
  {
    path: "panels",
    children: [
      { path: "", element: guildPage(2, <PanelsPage />) },
      { path: "create", element: guildPage(2, <CreatePanelPage />) },
      { path: "edit/:panelId", element: guildPage(2, <EditPanelPage />) },
      {
        path: "multi",
        children: [
          { path: "create", element: guildPage(2, <CreateMultiPanelPage />) },
          { path: "edit/:panelId", element: guildPage(2, <EditMultiPanelPage />) },
        ],
      },
      { path: "create-multi", element: <SiblingRouteRedirect to="multi/create" /> },
      { path: "createmulti", element: <SiblingRouteRedirect to="multi/create" /> },
      { path: "edit-multi/:panelId", element: <LegacyEditMultiPanelRedirect /> },
      { path: "editmulti/:panelId", element: <LegacyEditMultiPanelRedirect /> },
    ],
  },
  {
    path: "forms",
    children: [
      { path: "", element: guildPage(2, <FormsPage />) },
      { path: "create", element: guildPage(2, <CreateFormPage />) },
      { path: "edit/:formId", element: guildPage(2, <EditFormPage />) },
    ],
  },
  { path: "teams", element: guildPage(2, <TeamsPage />) },
  { path: "tags", element: guildPage(2, <TagsPage />) },
  {
    path: "kb",
    children: [
      { path: "", element: guildPage(2, <KBPage />) },
      { path: "create", element: guildPage(2, <CreateKBArticlePage />) },
      { path: "edit/:articleId", element: guildPage(2, <EditKBArticlePage />) },
    ],
  },
  { path: "blacklist", element: guildPage(1, <BlacklistPage />) },
  { path: "audit-log", element: guildPage(2, <AuditLogPage />) },
  { path: "auditlog", element: <SiblingRouteRedirect to="audit-log" /> },
  { path: "analytics", element: guildPage(1, <AnalyticsPage />) },
  { path: "analytics/staff/:userId", element: guildPage(2, <StaffDetailPage />) },
  { path: "staff-override", element: guildPage(2, <StaffOverridePage />) },
  { path: "staffoverride", element: <SiblingRouteRedirect to="staff-override" /> },
  {
    path: "integrations",
    children: [
      { path: "", element: guildPage(1, <IntegrationsPage />) },
      { path: "create", element: guildPage(2, <CreateIntegrationPage />) },
      { path: "view/:integration", element: guildPage(1, <ViewIntegrationPage />) },
      { path: "activate/:integration", element: guildPage(2, <ActivateIntegrationPage />) },
      { path: "configure/:integration", element: guildPage(2, <ConfigureIntegrationPage />) },
      { path: "manage/:integration", element: guildPage(2, <ManageIntegrationPage />) },
    ],
  },
  {
    path: "tickets",
    children: [
      { path: "", element: guildPage(1, <TicketsIndex />) },
      { path: "view/:id", element: guildPage(1, <TicketsView />) },
    ],
  },
];
