import {
  useState,
  useEffect,
  useCallback,
  useRef,
  forwardRef,
  useImperativeHandle,
  useMemo,
} from "react";
import { apiClient } from "@/lib/api";
import { toast } from "sonner";
import type { GuildSettings } from "@/types";
import Select from "@/components/Select";
import ColourSelect from "@/components/ColourSelect";
import SettingsSkeleton from "@/components/skeletons/SettingsSkeleton";

interface SettingsStepProps {
  guildId: string;
}

export interface SettingsStepRef {
  save: () => Promise<void>;
}

const DEFAULT_SUCCESS_COLOUR = "#2ecc71";
const DEFAULT_FAILURE_COLOUR = "#fc3f35";

const SettingsStep = forwardRef<SettingsStepRef, SettingsStepProps>(({ guildId }, ref) => {
  const [isLoading, setIsLoading] = useState(true);
  const [language, setLanguage] = useState<string | null>(null);
  const [locales, setLocales] = useState<Array<{ iso_short_code: string; local_name: string }>>([]);
  const [successColour, setSuccessColour] = useState(DEFAULT_SUCCESS_COLOUR);
  const [failureColour, setFailureColour] = useState(DEFAULT_FAILURE_COLOUR);
  const baseSettingsRef = useRef<GuildSettings | null>(null);

  useEffect(() => {
    const loadSettings = async () => {
      try {
        const res = await apiClient.guilds.getSettings(guildId);
        const data = res.data;
        baseSettingsRef.current = data;

        setLanguage(data.language || null);
        setLocales(data.locales || []);

        if (data.colours) {
          if (data.colours["0"]) setSuccessColour(data.colours["0"]);
          if (data.colours["1"]) setFailureColour(data.colours["1"]);
        }
      } catch {
        toast.error("Failed to load settings");
      } finally {
        setIsLoading(false);
      }
    };

    loadSettings();
  }, [guildId]);

  const save = useCallback(async () => {
    try {
      const merged = {
        ...baseSettingsRef.current,
        language: language ?? undefined,
        colours: {
          ...baseSettingsRef.current?.colours,
          "0": successColour,
          "1": failureColour,
        },
      };

      await apiClient.guilds.updateSettings(guildId, merged);
      toast.success("Settings saved");
    } catch {
      toast.error("Failed to save settings");
      throw new Error("Failed to save settings");
    }
  }, [guildId, language, successColour, failureColour]);

  useImperativeHandle(ref, () => ({ save }), [save]);

  const languageOptions = useMemo(
    () =>
      locales.map((l) => ({
        key: l.iso_short_code,
        label: l.local_name,
      })),
    [locales],
  );

  if (isLoading) {
    return <SettingsSkeleton />;
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Select
          label="Language"
          value={language}
          options={languageOptions}
          onChange={setLanguage}
          placeholder="Select a language..."
          showNoneOption
          noneOptionLabel="English (Default)"
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <ColourSelect label="Success colour" value={successColour} onChange={setSuccessColour} />
        <ColourSelect label="Failure colour" value={failureColour} onChange={setFailureColour} />
      </div>
    </div>
  );
});

SettingsStep.displayName = "SettingsStep";

export default SettingsStep;
