'use client';

import { useEffect, useMemo, useState } from "react";
import { ChatHistoryEntry } from "@/features/chatHistory/chatHistoryModel";
import { chatHistoryStore } from "@/features/chatHistory/chatHistoryStore";
import { DbResultPanel } from "./dbResultPanel";

function toDateRange(input?: string, endOfDay = false): number | undefined {
  if (!input) {
    return undefined;
  }

  const date = new Date(`${input}T${endOfDay ? "23:59:59.999" : "00:00:00.000"}`);
  const timestamp = date.getTime();
  return Number.isNaN(timestamp) ? undefined : timestamp;
}

function formatDateTime(timestamp: number): string {
  return new Date(timestamp).toLocaleString("ja-JP", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function HistoryPanel({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const [domainIds, setDomainIds] = useState<string[]>([]);
  const [selectedDomainId, setSelectedDomainId] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ChatHistoryEntry[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [searched, setSearched] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    if (!open) {
      return;
    }

    let active = true;
    chatHistoryStore.listDomainIds().then((items) => {
      if (!active) {
        return;
      }
      setDomainIds(items);
    }).catch((error: unknown) => {
      if (!active) {
        return;
      }
      setErrorMessage(String(error));
    });

    return () => {
      active = false;
    };
  }, [open]);

  const hasResults = results.length > 0;
  const downloadFileBase = useMemo(() => {
    const domainLabel = selectedDomainId || "all-domains";
    return `chat-history-${domainLabel}`;
  }, [selectedDomainId]);

  async function handleSearch() {
    setLoading(true);
    setErrorMessage("");
    setSearched(true);

    try {
      const searchResult = await chatHistoryStore.search({
        domainId: selectedDomainId || undefined,
        fromTimestamp: toDateRange(fromDate, false),
        toTimestamp: toDateRange(toDate, true),
        query,
        limit: 300,
      });
      setResults(searchResult.items);
      setTotalCount(searchResult.totalCount);
    } catch (error: unknown) {
      setResults([]);
      setTotalCount(0);
      setErrorMessage(String(error));
    } finally {
      setLoading(false);
    }
  }

  async function handleDeleteDomain() {
    if (!selectedDomainId) {
      return;
    }

    const confirmed = window.confirm(`ドメイン「${selectedDomainId}」の履歴をすべて削除します。`);
    if (!confirmed) {
      return;
    }

    await chatHistoryStore.deleteByDomainId(selectedDomainId);
    setResults([]);
    setTotalCount(0);
    setSearched(false);
    setDomainIds(await chatHistoryStore.listDomainIds());
  }

  async function handleDeleteAll() {
    const confirmed = window.confirm("全履歴を削除します。元に戻せません。");
    if (!confirmed) {
      return;
    }

    await chatHistoryStore.clearAll();
    setResults([]);
    setTotalCount(0);
    setSearched(false);
    setDomainIds([]);
  }

  if (!open) {
    return null;
  }

  return (
    <>
      <button
        type="button"
        className="fixed inset-0 z-30 bg-slate-900/30 backdrop-blur-[1px] lg:hidden"
        onClick={onClose}
        aria-label="Close history panel backdrop"
      />
      <div className="pointer-events-none fixed inset-y-0 right-0 z-40 flex items-end justify-end sm:items-stretch">
        <div className="pointer-events-auto mb-28 mr-0 flex h-[88%] w-[min(92vw,700px)] flex-col overflow-hidden rounded-lg border border-slate-700/60 bg-slate-900/80 shadow-lg backdrop-blur-md transition-all duration-300 sm:w-[min(94vw,700px)] lg:mb-12 lg:w-[34vw] xl:w-[32vw] translate-x-0 opacity-100">
          <div className="flex items-start justify-between border-b border-slate-700/60 bg-slate-800/70 px-3 py-2 text-slate-200">
            <div className="min-w-0">
              <div className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">
                History Search
              </div>
              <div className="mt-1 truncate text-sm font-semibold text-white/95">
                履歴検索
              </div>
            </div>
            <button
              type="button"
              className="ml-4 inline-flex h-7 w-7 items-center justify-center rounded text-current/90 transition hover:bg-black/10 hover:text-white"
              onClick={onClose}
              aria-label="Close history panel"
            >
              ×
            </button>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-3 py-2 text-white lg:px-3">
            <div className="space-y-4">
              <div className="space-y-3 rounded-md border border-slate-700/50 bg-slate-950/25 px-3 py-3">
                <div className="grid gap-3">
                  <label className="grid gap-1 text-sm text-white/86">
                    <span className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">Domain</span>
                    <select
                      value={selectedDomainId}
                      onChange={(event) => setSelectedDomainId(event.target.value)}
                      className="rounded border border-slate-700/60 bg-slate-900/80 px-3 py-2 text-sm text-white outline-none"
                    >
                      <option value="">すべてのドメイン</option>
                      {domainIds.map((domainId) => (
                        <option key={domainId} value={domainId}>{domainId}</option>
                      ))}
                    </select>
                  </label>

                  <div className="grid grid-cols-2 gap-3">
                    <label className="grid gap-1 text-sm text-white/86">
                      <span className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">From</span>
                      <input
                        type="date"
                        value={fromDate}
                        onChange={(event) => setFromDate(event.target.value)}
                        className="rounded border border-slate-700/60 bg-slate-900/80 px-3 py-2 text-sm text-white outline-none"
                      />
                    </label>
                    <label className="grid gap-1 text-sm text-white/86">
                      <span className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">To</span>
                      <input
                        type="date"
                        value={toDate}
                        onChange={(event) => setToDate(event.target.value)}
                        className="rounded border border-slate-700/60 bg-slate-900/80 px-3 py-2 text-sm text-white outline-none"
                      />
                    </label>
                  </div>

                  <label className="grid gap-1 text-sm text-white/86">
                    <span className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">Query</span>
                    <input
                      type="text"
                      value={query}
                      onChange={(event) => setQuery(event.target.value)}
                      placeholder="本文やツール名で検索"
                      className="rounded border border-slate-700/60 bg-slate-900/80 px-3 py-2 text-sm text-white outline-none placeholder:text-slate-500"
                    />
                  </label>
                </div>

                <div className="mt-4 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={handleSearch}
                    className="rounded px-3 py-1.5 text-sm font-semibold text-slate-100 bg-slate-700/70 hover:bg-slate-700"
                  >
                    検索する
                  </button>
                  <button
                    type="button"
                    onClick={handleDeleteDomain}
                    disabled={!selectedDomainId}
                    className="rounded px-3 py-1.5 text-sm font-semibold text-rose-100 bg-rose-500/20 hover:bg-rose-500/30 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    ドメイン履歴を削除
                  </button>
                  <button
                    type="button"
                    onClick={handleDeleteAll}
                    className="rounded px-3 py-1.5 text-sm font-semibold text-white bg-rose-600/30 hover:bg-rose-600/40"
                  >
                    全履歴を削除
                  </button>
                </div>
              </div>

              {errorMessage && (
                <div className="rounded-md border border-rose-500/30 bg-rose-500/10 px-3 py-3 text-sm text-rose-100">
                  {errorMessage}
                </div>
              )}

              {!searched && (
                <div className="rounded-md border border-slate-700/50 bg-slate-950/25 px-3 py-4 text-sm text-white/70">
                  条件を指定して検索すると履歴を表示します。
                </div>
              )}

              {searched && (
                <div className="rounded-md border border-slate-700/50 bg-slate-950/25 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-700/50 pb-3">
                    <div className="text-sm text-white/75">検索結果 {loading ? "..." : `${totalCount} 件`}</div>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        disabled={!hasResults}
                        onClick={() => chatHistoryStore.downloadJson(results, `${downloadFileBase}.json`)}
                        className="rounded px-2.5 py-1 text-xs font-semibold text-slate-100 bg-slate-700/70 hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        JSON出力
                      </button>
                      <button
                        type="button"
                        disabled={!hasResults}
                        onClick={() => chatHistoryStore.downloadCsv(results, `${downloadFileBase}.csv`)}
                        className="rounded px-2.5 py-1 text-xs font-semibold text-slate-100 bg-slate-700/70 hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        CSV出力
                      </button>
                    </div>
                  </div>

                  <div className="mt-4 space-y-3">
                    {!loading && results.length === 0 && (
                      <div className="text-sm text-white/65">一致する履歴はありません。</div>
                    )}

                    {results.map((entry) => (
                      <div key={entry.historyId} className="rounded-md border border-slate-700/50 bg-slate-950/35 p-3">
                        <div className="flex flex-wrap items-center gap-2 text-xs text-white/55">
                          <span className="inline-block rounded px-1.5 py-0.5 text-[11px] font-medium leading-tight bg-slate-700/70 text-slate-100">{entry.domainId}</span>
                          <span className="inline-block rounded px-1.5 py-0.5 text-[11px] font-medium leading-tight bg-slate-700/70 text-slate-100">{entry.role}</span>
                          <span>{formatDateTime(entry.createdAt)}</span>
                          {entry.mcpInfo?.used && (
                            <span className="inline-block rounded px-1.5 py-0.5 text-[11px] font-medium leading-tight bg-emerald-500/20 text-emerald-200">
                              +MCP{entry.mcpInfo.toolName ? ` ${entry.mcpInfo.toolName}` : ""}
                            </span>
                          )}
                        </div>
                        <div className="mt-3 whitespace-pre-wrap break-words text-sm leading-6 text-white/92">
                          {entry.content}
                        </div>
                        {entry.dbResult && (
                          <div className="mt-4">
                            <DbResultPanel dbResult={entry.dbResult} embedded />
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}