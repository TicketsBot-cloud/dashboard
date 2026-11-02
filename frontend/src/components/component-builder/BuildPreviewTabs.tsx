import {
  useEffect,
  useId,
  useRef,
  useState,
  useSyncExternalStore,
  type FC,
  type ReactNode,
} from "react";
import { flushSync } from "react-dom";
import Tabs from "@/components/Tabs";
import { FIELD_REVEAL_EVENT } from "@/lib/scroll-to-missing";

interface BuildPreviewTabsProps {
  build: ReactNode;
  preview: ReactNode;
  className?: string;
  labelSuffix?: string;
}

const NARROW_QUERY = "(width < 48rem)";
const subscribeNarrow = (onChange: () => void) => {
  const query = window.matchMedia(NARROW_QUERY);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
};
const isNarrow = () => window.matchMedia(NARROW_QUERY).matches;

/** Renders three siblings so a parent `md:grid-cols-2` lays the panes out together from `md` up. */
const BuildPreviewTabs: FC<BuildPreviewTabsProps> = ({
  build,
  preview,
  className = "",
  labelSuffix,
}) => {
  const [activeTab, setActiveTab] = useState<"build" | "preview">("build");
  const uid = useId();
  const buildKey = `${uid}-build`;
  const previewKey = `${uid}-preview`;
  const buildPanelRef = useRef<HTMLDivElement>(null);
  const narrow = useSyncExternalStore(subscribeNarrow, isNarrow);

  // A hidden Build pane can't take focus, so it is shown synchronously before the caller focuses a field.
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
        ariaLabel={labelSuffix ? `Message editor view (${labelSuffix})` : "Message editor view"}
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
        role={narrow ? "tabpanel" : undefined}
        aria-labelledby={narrow ? `tab-${buildKey}` : undefined}
        className={activeTab === "build" ? "block" : "hidden md:block"}
      >
        {build}
      </div>
      <div
        id={`tabpanel-${previewKey}`}
        role={narrow ? "tabpanel" : undefined}
        aria-labelledby={narrow ? `tab-${previewKey}` : undefined}
        className={activeTab === "preview" ? "block" : "hidden md:block"}
      >
        {preview}
      </div>
    </>
  );
};

export default BuildPreviewTabs;
