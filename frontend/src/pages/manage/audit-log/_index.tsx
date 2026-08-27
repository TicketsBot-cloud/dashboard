import { useCallback } from "react";
import { useParams } from "react-router";

import AuditLogView from "@/components/AuditLogView";
import { MainLayout } from "@/pages/layout/Main";
import { useAuditLogQuery } from "@/hooks/useAuditLogQuery";
import { apiClient } from "@/lib/api";
import { usePreferencesStore } from "@/stores/preferences";

export default function AuditLogPage() {
  const { guildId } = useParams<{ guildId: string }>();
  const { auditLog, setAuditLogPrefs } = usePreferencesStore();

  const fetcher = useCallback(
    (body: Record<string, unknown>) => apiClient.auditLog.list(guildId!, body),
    [guildId],
  );

  const query = useAuditLogQuery(fetcher, guildId);

  return (
    <MainLayout title="Audit Log">
      <AuditLogView
        query={query}
        columns={auditLog.columns}
        onColumnsChange={(columns) => setAuditLogPrefs({ columns })}
      />
    </MainLayout>
  );
}
