import { useEffect, useState, type FC, useMemo } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faInfoCircle } from "@fortawesome/free-solid-svg-icons";
import { apiClient } from "@/lib/api";
import { useGuildPanels, useGuildPremium } from "@/hooks/queries/useGuild";
import { useParams } from "react-router";
import PremiumGate from "@/components/PremiumGate";
import Collapsible from "@/components/Collapsible";
import Button from "@/components/Button";
import Select from "@/components/Select";
import Slider from "@/components/Slider";
import { useGuildStore } from "@/stores/guild";
import { getGuildById } from "@/stores/auth";
import ColourSelect from "@/components/ColourSelect";
import { MainLayout } from "@/pages/layout/Main";
import SettingsSkeleton from "@/components/skeletons/SettingsSkeleton";
import { toast } from "sonner";
import type { GuildSettings } from "@/types";

import PermissionWarningBanner from "@/components/PermissionWarningBanner";
import PanelSwitchBehaviourInfoModal from "@/components/modals/PanelSwitchBehaviourInfoModal";
import { PANEL_SWITCH_OPTIONS } from "@/constants/panelSwitchBehaviour";

const PanelSwitchSelect: FC<{ value: number; onChange: (v: number) => void }> = ({
  value,
  onChange,
}) => {
  const [infoOpen, setInfoOpen] = useState(false);

  return (
    <div className="flex flex-col">
      <div className="mb-1 flex items-center gap-1.5">
        <span className="text-white">Claim Behaviour on Panel Switch</span>
        <Button
          variant="ghost"
          size="icon"
          className="text-gray-400 hover:text-gray-200"
          aria-label="Learn more about Claim Behaviour on Panel Switch"
          onClick={() => setInfoOpen(true)}
        >
          <FontAwesomeIcon icon={faInfoCircle} className="w-4 h-4" aria-hidden="true" />
        </Button>
      </div>
      <Select
        value={String(value)}
        onChange={(v) => onChange(Number(v))}
        options={PANEL_SWITCH_OPTIONS.map(({ key, label }) => ({ key, label }))}
        hideSearch
      />
      <PanelSwitchBehaviourInfoModal isOpen={infoOpen} onClose={() => setInfoOpen(false)} />
    </div>
  );
};

