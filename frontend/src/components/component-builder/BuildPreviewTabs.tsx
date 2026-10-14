import { useEffect, useId, useRef, useState, type FC, type ReactNode } from "react";
import { flushSync } from "react-dom";
import Tabs from "@/components/Tabs";
import { FIELD_REVEAL_EVENT } from "@/lib/scroll-to-missing";

interface BuildPreviewTabsProps {
  build: ReactNode;
  preview: ReactNode;
  /** Extra class names for the tab row, e.g. to span both columns of a parent grid. */
  className?: string;
}

/**
 * Build/Preview tabs shown below `md`, where the two panes cannot sit side by side. Renders three
 * siblings so a parent `md:grid-cols-2` lays the panes out together from `md` up.
 */
const BuildPreviewTabs: FC<BuildPreviewTabsProps> = ({ build, preview, className = "" }) => {
  const [activeTab, setActiveTab] = useState<"build" | "preview">("build");
  const uid = useId();
  const buildKey = `${uid}-build`;
  const previewKey = `${uid}-preview`;
  const buildPanelRef = useRef<HTMLDivElement>(null);

  // A failed save reveals the first problem field. Below md the Build pane is display:none while
  // Preview is active, so switch to it first or the field cannot take focus. flushSync because the
  // caller focuses the field on the next frame.
  useEffect(() => {
    const reveal = (e: Event) => {
      const target = (e as CustomEvent<HTMLElement>).detail;
      if (target && buildPanelRef.current?.contains(target)) {
        flushSync(() => setActiveTab("build"));
      }
    };
    window.addEventListener(FIELD_REVEAL_EVENT, reveal);
    return () => window.removeEventListener(FIELD_REVEAL_EVENT, reveal);
  }, []);

  return (
    <>
      <Tabs
        className={`md:hidden ${className}`}
        ariaLabel="Message editor view"
        tabs={[
          { key: buildKey, label: "Build" },
          { key: previewKey, label: "Preview" },
        ]}
        activeTab={activeTab === "build" ? buildKey : previewKey}
        onChange={(key) => setActiveTab(key === buildKey ? "build" : "preview")}
      />
      <div
        ref={buildPanelRef}
        id={`tabpanel-${buildKey}`}
        role="tabpanel"
        aria-labelledby={`tab-${buildKey}`}
        className={activeTab === "build" ? "block" : "hidden md:block"}
      >
        {build}
      </div>
      <div
        id={`tabpanel-${previewKey}`}
        role="tabpanel"
        aria-labelledby={`tab-${previewKey}`}
        className={activeTab === "preview" ? "block" : "hidden md:block"}
      >
        {preview}
      </div>
    </>
  );
};

export default BuildPreviewTabs;
