import type { FC } from "react";
import { useState, useMemo } from "react";
import Button from "@/components/Button";

interface AuditLogDiffProps {
  oldData?: string | null;
  newData?: string | null;
}

function safeParse(data: string | null | undefined): Record<string, unknown> {
  if (!data) return {};
  try {
    const parsed = JSON.parse(data);
    if (parsed === null || parsed === undefined) return {};
    if (Array.isArray(parsed)) return { items: parsed };
    if (typeof parsed !== "object") return { value: parsed };
    return parsed as Record<string, unknown>;
  } catch {
    return {};
  }
}

function formatValue(val: unknown): string {
  if (val === null || val === undefined) return "null";
  if (typeof val === "object") return JSON.stringify(val, null, 2);
  return String(val);
}

type ChangeType = "added" | "removed" | "changed" | "unchanged";

function getChangeType(
  key: string,
  oldObj: Record<string, unknown>,
  newObj: Record<string, unknown>,
): ChangeType {
  const inOld = key in oldObj;
  const inNew = key in newObj;

  if (inOld && !inNew) return "removed";
  if (!inOld && inNew) return "added";

  const oldVal = JSON.stringify(oldObj[key]);
  const newVal = JSON.stringify(newObj[key]);
  if (oldVal !== newVal) return "changed";

  return "unchanged";
}

const AuditLogDiff: FC<AuditLogDiffProps> = ({ oldData, newData }) => {
  const [showStructuralChanges, setShowStructuralChanges] = useState(false);

  const oldObj = useMemo(() => safeParse(oldData), [oldData]);
  const newObj = useMemo(() => safeParse(newData), [newData]);

  const hasBoth = Object.keys(oldObj).length > 0 && Object.keys(newObj).length > 0;
  const allKeys = useMemo(
    () => [...new Set([...Object.keys(oldObj), ...Object.keys(newObj)])].sort(),
    [oldObj, newObj],
  );

  const visibleKeys = useMemo(
    () =>
      hasBoth
        ? allKeys.filter((k) => getChangeType(k, oldObj, newObj) === "changed")
        : allKeys.filter((k) => getChangeType(k, oldObj, newObj) !== "unchanged"),
    [allKeys, hasBoth, oldObj, newObj],
  );

  const onlyOldKeys = useMemo(
    () => (hasBoth ? allKeys.filter((k) => k in oldObj && !(k in newObj)) : []),
    [allKeys, hasBoth, oldObj, newObj],
  );

  const onlyNewKeys = useMemo(
    () => (hasBoth ? allKeys.filter((k) => !(k in oldObj) && k in newObj) : []),
    [allKeys, hasBoth, oldObj, newObj],
  );

  const hasUniqueKeys = onlyOldKeys.length > 0 || onlyNewKeys.length > 0;

  if (allKeys.length === 0) {
    return <div className="text-gray-400 italic px-2">No data available</div>;
  }

  const rowBg = (type: ChangeType) => {
    switch (type) {
      case "removed":
        return "bg-red-500/10";
      case "added":
        return "bg-green-500/10";
      case "changed":
        return "bg-blue-500/10";
      default:
        return "";
    }
  };

  return (
    <div className="font-mono text-[13px] leading-relaxed overflow-x-auto text-left">
      {visibleKeys.map((key) => {
        const changeType = getChangeType(key, oldObj, newObj);
        return (
          <div
            key={key}
            className={`flex items-start gap-2 px-2 py-1 rounded mb-0.5 flex-col md:flex-row ${rowBg(changeType)}`}
          >
            <span className="font-semibold text-white min-w-30 w-full md:w-auto md:mb-0 mb-2">
              {key}
            </span>
            {changeType === "removed" && (
              <span className="text-red-400 break-all whitespace-pre-wrap">
                {formatValue(oldObj[key])}
              </span>
            )}
            {changeType === "added" && (
              <span className="text-green-500 break-all whitespace-pre-wrap">
                {formatValue(newObj[key])}
              </span>
            )}
            {changeType === "changed" && (
              <>
                {/* Desktop: inline layout */}
                <div className="hidden md:contents">
                  <span className="text-red-400 break-all whitespace-pre-wrap">
                    {formatValue(oldObj[key])}
                  </span>
                  <span className="text-gray-400 shrink-0">-&gt;</span>
                  <span className="text-green-500 break-all whitespace-pre-wrap">
                    {formatValue(newObj[key])}
                  </span>
                </div>
                {/* Mobile: side-by-side grid */}
                <div className="grid grid-cols-2 gap-2 w-full md:hidden">
                  <div className="flex flex-col gap-1 min-w-0">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-red-400">
                      Before
                    </span>
                    <span className="text-red-400 wrap-break-word whitespace-pre-wrap text-xs">
                      {formatValue(oldObj[key])}
                    </span>
                  </div>
                  <div className="flex flex-col gap-1 min-w-0">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-green-500">
                      After
                    </span>
                    <span className="text-green-500 wrap-break-word whitespace-pre-wrap text-xs">
                      {formatValue(newObj[key])}
                    </span>
                  </div>
                </div>
              </>
            )}
          </div>
        );
      })}

      {visibleKeys.length === 0 && (
        <div className="text-gray-400 italic px-2">No changes detected</div>
      )}

      {hasBoth && hasUniqueKeys && (
        <>
          <Button
            variant="outline"
            size="sm"
            className="mt-1.5 mb-1"
            title={showStructuralChanges ? "Hide structural changes" : "Show structural changes"}
            onClick={() => setShowStructuralChanges(!showStructuralChanges)}
          >
            {showStructuralChanges ? "Hide" : "Show"} structural changes (
            {onlyOldKeys.length + onlyNewKeys.length} fields)
          </Button>
          {showStructuralChanges && (
            <>
              {onlyOldKeys.map((key) => (
                <div
                  key={key}
                  className={`flex items-start gap-2 px-2 py-1 rounded mb-0.5 flex-row ${rowBg("removed")}`}
                >
                  <span className="font-semibold text-white min-w-20 md:min-w-30">{key}</span>
                  <span className="text-red-400 break-all whitespace-pre-wrap">
                    {formatValue(oldObj[key])}
                  </span>
                </div>
              ))}
              {onlyNewKeys.map((key) => (
                <div
                  key={key}
                  className={`flex items-start gap-2 px-2 py-1 rounded mb-0.5 flex-row ${rowBg("added")}`}
                >
                  <span className="font-semibold text-white min-w-20 md:min-w-30">{key}</span>
                  <span className="text-green-500 break-all whitespace-pre-wrap">
                    {formatValue(newObj[key])}
                  </span>
                </div>
              ))}
            </>
          )}
        </>
      )}
    </div>
  );
};

export default AuditLogDiff;
