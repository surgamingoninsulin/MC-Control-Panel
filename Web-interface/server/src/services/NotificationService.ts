import type { NotificationPreference, NotificationRecord } from "../platformTypes.js";
import { PlatformDataService } from "./PlatformDataService.js";

const nowIso = (): string => new Date().toISOString();

export class NotificationService {
  constructor(private readonly platform: PlatformDataService) {}

  list(userId?: string): NotificationRecord[] {
    return this.platform
      .read()
      .notifications
      .filter((entry) => !userId || !entry.userId || entry.userId === userId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  create(input: Omit<NotificationRecord, "id" | "createdAt" | "readAt">): NotificationRecord {
    return this.platform.update((state) => {
      const created: NotificationRecord = {
        id: `ntf-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        createdAt: nowIso(),
        readAt: null,
        ...input
      };
      state.notifications.unshift(created);
      state.notifications = state.notifications.slice(0, 500);
      return created;
    });
  }

  markRead(id: string, userId?: string): NotificationRecord {
    return this.platform.update((state) => {
      const found = state.notifications.find((entry) => entry.id === id && (!userId || !entry.userId || entry.userId === userId));
      if (!found) throw new Error("Notification not found.");
      found.readAt = found.readAt || nowIso();
      return { ...found };
    });
  }

  getPreference(userId: string): NotificationPreference {
    const found = this.platform.read().notificationPreferences.find((entry) => entry.userId === userId);
    return found || { userId, inApp: true, email: false, webhook: false };
  }

  updatePreference(userId: string, patch: Partial<Omit<NotificationPreference, "userId">>): NotificationPreference {
    return this.platform.update((state) => {
      let found = state.notificationPreferences.find((entry) => entry.userId === userId);
      if (!found) {
        found = { userId, inApp: true, email: false, webhook: false };
        state.notificationPreferences.push(found);
      }
      if (typeof patch.inApp === "boolean") found.inApp = patch.inApp;
      if (typeof patch.email === "boolean") found.email = patch.email;
      if (typeof patch.webhook === "boolean") found.webhook = patch.webhook;
      return { ...found };
    });
  }
}
