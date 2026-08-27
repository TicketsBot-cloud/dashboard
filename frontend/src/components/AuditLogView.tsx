import { useEffect, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faFilter, faHistory, faChevronDown, faChevronUp } from "@fortawesome/free-solid-svg-icons";

import AuditLogDiff from "@/components/AuditLogDiff";
import ColumnSelectorButton from "@/components/ColumnSelectorButton";
import EmptyState from "@/components/EmptyState";
import Pagination from "@/components/Pagination";
import Select from "@/components/Select";
import Table from "@/components/Table";
import TableSkeleton from "@/components/skeletons/TableSkeleton";
import TextInput from "@/components/TextInput";
import {
  formatActionType,
  formatResourceType,
  actionTypeOptions,
  resourceTypeOptions,
  hasJsonContent,
} from "@/lib/auditlog";
import type { AuditLogQuery } from "@/hooks/useAuditLogQuery";
import type { AuditLogEntry } from "@/types";

const ALL_AUDIT_COLUMNS = [
  { key: "timestamp", label: "Timestamp" },
  { key: "user", label: "User" },
  { key: "action", label: "Action" },
  { key: "resource", label: "Resource" },
];

const DEFAULT_AUDIT_COLUMNS = ["timestamp", "user", "action", "resource"];

function formatTimestamp(ts: string) {
  return new Date(ts).toLocaleString();
}

function safeParseMetadata(metadata: string): string {
  try {
    return JSON.stringify(JSON.parse(metadata), null, 2);
  } catch {
    return metadata;
  }
}

interface AuditLogViewProps {
  query: AuditLogQuery;
  columns: string[];
  onColumnsChange: (columns: string[]) => void;
}

export default function AuditLogView({ query, columns, onColumnsChange }: AuditLogViewProps) {
  const { filters, setFilter, entries, page, totalPages, totalCount, loading, initialLoading } =
    query;

  const [expandedRow, setExpandedRow] = useState<number | null>(null);
  const [showColumnSelector, setShowColumnSelector] = useState(false);

  const selectedColumns = columns.length > 0 ? columns : DEFAULT_AUDIT_COLUMNS;
  const actionOptions = [{ key: "0", label: "All Actions" }, ...actionTypeOptions];
  const resourceOptions = [{ key: "0", label: "All Resources" }, ...resourceTypeOptions];

  useEffect(() => {
    setExpandedRow(null);
  }, [entries]);

  const toggleColumn = (key: string) => {
    if (selectedColumns.includes(key)) {
      if (selectedColumns.length <= 1) return;
      onColumnsChange(selectedColumns.filter((k) => k !== key));
    } else {
      onColumnsChange([...selectedColumns, key]);
    }
  };

  const toggleRow = (id: number) => setExpandedRow((prev) => (prev === id ? null : id));

  if (initialLoading) {
    return <TableSkeleton rows={6} columns={5} />;
  }

  return (
    <>
      <div className="bg-gray-800 rounded-xl p-4 mb-4">
        <h3 className="text-white text-lg font-semibold mb-4">
          <FontAwesomeIcon icon={faFilter} className="mr-2" />
          Filter Audit Logs
        </h3>

        <div className="flex flex-col gap-2">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="flex-1">
              <TextInput
                label="User ID"
                placeholder="User ID"
                value={filters.userId}
                onChange={(v) => setFilter("userId", v)}
              />
            </div>
            <div className="flex-1">
              <Select
                label="Action Type"
                value={filters.actionType}
                options={actionOptions}
                onChange={(v) => setFilter("actionType", v ?? "0")}
              />
            </div>
            <div className="flex-1">
              <Select
                label="Resource Type"
                value={filters.resourceType}
                options={resourceOptions}
                onChange={(v) => setFilter("resourceType", v ?? "0")}
              />
            </div>
          </div>
          <div className="flex flex-col md:flex-row gap-4">
            <div className="flex-1">
              <TextInput
                label="Date From"
                type="date"
                value={filters.dateFrom}
                onChange={(v) => setFilter("dateFrom", v)}
              />
            </div>
            <div className="flex-1">
              <TextInput
                label="Date To"
                type="date"
                value={filters.dateTo}
                onChange={(v) => setFilter("dateTo", v)}
              />
            </div>
            <div className="flex-1" /> {/* Spacer to align with 3-column row above */}
          </div>
        </div>
      </div>

      <div className="bg-gray-800 rounded-xl p-4">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-white text-lg font-semibold">
            <FontAwesomeIcon icon={faHistory} className="mr-2" />
            Audit Logs ({totalCount} entries)
          </h3>
          <ColumnSelectorButton
            columns={ALL_AUDIT_COLUMNS}
            selectedColumns={selectedColumns}
            onToggleColumn={toggleColumn}
            isOpen={showColumnSelector}
            onToggle={() => setShowColumnSelector(!showColumnSelector)}
            onClose={() => setShowColumnSelector(false)}
          />
        </div>

        <div className="hidden md:block">
          <Table variant="compact">
            <Table.Head>
              <Table.Row>
                {ALL_AUDIT_COLUMNS.filter((column) => selectedColumns.includes(column.key)).map(
                  (column) => (
                    <Table.HeaderCell key={column.key} className="p-2.5 font-normal text-gray-300">
                      {column.label}
                    </Table.HeaderCell>
                  ),
                )}
              </Table.Row>
            </Table.Head>
            <Table.Body>
              {entries.map((entry) => (
                <TableRow
                  key={entry.id}
                  entry={entry}
                  expanded={expandedRow === entry.id}
                  onToggle={() => toggleRow(entry.id)}
                  visibleColumns={selectedColumns}
                />
              ))}
            </Table.Body>
          </Table>
        </div>

        <div className="flex flex-col gap-3 md:hidden">
          {entries.map((entry) => (
            <MobileCard
              key={entry.id}
              entry={entry}
              expanded={expandedRow === entry.id}
              onToggle={() => toggleRow(entry.id)}
            />
          ))}
        </div>

        {entries.length === 0 && (
          <EmptyState
            icon={faHistory}
            title="No audit log entries"
            description="No entries match the current filters. Try adjusting the date range or filter criteria."
          />
        )}

        <Pagination
          variant="full"
          page={page}
          totalPages={totalPages}
          onChange={query.goToPage}
          disabled={loading}
          className={entries.length === 0 ? "mt-4" : ""}
        />
      </div>
    </>
  );
}

