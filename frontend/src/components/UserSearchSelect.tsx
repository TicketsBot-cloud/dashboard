import { type FC, useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useFloatingDropdown } from "@/hooks/useFloatingDropdown";

export interface UserOption {
  id: string;
  username: string;
  global_name?: string | null;
}

interface ResultItem extends UserOption {
  _rawId?: boolean;
}

interface UserSearchSelectProps {
  value: UserOption | null;
  onChange: (user: UserOption | null) => void;
  loadOptions: (query: string) => Promise<UserOption[]>;
  label?: string;
  placeholder?: string;
  allowRawId?: boolean;
}

const SNOWFLAKE_RE = /^\d{17,19}$/;

const UserSearchSelect: FC<UserSearchSelectProps> = ({
  value,
  onChange,
  loadOptions,
  label,
  placeholder = "Search for a user...",
  allowRawId = false,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ResultItem[]>([]);
  const [loading, setLoading] = useState(false);

  const triggerRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const requestIdRef = useRef(0);

  const closeDropdown = useCallback(() => {
    requestIdRef.current += 1;
    setIsOpen(false);
    setQuery("");
    setLoading(false);
  }, []);

  const { position: dropdownPosition } = useFloatingDropdown({
    isOpen,
    triggerRef,
    dropdownRef,
    onClose: closeDropdown,
    maxHeight: 240,
    minWidth: 0,
    matchTriggerWidth: true,
  });

  useEffect(() => {
    if (isOpen && searchInputRef.current) {
      searchInputRef.current.focus();
    }
  }, [isOpen]);

  // Debounced search
  useEffect(() => {
    if (!isOpen) return;

    if (debounceRef.current) clearTimeout(debounceRef.current);

    const requestId = ++requestIdRef.current;
    let cancelled = false;

    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        const users = await loadOptions(query);
        if (cancelled || requestId !== requestIdRef.current) return;
        const items: ResultItem[] = [...users];

        // Prepend a raw-ID option when the query looks like a Discord snowflake
        if (
          allowRawId &&
          SNOWFLAKE_RE.test(query.trim()) &&
          !users.some((u) => u.id === query.trim())
        ) {
          items.unshift({ id: query.trim(), username: query.trim(), _rawId: true });
        }

        setResults(items);
      } catch {
        if (cancelled || requestId !== requestIdRef.current) return;
        setResults([]);
      } finally {
        if (!cancelled && requestId === requestIdRef.current) setLoading(false);
      }
    }, 300);

    return () => {
      cancelled = true;
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, isOpen, loadOptions, allowRawId]);

  const open = () => {
    setIsOpen(true);
    setQuery("");
    setResults([]);
  };

  const select = (user: ResultItem) => {
    const userOption: UserOption = {
      id: user.id,
      username: user.username,
      global_name: user.global_name,
    };
    onChange(userOption);
    setIsOpen(false);
    setQuery("");
  };

  const clear = (e: React.MouseEvent) => {
    e.stopPropagation();
    onChange(null);
  };

  const displayLabel = (user: UserOption) =>
    user.global_name && user.global_name !== "" ? user.global_name : user.username;

  return (
    <div className="flex flex-col relative">
      {label && <label className="mb-1 text-white">{label}</label>}

      <button
        ref={triggerRef}
        type="button"
        className="inline-flex items-center bg-gray-700 border border-neutral-600 rounded overflow-hidden px-1 cursor-pointer w-full text-left"
        onClick={open}
        aria-expanded={isOpen}
        aria-haspopup="listbox"
        title={label || "Search users"}
      >
        <div className="w-full p-2 min-h-10 flex items-center gap-2">
          {value ? (
            <span className="text-white">{displayLabel(value)}</span>
          ) : (
            <span className="text-gray-400">{placeholder}</span>
          )}
        </div>

        <div className="px-2 flex items-center gap-1">
          {value && (
            <span
              className="text-gray-400 hover:text-white text-xs px-1"
              onClick={clear}
              onKeyDown={(e) => e.key === "Enter" && clear(e as unknown as React.MouseEvent)}
              role="button"
              tabIndex={0}
              aria-label="Clear selection"
            >
              ✕
            </span>
          )}
          <svg
            className={`w-4 h-4 text-gray-400 transition-transform ${isOpen ? "rotate-180" : ""}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </button>

      {isOpen &&
        createPortal(
          <div
            ref={dropdownRef}
            className="fixed bg-gray-700 border border-neutral-600 rounded shadow-lg z-popover flex flex-col overflow-hidden"
            style={{
              top: dropdownPosition.top,
              left: dropdownPosition.left,
              width: dropdownPosition.width,
              maxHeight: dropdownPosition.maxHeight,
            }}
            role="listbox"
          >
            <div className="sticky top-0 bg-gray-700 border-b border-gray-600 p-2">
              <input
                ref={searchInputRef}
                type="text"
                aria-label="Search users"
                title="Search users"
                className="w-full bg-gray-800 text-white px-2 py-1 rounded border border-gray-600 focus:outline-none focus:border-blue-500"
                placeholder={
                  allowRawId ? "Search by name or paste a User ID..." : "Type to search..."
                }
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onClick={(e) => e.stopPropagation()}
                onKeyDown={(e) => {
                  if (e.key === "Escape") {
                    setIsOpen(false);
                    setQuery("");
                  }
                  e.stopPropagation();
                }}
              />
            </div>

            <div className="overflow-y-auto">
              {loading ? (
                <div className="text-gray-400 text-center py-4 text-sm">Searching...</div>
              ) : results.length > 0 ? (
                results.map((user) => (
                  <button
                    key={user._rawId ? `raw-${user.id}` : user.id}
                    type="button"
                    role="option"
                    aria-selected={value?.id === user.id}
                    className={`flex items-center px-3 py-2 cursor-pointer hover:bg-gray-600 w-full text-left ${
                      value?.id === user.id ? "bg-gray-600" : ""
                    }`}
                    onClick={() => select(user)}
                  >
                    <div
                      className={`w-4 h-4 border border-gray-400 rounded-full mr-3 flex-shrink-0 flex items-center justify-center ${
                        value?.id === user.id ? "bg-blue-600 border-blue-600" : ""
                      }`}
                    >
                      {value?.id === user.id && <div className="w-2 h-2 bg-white rounded-full" />}
                    </div>
                    {user._rawId ? (
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-xs font-medium bg-gray-600 text-gray-300 px-1.5 py-0.5 rounded flex-shrink-0">
                          ID
                        </span>
                        <span className="text-white text-sm truncate">{user.id}</span>
                      </div>
                    ) : (
                      <div className="flex flex-col min-w-0">
                        <span className="text-white text-sm truncate">{displayLabel(user)}</span>
                        <span className="text-gray-400 text-xs">{user.id}</span>
                      </div>
                    )}
                  </button>
                ))
              ) : (
                <div className="text-gray-400 text-center py-4 text-sm">
                  {query.length === 0 ? "Type to search for users" : "No users found"}
                </div>
              )}
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
};

export default UserSearchSelect;
