import { useEffect } from "react";
import { Command, useCommandState } from "cmdk";
import { useNavigate } from "react-router";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faClipboardList,
  faPlus,
  faRectangleList,
  faPeopleGroup,
} from "@fortawesome/free-solid-svg-icons";
import { useUIStore } from "@/stores/ui";
import { useGuildStore } from "@/stores/guild";
import { getGuildNavLinks, defaultNavLinks, flattenNavEntries } from "@/lib/navigation";

function SearchAnnouncer() {
  const count = useCommandState((state) => state.filtered.count);
  const search = useCommandState((state) => state.search);
  if (!search) return null;
  return (
    <div aria-live="polite" aria-atomic="true" className="sr-only">
      {count === 0 ? "No results found." : `${count} result${count !== 1 ? "s" : ""} available.`}
    </div>
  );
}

const groupHeadingClasses =
  "[&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:text-gray-400 [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wider";

const itemClasses =
  "flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-gray-300 cursor-pointer data-[selected=true]:bg-gray-700 data-[selected=true]:text-white";

export default function CommandPalette() {
  const open = useUIStore((s) => s.commandPaletteOpen);
  const setOpen = useUIStore((s) => s.setCommandPaletteOpen);
  const selectedGuild = useGuildStore((s) => s.selectedGuild);
  const navigate = useNavigate();

  const permissionLevel = selectedGuild?.permission_level ?? 0;

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setOpen(!open);
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open, setOpen]);

  const handleSelect = (path: string) => {
    setOpen(false);
    navigate(path);
  };

  const navItems = selectedGuild
    ? flattenNavEntries(getGuildNavLinks(selectedGuild.id), permissionLevel)
    : defaultNavLinks;

  const quickActions =
    selectedGuild && permissionLevel >= 2
      ? [
          {
            label: "Create Panel",
            to: `/manage/${selectedGuild.id}/panels/create`,
            icon: faRectangleList,
          },
          {
            label: "Create Form",
            to: `/manage/${selectedGuild.id}/forms/create`,
            icon: faClipboardList,
          },
          {
            label: "Create Team",
            to: `/manage/${selectedGuild.id}/teams`,
            icon: faPeopleGroup,
          },
        ]
      : [];

  return (
    <Command.Dialog
      open={open}
      onOpenChange={setOpen}
      label="Command palette"
      loop
      overlayClassName="fixed inset-0 bg-black/50 z-9999"
      contentClassName="fixed top-[20%] left-1/2 -translate-x-1/2 w-full max-w-lg z-9999"
    >
      <div className="bg-gray-800 border border-gray-700 rounded-xl shadow-2xl overflow-hidden">
        <Command.Input
          placeholder="Type a command or search..."
          className="w-full px-4 py-3 bg-transparent text-white text-sm placeholder-gray-400 border-b border-gray-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-inset"
        />
        <Command.List className="max-h-80 overflow-y-auto p-2">
          <Command.Empty className="px-4 py-8 text-center text-gray-400 text-sm">
            No results found.
          </Command.Empty>

          <Command.Group heading="Navigation" className={groupHeadingClasses}>
            {navItems.map((item) => (
              <Command.Item
                key={item.to}
                value={item.label}
                onSelect={() => handleSelect(item.to)}
                className={itemClasses}
              >
                <FontAwesomeIcon
                  icon={item.icon}
                  className="w-4 text-gray-400"
                  aria-hidden="true"
                />
                {item.label}
              </Command.Item>
            ))}
          </Command.Group>

          {quickActions.length > 0 && (
            <Command.Group heading="Quick Actions" className={groupHeadingClasses}>
              {quickActions.map((action) => (
                <Command.Item
                  key={action.to}
                  value={action.label}
                  onSelect={() => handleSelect(action.to)}
                  className={itemClasses}
                >
                  <span className="relative w-4 flex items-center justify-center">
                    <FontAwesomeIcon
                      icon={action.icon}
                      className="text-gray-400"
                      aria-hidden="true"
                    />
                    <FontAwesomeIcon
                      icon={faPlus}
                      className="absolute -top-1 -right-1 text-[8px] text-green-400"
                      aria-hidden="true"
                    />
                  </span>
                  {action.label}
                </Command.Item>
              ))}
            </Command.Group>
          )}
        </Command.List>

        <SearchAnnouncer />

        <div className="border-t border-gray-700 px-4 py-2 flex items-center gap-4 text-xs text-gray-400">
          <span>
            <kbd className="px-1.5 py-0.5 bg-gray-700 rounded text-gray-300 font-mono">↑↓</kbd>{" "}
            navigate
          </span>
          <span>
            <kbd className="px-1.5 py-0.5 bg-gray-700 rounded text-gray-300 font-mono">↵</kbd>{" "}
            select
          </span>
          <span>
            <kbd className="px-1.5 py-0.5 bg-gray-700 rounded text-gray-300 font-mono">esc</kbd>{" "}
            close
          </span>
        </div>
      </div>
    </Command.Dialog>
  );
}