const GuildSettings: FC = () => {
  let { guildId } = useParams();
  guildId = guildId!;
  const { data: panels = [] } = useGuildPanels(guildId);
  const { data: premiumState } = useGuildPremium(guildId);
  const {
    guildSettings,
    setGuildSettings,
    updateGuildSettings,
    isLoadingSettings,
    selectGuild,
    selectedGuild,
  } = useGuildStore();

  useEffect(() => {
    const guild = getGuildById(guildId);
    if (guild) {
      if (!selectedGuild || selectedGuild.id !== guild.id) {
        selectGuild(guild);
      }

      if (guild.permission_level < 2) {
        toast.warning(
          "You do not have permission to manage this server's settings. Please contact an administrator.",
        );
      }
    }
  }, [guildId, selectGuild, selectedGuild]);

  const initialForm: GuildSettings = {
    language: "en",
    anonymise_dashboard_responses: false,
    context_menu_permission_level: "0",
    context_menu_add_sender: false,
    claim_settings: {
      switch_panel_claim_behavior: 0,
    },
    colours: {},
    locales: [],
  };
  const [form, setForm] = useState<GuildSettings>(initialForm);
  const updateField = <K extends keyof GuildSettings>(field: K, value: GuildSettings[K]) => {
    setForm((f) => ({ ...f, [field]: value }));
  };

  const languageList = useMemo(
    () =>
      guildSettings?.locales.map((l) => ({
        key: l.iso_short_code,
        label: l.local_name,
      })) || [],
    [guildSettings?.locales],
  );

  const saveChanges = async () => {
    try {
      const guild = getGuildById(guildId);
      if (guild && guild.permission_level < 2) return;

      updateGuildSettings(form);

      await apiClient.guilds.updateSettings(guildId, form);
      toast.success("Settings saved successfully");
    } catch (error) {
      console.error("Failed to save settings:", error);
      if (guildSettings) {
        setGuildSettings(guildSettings);
      }
    }
  };

  useEffect(() => {
    const fetchSettings = async () => {
      const guild = getGuildById(guildId);
      if (guild && guild.permission_level < 2) return;
      const res = await apiClient.guilds.getSettings(guildId);
      setGuildSettings(res.data);
    };

    fetchSettings().catch((error) => {
      console.error("Failed to fetch settings:", error);
      setGuildSettings(null);
    });
  }, [guildId, setGuildSettings]);

  useEffect(() => {
    if (guildSettings) {
      setForm(guildSettings);
    }
  }, [guildSettings]);

  if (isLoadingSettings) {
    return (
      <MainLayout
        title={`Global Settings for ${selectedGuild?.name || "loading..."}`}
        subtitle="Manage general and global settings for your server"
      >
        <SettingsSkeleton />
      </MainLayout>
    );
  }

  return (
    <MainLayout
      title={`Global Settings for ${selectedGuild?.name || "loading..."}`}
      subtitle="Manage general and global settings for your server"
    >
      <PermissionWarningBanner guildId={guildId} />

      {/* General Settings */}
      <Collapsible
        title="General"
        defaultOpen={true}
        subtitle="Configure general bot behaviour for your server"
      >
        <div className="p-4 grid gap-4 grid-cols-1 sm:grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
          <Select
            value={form.language}
            onChange={(v) => updateField("language", v ?? "")}
            label="Language"
            options={languageList}
          />

          <PanelSwitchSelect
            value={form.claim_settings.switch_panel_claim_behavior}
            onChange={(v) =>
              updateField("claim_settings", {
                ...form.claim_settings,
                switch_panel_claim_behavior: v,
              })
            }
          />

          <Slider
            value={form.anonymise_dashboard_responses}
            onChange={(v) => updateField("anonymise_dashboard_responses", v)}
            label="Anonymise Dashboard Responses"
          />
        </div>
      </Collapsible>

      {/* Context Menu Settings */}
      <Collapsible
        title="Context Menu"
        defaultOpen={true}
        subtitle="Start ticket via right-click context menu"
      >
        <div className="p-4 grid gap-4 grid-cols-1 sm:grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
          <Select
            value={form.context_menu_panel?.toString() ?? ""}
            onChange={(v) => updateField("context_menu_panel", v ? Number(v) : undefined)}
            label="Use Settings from Panel"
            options={[
              { key: null, label: "None" },
              ...panels.map((p) => ({
                key: p.panel_id.toString(),
                label: p.title,
              })),
            ]}
          />

          <Select
            value={form.context_menu_permission_level}
            onChange={(v) => updateField("context_menu_permission_level", v ?? "")}
            label="Required Permission Level"
            options={[
              { key: "0", label: "Everyone" },
              { key: "1", label: "Staff Only" },
              { key: "2", label: "Admin Only" },
            ]}
            hideSearch
          />

          <Slider
            value={form.context_menu_add_sender}
            onChange={(v) => updateField("context_menu_add_sender", v)}
            label="Add Sender to Ticket"
          />
        </div>
      </Collapsible>

      {/* Colour Scheme Settings */}
      <Collapsible
        title="Colour Scheme"
        defaultOpen={true}
        subtitle="Customise the colours used in bot responses"
      >
        <PremiumGate
          isPremium={!!premiumState?.premium}
          feature="colour-scheme"
          description="Customise your ticket embed colours."
          variant="overlay"
        >
          <div className="p-6 grid gap-4 grid-cols-1 sm:grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
            <ColourSelect
              value={form.colours?.["0"] || "#2ecc71"}
              onChange={(v) => updateField("colours", { ...form.colours, "0": v })}
              label="Success"
            />

            <ColourSelect
              value={form.colours?.["1"] || "#fc3f35"}
              onChange={(v) => updateField("colours", { ...form.colours, "1": v })}
              label="Failure"
            />
          </div>
        </PremiumGate>
      </Collapsible>

      <div className="flex justify-end mb-8">
        <Button variant="success" onClick={saveChanges} className="font-bold">
          Save Changes
        </Button>
      </div>
    </MainLayout>
  );
};

export default GuildSettings;
