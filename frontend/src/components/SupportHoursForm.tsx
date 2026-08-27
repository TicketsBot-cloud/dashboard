import { type FC, useCallback, useEffect, useMemo, useState } from "react";
import timezones from "timezones-list";
import type { SupportHoursData } from "@/types";
import Button from "@/components/Button";
import Select from "@/components/Select";
import ColourSelect from "@/components/ColourSelect";
import TextInput from "@/components/TextInput";
import Textarea from "@/components/Textarea";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faBriefcase, faCopy, faTimes } from "@fortawesome/free-solid-svg-icons";

const DAYS_OF_WEEK = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

const timezoneOptions = [
  { label: "UTC (+00:00)", key: "UTC" },
  ...timezones.map((tz) => ({ label: tz.label, key: tz.tzCode })),
];

function formatTime(timeString: string): string {
  if (!timeString) return "09:00";
  if (/^\d{2}:\d{2}$/.test(timeString)) return timeString;
  if (/^\d{2}:\d{2}:\d{2}$/.test(timeString)) return timeString.substring(0, 5);
  return "09:00";
}

function colourIntToHex(colour: number): string {
  return `#${colour.toString(16).padStart(6, "0")}`;
}

function hexToColourInt(hex: string): number {
  return parseInt(hex.replace("#", ""), 16);
}

interface HoursState {
  day_of_week: number;
  enabled: boolean;
  start_time: string;
  end_time: string;
}

interface SupportHoursFormProps {
  value: SupportHoursData | null;
  onChange: (data: SupportHoursData | null) => void;
}

