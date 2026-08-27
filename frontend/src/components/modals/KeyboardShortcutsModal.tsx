import { useId } from "react";
import DismissibleModal from "@/components/modal-primitives/DismissibleModal";
import type { Shortcut } from "@/hooks/useGlobalShortcuts";

interface Props {
  open: boolean;
  onClose: () => void;
  shortcuts: Shortcut[];
}

export default function KeyboardShortcutsModal({ open, onClose, shortcuts }: Props) {
  const headingId = useId();

  const sections = new Map<string, Shortcut[]>();
  for (const shortcut of shortcuts) {
    const group = sections.get(shortcut.section) ?? [];
    group.push(shortcut);
    sections.set(shortcut.section, group);
  }

  return (
    <DismissibleModal isOpen={open} onClose={onClose} ariaLabelledBy={headingId}>
      <h2 id={headingId} className="text-lg font-semibold text-white mb-4">
        Keyboard Shortcuts
      </h2>
      <div className="space-y-6">
        {Array.from(sections.entries()).map(([section, items]) => (
          <div key={section}>
            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
              {section}
            </h3>
            <dl className="space-y-2">
              {items.map((shortcut) => (
                <div key={shortcut.keys} className="flex items-center justify-between py-1.5">
                  <dt className="text-sm text-gray-300">{shortcut.label}</dt>
                  <dd className="flex items-center gap-1 m-0">
                    {shortcut.keys.split(" ").map((key, i) => (
                      <span key={i}>
                        {i > 0 && <span className="text-gray-400 text-xs mx-0.5">then</span>}
                        <kbd className="px-2 py-1 bg-gray-700 border border-gray-600 rounded text-xs text-gray-300 font-mono min-w-6 text-center inline-block">
                          {key}
                        </kbd>
                      </span>
                    ))}
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        ))}
      </div>
    </DismissibleModal>
  );
}
