import { useRef, type FC, type KeyboardEvent } from "react";

interface Tab {
  key: string;
  label: string;
  count?: number;
}

interface TabsProps {
  tabs: Tab[];
  activeTab: string;
  onChange: (key: string) => void;
  ariaLabel?: string;
  className?: string;
}

const Tabs: FC<TabsProps> = ({ tabs, activeTab, onChange, ariaLabel, className = "" }) => {
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const handleKeyDown = (e: KeyboardEvent<HTMLButtonElement>, index: number) => {
    let nextIndex: number | null = null;
    if (e.key === "ArrowRight") nextIndex = (index + 1) % tabs.length;
    else if (e.key === "ArrowLeft") nextIndex = (index - 1 + tabs.length) % tabs.length;
    else if (e.key === "Home") nextIndex = 0;
    else if (e.key === "End") nextIndex = tabs.length - 1;

    if (nextIndex !== null) {
      e.preventDefault();
      tabRefs.current[nextIndex]?.focus();
      onChange(tabs[nextIndex].key);
    }
  };

  return (
    <div className={`flex gap-1.5 ${className}`} role="tablist" aria-label={ariaLabel}>
      {tabs.map((tab, index) => (
        <button
          key={tab.key}
          ref={(el) => {
            tabRefs.current[index] = el;
          }}
          id={`tab-${tab.key}`}
          type="button"
          role="tab"
          aria-selected={activeTab === tab.key}
          aria-controls={`tabpanel-${tab.key}`}
          tabIndex={activeTab === tab.key ? 0 : -1}
          onClick={() => onChange(tab.key)}
          onKeyDown={(e) => handleKeyDown(e, index)}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 ${
            activeTab === tab.key
              ? "bg-blue-600 text-white"
              : "bg-gray-800 text-gray-400 hover:bg-gray-700 hover:text-white"
          }`}
        >
          {tab.label}
          {tab.count !== undefined && (
            <span className="ml-1.5 text-xs opacity-75">({tab.count})</span>
          )}
        </button>
      ))}
    </div>
  );
};

export default Tabs;
