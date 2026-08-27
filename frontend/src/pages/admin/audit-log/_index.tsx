import AuditLogView from "@/components/AuditLogView";
import { useAuditLogQuery } from "@/hooks/useAuditLogQuery";
import { apiClient } from "@/lib/api";
import { usePreferencesStore } from "@/stores/preferences";

const fetchStaffAuditLogs = (body: Record<string, unknown>) => apiClient.admin.auditLog.list(body);

export default function AdminAuditLogPage() {
  const { adminAuditLog, setAdminAuditLogPrefs } = usePreferencesStore();
  const query = useAuditLogQuery(fetchStaffAuditLogs);

  return (
    <div>
      <header className="mb-6 sm:mb-8">
        <h1 className="text-2xl sm:text-3xl font-semibold mb-2 text-center">Audit Log</h1>
        <p className="text-center text-gray-400 text-sm sm:text-base">
          Actions taken by bot staff across the platform
        </p>
      </header>

      <AuditLogView
        query={query}
        columns={adminAuditLog.columns}
        onColumnsChange={(columns) => setAdminAuditLogPrefs({ columns })}
      />
    </div>
  );
}