const SupportHoursForm: FC<SupportHoursFormProps> = ({ value, onChange }) => {
  const [timezone, setTimezone] = useState("Europe/London");
  const [hours, setHours] = useState<HoursState[]>(() =>
    DAYS_OF_WEEK.map((_, index) => ({
      day_of_week: index,
      enabled: false,
      start_time: "09:00",
      end_time: "17:00",
    })),
  );
  const [outOfHoursBehaviour, setOutOfHoursBehaviour] = useState<
    "block_creation" | "allow_with_warning"
  >("block_creation");
  const [outOfHoursTitle, setOutOfHoursTitle] = useState("");
  const [outOfHoursMessage, setOutOfHoursMessage] = useState("");
  const [outOfHoursColour, setOutOfHoursColour] = useState("#FC3F35");
  const [currentTimeDisplay, setCurrentTimeDisplay] = useState("");

  // Load initial data from value prop
  useEffect(() => {
    if (!value) return;
    if (value.timezone) setTimezone(value.timezone);
    if (value.out_of_hours_behaviour) setOutOfHoursBehaviour(value.out_of_hours_behaviour);
    if (value.out_of_hours_title) setOutOfHoursTitle(value.out_of_hours_title);
    if (value.out_of_hours_message) setOutOfHoursMessage(value.out_of_hours_message);
    if (value.out_of_hours_colour) setOutOfHoursColour(colourIntToHex(value.out_of_hours_colour));

    if (value.hours && value.hours.length > 0) {
      setHours((prev) => {
        const updated = [...prev];
        for (const item of value.hours) {
          if (item.day_of_week >= 0 && item.day_of_week < 7) {
            updated[item.day_of_week] = {
              day_of_week: item.day_of_week,
              enabled: item.enabled,
              start_time: formatTime(item.start_time),
              end_time: formatTime(item.end_time),
            };
          }
        }
        return updated;
      });
    }
    // Only run on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const hasAnyEnabled = useMemo(() => hours.some((h) => h.enabled), [hours]);

  // Update current time display
  useEffect(() => {
    const updateTime = () => {
      try {
        const formatter = new Intl.DateTimeFormat("en-GB", {
          timeZone: timezone,
          hour: "2-digit",
          minute: "2-digit",
          hour12: false,
          weekday: "long",
        });
        const parts = formatter.formatToParts(new Date());
        const weekday = parts.find((p) => p.type === "weekday")?.value || "";
        const hour = parts.find((p) => p.type === "hour")?.value || "00";
        const minute = parts.find((p) => p.type === "minute")?.value || "00";
        const tzInfo = timezoneOptions.find((t) => t.key === timezone);
        const utcOffset = tzInfo ? tzInfo.label.match(/\(([^)]+)\)/)?.[1] || "" : "";
        setCurrentTimeDisplay(
          `It is currently ${hour}:${minute} on ${weekday} in ${timezone}${utcOffset ? ` (${utcOffset})` : ""}`,
        );
      } catch {
        setCurrentTimeDisplay(`Timezone: ${timezone}`);
      }
    };
    updateTime();
    const interval = setInterval(updateTime, 30000);
    return () => clearInterval(interval);
  }, [timezone]);

  const emitChange = useCallback(
    (
      newHours: HoursState[],
      newTimezone: string,
      newBehaviour: "block_creation" | "allow_with_warning",
      newTitle: string,
      newMessage: string,
      newColour: string,
    ) => {
      const enabledHours = newHours.filter((h) => h.enabled);
      if (enabledHours.length === 0) {
        onChange(null);
        return;
      }
      onChange({
        timezone: newTimezone,
        hours: enabledHours.map((h) => ({
          day_of_week: h.day_of_week,
          start_time: `${h.start_time}:00`,
          end_time: `${h.end_time}:00`,
          enabled: true,
        })),
        out_of_hours_behaviour: newBehaviour,
        out_of_hours_title: newTitle,
        out_of_hours_message: newMessage,
        out_of_hours_colour: hexToColourInt(newColour),
      });
    },
    [onChange],
  );

  const handleTimezoneChange = (tz: string | null) => {
    if (!tz) return;
    setTimezone(tz);
    emitChange(
      hours,
      tz,
      outOfHoursBehaviour,
      outOfHoursTitle,
      outOfHoursMessage,
      outOfHoursColour,
    );
  };

  const handleDayToggle = (index: number) => {
    const updated = [...hours];
    updated[index] = { ...updated[index], enabled: !updated[index].enabled };
    if (updated[index].enabled) {
      updated[index].start_time = "09:00";
      updated[index].end_time = "17:00";
    }
    setHours(updated);
    emitChange(
      updated,
      timezone,
      outOfHoursBehaviour,
      outOfHoursTitle,
      outOfHoursMessage,
      outOfHoursColour,
    );
  };

  const handleTimeChange = (index: number, field: "start_time" | "end_time", value: string) => {
    const updated = [...hours];
    updated[index] = { ...updated[index], [field]: value };

    // Validate: if start >= end, adjust end
    if (field === "start_time" && updated[index].start_time >= updated[index].end_time) {
      const [startHour, startMin] = updated[index].start_time.split(":").map(Number);
      let endHour = startHour + 1;
      if (endHour >= 24) endHour = 23;
      updated[index].end_time =
        `${String(endHour).padStart(2, "0")}:${String(startMin).padStart(2, "0")}`;
    }

    setHours(updated);
    emitChange(
      updated,
      timezone,
      outOfHoursBehaviour,
      outOfHoursTitle,
      outOfHoursMessage,
      outOfHoursColour,
    );
  };

  const handleBehaviourChange = (val: string | null) => {
    if (!val) return;
    const behaviour = val as "block_creation" | "allow_with_warning";
    setOutOfHoursBehaviour(behaviour);
    emitChange(hours, timezone, behaviour, outOfHoursTitle, outOfHoursMessage, outOfHoursColour);
  };

  const handleTitleChange = (val: string) => {
    const clamped = val.slice(0, 100);
    setOutOfHoursTitle(clamped);
    emitChange(hours, timezone, outOfHoursBehaviour, clamped, outOfHoursMessage, outOfHoursColour);
  };

  const handleMessageChange = (val: string) => {
    const clamped = val.slice(0, 500);
    setOutOfHoursMessage(clamped);
    emitChange(hours, timezone, outOfHoursBehaviour, outOfHoursTitle, clamped, outOfHoursColour);
  };

  const handleColourChange = (val: string) => {
    setOutOfHoursColour(val);
    emitChange(hours, timezone, outOfHoursBehaviour, outOfHoursTitle, outOfHoursMessage, val);
  };

  const copyToWeekdays = () => {
    const monday = hours[1];
    if (!monday.enabled) return;
    const updated = [...hours];
    for (let i = 2; i <= 5; i++) {
      updated[i] = {
        day_of_week: i,
        enabled: true,
        start_time: monday.start_time,
        end_time: monday.end_time,
      };
    }
    setHours(updated);
    emitChange(
      updated,
      timezone,
      outOfHoursBehaviour,
      outOfHoursTitle,
      outOfHoursMessage,
      outOfHoursColour,
    );
  };

  const setBusinessHours = () => {
    const updated = hours.map((h, i) => ({
      ...h,
      enabled: i >= 1 && i <= 5,
      start_time: "09:00",
      end_time: "17:00",
    }));
    setHours(updated);
    emitChange(
      updated,
      timezone,
      outOfHoursBehaviour,
      outOfHoursTitle,
      outOfHoursMessage,
      outOfHoursColour,
    );
  };

  const clearAll = () => {
    const updated = DAYS_OF_WEEK.map((_, index) => ({
      day_of_week: index,
      enabled: false,
      start_time: "09:00",
      end_time: "17:00",
    }));
    setHours(updated);
    emitChange(
      updated,
      timezone,
      outOfHoursBehaviour,
      outOfHoursTitle,
      outOfHoursMessage,
      outOfHoursColour,
    );
  };

  return (
    <div className="flex flex-col gap-4">
      <Select
        label="Timezone"
        value={timezone}
        options={timezoneOptions}
        onChange={handleTimezoneChange}
      />

      {/* Info notices */}
      <div className="flex flex-wrap gap-3">
        <div className="flex items-center gap-2 px-3 py-2 bg-white/5 rounded-md text-sm text-gray-300">
          <span className="text-blue-400">&#127760;</span>
          <span>{currentTimeDisplay}</span>
        </div>
        {!hasAnyEnabled ? (
          <div className="flex items-center gap-2 px-3 py-2 bg-white/5 rounded-md text-sm text-gray-300">
            <span className="text-green-400">&#10003;</span>
            <span>Panel is available 24/7 (no restrictions)</span>
          </div>
        ) : (
          <div className="flex items-center gap-2 px-3 py-2 bg-white/5 rounded-md text-sm text-gray-300">
            <span className="text-amber-400">&#9432;</span>
            <span>Panel availability is restricted to configured hours</span>
          </div>
        )}
      </div>

      {/* Days grid */}
      <div className="flex flex-col gap-0.5 bg-black/20 rounded-lg p-0.5">
        {DAYS_OF_WEEK.map((day, index) => (
          <div
            key={day}
            className={`flex items-center justify-between px-4 py-3 rounded-md ${
              hours[index].enabled ? "bg-[#2d3142]" : "bg-[#2a2a2a]"
            } hover:brightness-110 transition-all`}
          >
            <button
              type="button"
              className="flex flex-row items-center gap-3 cursor-pointer select-none"
              onClick={() => handleDayToggle(index)}
              title={hours[index].enabled ? `Disable ${day}` : `Enable ${day}`}
            >
              <div
                className={`w-5 h-5 shrink-0 rounded border flex items-center justify-center transition-colors ${hours[index].enabled ? "bg-blue-600 border-blue-600" : "bg-gray-700 border-neutral-600"}`}
              >
                {hours[index].enabled && (
                  <svg
                    className="w-3 h-3 text-white"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={3}
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                )}
              </div>
              <span className="font-medium text-sm uppercase tracking-wide text-white/90">
                {day}
              </span>
            </button>

            <div className="flex items-center">
              {hours[index].enabled ? (
                <div className="flex items-center gap-3">
                  <input
                    type="time"
                    value={hours[index].start_time}
                    onChange={(e) => handleTimeChange(index, "start_time", e.target.value)}
                    className="px-2.5 py-1.5 border border-white/10 rounded bg-black/30 text-white/90 text-sm font-mono focus:outline-none focus:border-green-500"
                    aria-label={`Start time for ${day}`}
                  />
                  <span className="text-white/40 text-xs">to</span>
                  <input
                    type="time"
                    value={hours[index].end_time}
                    onChange={(e) => handleTimeChange(index, "end_time", e.target.value)}
                    className="px-2.5 py-1.5 border border-white/10 rounded bg-black/30 text-white/90 text-sm font-mono focus:outline-none focus:border-green-500"
                    aria-label={`End time for ${day}`}
                  />
                </div>
              ) : hasAnyEnabled ? (
                <span className="px-3.5 py-1.5 rounded text-xs font-medium uppercase tracking-wide bg-red-500/15 text-red-400">
                  Closed
                </span>
              ) : (
                <span className="px-3.5 py-1.5 rounded text-xs font-medium uppercase tracking-wide bg-sky-400/15 text-sky-400">
                  24/7
                </span>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Out-of-hours settings */}
      {hasAnyEnabled && (
        <div className="flex flex-col gap-3 p-4 bg-black/20 rounded-lg">
          <Select
            label="Out-of-hours behaviour"
            value={outOfHoursBehaviour}
            options={[
              { label: "Block ticket creation", key: "block_creation" },
              { label: "Allow with warning", key: "allow_with_warning" },
            ]}
            onChange={handleBehaviourChange}
          />
          <p className="text-xs text-white/50">
            {outOfHoursBehaviour === "block_creation"
              ? "Users will not be able to open tickets outside of support hours."
              : "Users can still open tickets outside of support hours, but will see a warning message."}
          </p>

          <ColourSelect
            label="Embed Colour"
            value={outOfHoursColour}
            onChange={handleColourChange}
          />

          <TextInput
            label="Custom out-of-hours title"
            placeholder="This panel is currently closed"
            value={outOfHoursTitle}
            onChange={handleTitleChange}
          />

          <div className="flex flex-col">
            <Textarea
              label="Custom out-of-hours message"
              value={outOfHoursMessage}
              onChange={handleMessageChange}
              max={500}
            />
          </div>
        </div>
      )}

      {/* Quick action buttons */}
      <div className="flex flex-wrap gap-2 pt-2 border-t border-white/10">
        <Button
          variant="outline"
          onClick={copyToWeekdays}
          disabled={!hours[1].enabled}
          title="Copy Monday's hours to Tuesday through Friday"
          className="gap-2 text-sm font-medium"
        >
          <FontAwesomeIcon icon={faCopy} className="text-xs" />
          Copy to weekdays
        </Button>
        <Button
          variant="outline"
          onClick={setBusinessHours}
          title="Set standard business hours (Mon-Fri 09:00-17:00)"
          className="gap-2 text-sm font-medium"
        >
          <FontAwesomeIcon icon={faBriefcase} className="text-xs" />
          Business hours
        </Button>
        <Button
          variant="outline"
          onClick={clearAll}
          title={hasAnyEnabled ? "Remove all restrictions (return to 24/7)" : "Clear settings"}
          className="gap-2 text-sm font-medium text-red-400 hover:text-red-300"
        >
          <FontAwesomeIcon icon={faTimes} className="text-xs" />
          {hasAnyEnabled ? "Set 24/7" : "Clear all"}
        </Button>
      </div>
    </div>
  );
};

export default SupportHoursForm;
