import { saveAs } from "file-saver";
import { Message } from "@/features/chat/messages";
import { chatHistoryDb } from "./chatHistoryDb";
import {
  ChatHistoryEntry,
  ChatHistorySearchParams,
  ChatHistorySearchResult,
} from "./chatHistoryModel";

function normalizeQuery(value?: string): string {
  return String(value || "").trim().toLowerCase();
}

function escapeCsvValue(value: unknown): string {
  if (value === null || value === undefined) {
    return "";
  }

  const text = String(value);
  if (/[",\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }

  return text;
}

export function buildCreatedAtDayKey(timestamp: number): string {
  const date = new Date(timestamp);
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function mapMessagesToHistoryEntries(messages: Message[], sessionId?: string, userId?: string): ChatHistoryEntry[] {
  return messages
    .filter((message) => Boolean(message.historyId && message.domainId && typeof message.createdAt === "number"))
    .map((message) => ({
      historyId: message.historyId!,
      domainId: message.domainId!,
      userId,
      role: message.role,
      content: message.content,
      createdAt: message.createdAt!,
      createdAtDayKey: buildCreatedAtDayKey(message.createdAt!),
      sessionId,
      dbResult: message.dbResult,
      mcpInfo: message.mcpInfo,
    } satisfies ChatHistoryEntry));
}

export class ChatHistoryStore {
  public async upsertMessages(messages: Message[], sessionId?: string, userId?: string): Promise<void> {
    const entries = mapMessagesToHistoryEntries(messages, sessionId, userId);
    await this.upsertEntries(entries);
  }

  public async upsertEntries(entries: ChatHistoryEntry[]): Promise<void> {
    if (entries.length === 0) {
      return;
    }

    await chatHistoryDb.history.bulkPut(entries);
  }

  public async listDomainIds(): Promise<string[]> {
    const domainIds = await chatHistoryDb.history.orderBy("domainId").uniqueKeys();
    return domainIds.map((value) => String(value));
  }

  public async search(params: ChatHistorySearchParams): Promise<ChatHistorySearchResult> {
    const limit = Math.max(1, Math.min(params.limit ?? 200, 1000));
    const query = normalizeQuery(params.query);
    const fromTimestamp = params.fromTimestamp ?? Number.MIN_SAFE_INTEGER;
    const toTimestamp = params.toTimestamp ?? Number.MAX_SAFE_INTEGER;
    const hasDomain = Boolean(params.domainId);

    let items: ChatHistoryEntry[];

    if (hasDomain) {
      items = await chatHistoryDb.history
        .where("[domainId+createdAt]")
        .between([params.domainId!, fromTimestamp], [params.domainId!, toTimestamp], true, true)
        .reverse()
        .toArray();
    } else {
      items = await chatHistoryDb.history
        .where("createdAt")
        .between(fromTimestamp, toTimestamp, true, true)
        .reverse()
        .toArray();
    }

    if (query) {
      items = items.filter((entry) => {
        return [entry.content, entry.domainId, entry.role, entry.mcpInfo?.toolName, entry.dbResult?.title, entry.dbResult?.summary]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(query));
      });
    }

    return {
      items: items.slice(0, limit),
      totalCount: items.length,
    };
  }

  public async deleteByDomainId(domainId: string): Promise<void> {
    await chatHistoryDb.history.where("domainId").equals(domainId).delete();
  }

  public async clearAll(): Promise<void> {
    await chatHistoryDb.history.clear();
  }

  public downloadJson(entries: ChatHistoryEntry[], fileName = "chat_history.json") {
    const blob = new Blob([JSON.stringify(entries, null, 2)], { type: "application/json" });
    saveAs(blob, fileName);
  }

  public downloadCsv(entries: ChatHistoryEntry[], fileName = "chat_history.csv") {
    const header = ["historyId", "domainId", "createdAt", "role", "content", "sessionId", "mcpToolName", "dbTitle"];
    const rows = entries.map((entry) => [
      entry.historyId,
      entry.domainId,
      new Date(entry.createdAt).toISOString(),
      entry.role,
      entry.content,
      entry.sessionId || "",
      entry.mcpInfo?.toolName || "",
      entry.dbResult?.title || "",
    ]);
    const csv = [header, ...rows].map((row) => row.map(escapeCsvValue).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    saveAs(blob, fileName);
  }
}

export const chatHistoryStore = new ChatHistoryStore();