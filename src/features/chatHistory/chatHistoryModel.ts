import { ChatDbResult, ChatMcpInfo, Role } from "@/features/chat/messages";

export type ChatHistoryEntry = {
  historyId: string;
  domainId: string;
  userId?: string;
  role: Role;
  content: string;
  createdAt: number;
  createdAtDayKey: string;
  sessionId?: string;
  dbResult?: ChatDbResult;
  mcpInfo?: ChatMcpInfo;
};

export type ChatHistorySearchParams = {
  domainId?: string;
  fromTimestamp?: number;
  toTimestamp?: number;
  query?: string;
  limit?: number;
};

export type ChatHistorySearchResult = {
  items: ChatHistoryEntry[];
  totalCount: number;
};