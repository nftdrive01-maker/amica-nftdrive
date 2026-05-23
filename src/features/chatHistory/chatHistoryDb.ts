import Dexie, { Table } from "dexie";
import { ChatHistoryEntry } from "./chatHistoryModel";

export class ChatHistoryDexie extends Dexie {
  history!: Table<ChatHistoryEntry>;

  constructor() {
    super("AmicaChatHistoryDatabase");
    this.version(1).stores({
      history: "historyId, domainId, createdAt, createdAtDayKey, [domainId+createdAt]",
    });
  }
}

export const chatHistoryDb = new ChatHistoryDexie();