function TableRow({
  entry,
  expanded,
  onToggle,
  visibleColumns,
}: {
  entry: AuditLogEntry;
  expanded: boolean;
  onToggle: () => void;
  visibleColumns: string[];
}) {
  const hasDiff = hasJsonContent(entry.old_data) || hasJsonContent(entry.new_data);
  const expandable = hasDiff || hasJsonContent(entry.metadata);
  return (
    <>
      <Table.Row
        className={`border-b border-gray-600 transition-colors ${expandable ? "cursor-pointer hover:bg-blue-500/5" : ""}`}
        onClick={expandable ? onToggle : undefined}
      >
        {visibleColumns.includes("timestamp") && (
          <Table.Cell className="p-2.5 text-gray-300">
            {formatTimestamp(entry.created_at)}
          </Table.Cell>
        )}
        {visibleColumns.includes("user") && (
          <Table.Cell className="p-2.5 text-white font-medium">{entry.username}</Table.Cell>
        )}
        {visibleColumns.includes("action") && (
          <Table.Cell className="p-2.5">
            <span className="inline-block px-2 py-0.5 rounded bg-blue-500/15 text-blue-400 text-[13px] font-medium whitespace-nowrap">
              {formatActionType(entry.action_type)}
            </span>
          </Table.Cell>
        )}
        {visibleColumns.includes("resource") && (
          <Table.Cell className="p-2.5 text-gray-300">
            {formatResourceType(entry.resource_type)}
          </Table.Cell>
        )}
        <Table.Cell className="p-2.5 w-10 text-center text-gray-400">
          {expandable && <FontAwesomeIcon icon={expanded ? faChevronUp : faChevronDown} />}
        </Table.Cell>
      </Table.Row>
      {expanded && expandable && (
        <Table.Row className="bg-black/5">
          <Table.Cell colSpan={visibleColumns.length + 1} className="p-4">
            <div className="flex flex-col gap-3">
              {hasDiff && <AuditLogDiff oldData={entry.old_data} newData={entry.new_data} />}
              {entry.metadata && (
                <div className="border-t border-gray-600 pt-2">
                  <span className="font-semibold text-[13px] text-gray-400">Metadata:</span>
                  <pre className="font-mono text-xs mt-1 p-2 bg-gray-900/50 rounded overflow-x-auto text-gray-300">
                    {safeParseMetadata(entry.metadata)}
                  </pre>
                </div>
              )}
            </div>
          </Table.Cell>
        </Table.Row>
      )}
    </>
  );
}

function MobileCard({
  entry,
  expanded,
  onToggle,
}: {
  entry: AuditLogEntry;
  expanded: boolean;
  onToggle: () => void;
}) {
  const hasDiff = hasJsonContent(entry.old_data) || hasJsonContent(entry.new_data);
  const expandable = hasDiff || hasJsonContent(entry.metadata);
  return (
    <button
      type="button"
      disabled={!expandable}
      className={`bg-gray-700/50 border border-gray-600 rounded-lg p-3 transition-colors w-full text-left ${expandable ? "cursor-pointer hover:bg-blue-500/5" : ""}`}
      onClick={expandable ? onToggle : undefined}
    >
      <div className="flex items-center justify-between mb-1">
        <span className="font-semibold text-sm text-white">{entry.username}</span>
        {expandable && (
          <FontAwesomeIcon
            icon={expanded ? faChevronUp : faChevronDown}
            className="text-gray-400 text-sm shrink-0"
          />
        )}
      </div>
      <span className="text-xs text-gray-400 block mb-2">{formatTimestamp(entry.created_at)}</span>
      <div className="flex items-center gap-2 text-[13px]">
        <span className="inline-block px-2 py-0.5 rounded bg-blue-500/15 text-blue-400 font-medium shrink-0">
          {formatActionType(entry.action_type)}
        </span>
        <span className="text-gray-300">{formatResourceType(entry.resource_type)}</span>
      </div>
      {expanded && expandable && (
        <div className="mt-3 pt-3 border-t border-gray-600">
          {hasDiff && <AuditLogDiff oldData={entry.old_data} newData={entry.new_data} />}
          {entry.metadata && (
            <div className="border-t border-gray-600 pt-2 mt-3">
              <span className="font-semibold text-[13px] text-gray-400">Metadata:</span>
              <pre className="font-mono text-xs mt-1 p-2 bg-gray-900/50 rounded overflow-x-auto text-gray-300">
                {safeParseMetadata(entry.metadata)}
              </pre>
            </div>
          )}
        </div>
      )}
    </button>
  );
}
