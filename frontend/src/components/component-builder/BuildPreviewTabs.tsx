import { useId, useState, type FC, type ReactNode } from "react";

interface BuildPreviewTabsProps {
  build: ReactNode;
  preview: ReactNode;
  /** Extra class names for the tab-switch row, e.g. to span both columns of a parent grid. */
  className?: string;
}

/**
 * Two-tab Build/Preview switch shown only below `md`, where the builder and its live preview
 * can't sit side by side. Renders as three siblings (tabs, build pane, preview pane) rather than
 * a single wrapper, so a parent `grid-cols-1 md:grid-cols-2` still lays the build and preview
 * panes out side by side from `md` up - Classic mode's always-stacked mobile layout is untouched.
 */
const BuildPreviewTabs: FC<BuildPreviewTabsProps> = ({ build, preview, className = "" }) => {
  const [activeTab, setActiveTab] = useState<"build" | "preview">("build");
  const uid = useId();
  const buildTabId = `${uid}-build-tab`;
  const previewTabId = `${uid}-preview-tab`;
  const buildPanelId = `${uid}-build-panel`;
  const previewPanelId = `${uid}-preview-panel`;

  return (
    <>
      <div className={`md:hidden flex gap-2 ${className}`} role="tablist">
        <button
          id={buildTabId}
          type="button"
          role="tab"
          aria-selected={activeTab === "build"}
          aria-controls={buildPanelId}
          className={`px-3 py-1.5 rounded text-sm font-medium ${
            activeTab === "build" ? "bg-blue-600 text-white" : "bg-gray-700 text-gray-300"
          }`}
          onClick={() => setActiveTab("build")}
        >
          Build
        </button>
        <button
          id={previewTabId}
          type="button"
          role="tab"
          aria-selected={activeTab === "preview"}
          aria-controls={previewPanelId}
          className={`px-3 py-1.5 rounded text-sm font-medium ${
            activeTab === "preview" ? "bg-blue-600 text-white" : "bg-gray-700 text-gray-300"
          }`}
          onClick={() => setActiveTab("preview")}
        >
          Preview
        </button>
      </div>
      <div
        id={buildPanelId}
        role="tabpanel"
        aria-labelledby={buildTabId}
        className={activeTab === "build" ? "block" : "hidden md:block"}
      >
        {build}
      </div>
      <div
        id={previewPanelId}
        role="tabpanel"
        aria-labelledby={previewTabId}
        className={activeTab === "preview" ? "block" : "hidden md:block"}
      >
        {preview}
      </div>
    </>
  );
};

export default BuildPreviewTabs;
