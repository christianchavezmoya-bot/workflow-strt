export interface AppNotification {
  id: string;
  eventType: string;
  severity: string;
  title: string;
  message: string;
  projectId: string | null;
  assetId: string | null;
  runId: string | null;
  entityType: string | null;
  entityId: string | null;
  triggeredByUserId: string | null;
  triggeredByName: string | null;
  createdAtUtc: string;
  readAtUtc: string | null;
  isRead: boolean;
}

export interface CreateNotificationInput {
  eventType: string;
  severity: string;
  title: string;
  message: string;
  recipientUserIds?: string[];
  recipientRoles?: string[];
  projectId?: string | null;
  assetId?: string | null;
  runId?: string | null;
  entityType?: string | null;
  entityId?: string | null;
  triggeredByUserId?: string | null;
  triggeredByName?: string | null;
}
