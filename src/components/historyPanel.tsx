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
        <div className="pointer-events-auto mb-28 mr-0 flex h-[88%] w-[min(92vw,700px)] flex-col overflow-hidden rounded-l-[28px] border border-white/18 border-r-0 bg-slate-900/22 shadow-[0_22px_64px_rgba(15,23,42,0.2)] backdrop-blur-2xl transition-all duration-300 sm:w-[min(94vw,700px)] lg:mb-12 lg:w-[34vw] lg:rounded-none lg:rounded-l-[22px] xl:w-[32vw] translate-x-0 opacity-100">
          <div className="flex items-start justify-between border-b border-white/12 bg-white/[0.08] px-5 py-4 text-white backdrop-blur-xl">
            <div className="min-w-0">
              <div className="text-[11px] font-bold uppercase tracking-[0.22em] text-white/55">
                History Search
              </div>
              <div className="mt-1 truncate text-base font-semibold text-white/92">
                履歴検索
              </div>
            </div>
            <button
              type="button"
              className="ml-4 inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/18 bg-white/[0.1] text-lg font-medium text-white/72 backdrop-blur-md transition hover:bg-white/[0.16] hover:text-white"
              onClick={onClose}
              aria-label="Close history panel"
            >
              ×
            </button>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto bg-[linear-gradient(180deg,rgba(255,255,255,0.06)_0%,rgba(15,23,42,0.08)_100%)] px-4 py-4 text-white backdrop-blur-xl lg:px-5">
            <div className="space-y-4">
              <div className="rounded-2xl border border-white/12 bg-white/[0.06] p-4 backdrop-blur-md">
                <div className="grid gap-3">
                  <label className="grid gap-1 text-sm text-white/86">
                    <span className="text-xs font-bold uppercase tracking-[0.18em] text-white/55">Domain</span>
                    <select
                      value={selectedDomainId}
                      onChange={(event) => setSelectedDomainId(event.target.value)}
                      className="rounded-xl border border-white/12 bg-slate-950/35 px-3 py-2 text-sm text-white outline-none"
                    >
                      <option value="">すべてのドメイン</option>
                      {domainIds.map((domainId) => (
                        <option key={domainId} value={domainId}>{domainId}</option>
                      ))}
                    </select>
                  </label>

                  <div className="grid grid-cols-2 gap-3">
                    <label className="grid gap-1 text-sm text-white/86">
                      <span className="text-xs font-bold uppercase tracking-[0.18em] text-white/55">From</span>
                      <input
                        type="date"
                        value={fromDate}
                        onChange={(event) => setFromDate(event.target.value)}
                        className="rounded-xl border border-white/12 bg-slate-950/35 px-3 py-2 text-sm text-white outline-none"
                      />
                    </label>
                    <label className="grid gap-1 text-sm text-white/86">
                      <span className="text-xs font-bold uppercase tracking-[0.18em] text-white/55">To</span>
                      <input
                        type="date"
                        value={toDate}
                        onChange={(event) => setToDate(event.target.value)}
                        className="rounded-xl border border-white/12 bg-slate-950/35 px-3 py-2 text-sm text-white outline-none"
                      />
                    </label>
                  </div>

                  <label className="grid gap-1 text-sm text-white/86">
                    <span className="text-xs font-bold uppercase tracking-[0.18em] text-white/55">Query</span>
                    <input
                      type="text"
                      value={query}
                      onChange={(event) => setQuery(event.target.value)}
                      placeholder="本文やツール名で検索"
                      className="rounded-xl border border-white/12 bg-slate-950/35 px-3 py-2 text-sm text-white outline-none placeholder:text-white/35"
                    />
                  </label>
                </div>

                <div className="mt-4 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={handleSearch}
                    className="rounded-full bg-white/[0.14] px-4 py-2 text-sm font-semibold text-white ring-1 ring-white/15 transition hover:bg-white/[0.2]"
                  >
                    検索する
                  </button>
                  <button
                    type="button"
                    onClick={handleDeleteDomain}
                    disabled={!selectedDomainId}
                    className="rounded-full bg-rose-400/16 px-4 py-2 text-sm font-semibold text-rose-100 ring-1 ring-rose-300/20 transition hover:bg-rose-400/22 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    ドメイン履歴を削除
                  </button>
                  <button
                    type="button"
                    onClick={handleDeleteAll}
                    className="rounded-full bg-rose-500/22 px-4 py-2 text-sm font-semibold text-white ring-1 ring-rose-300/20 transition hover:bg-rose-500/28"
                  >
                    全履歴を削除
                  </button>
                </div>
              </div>

              {errorMessage && (
                <div className="rounded-2xl border border-rose-300/20 bg-rose-400/10 px-4 py-3 text-sm text-rose-100">
                  {errorMessage}
                </div>
              )}

              {!searched && (
                <div className="rounded-2xl border border-white/10 bg-white/[0.05] px-4 py-5 text-sm text-white/70">
                  条件を指定して検索すると履歴を表示します。
                </div>
              )}

              {searched && (
                <div className="rounded-2xl border border-white/10 bg-white/[0.05] p-4 backdrop-blur-md">
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 pb-3">
                    <div className="text-sm text-white/75">検索結果 {loading ? "..." : `${totalCount} 件`}</div>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        disabled={!hasResults}
                        onClick={() => chatHistoryStore.downloadJson(results, `${downloadFileBase}.json`)}
                        className="rounded-full bg-white/[0.12] px-3 py-1.5 text-xs font-semibold text-white ring-1 ring-white/15 transition hover:bg-white/[0.18] disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        JSON出力
                      </button>
                      <button
                        type="button"
                        disabled={!hasResults}
                        onClick={() => chatHistoryStore.downloadCsv(results, `${downloadFileBase}.csv`)}
                        className="rounded-full bg-white/[0.12] px-3 py-1.5 text-xs font-semibold text-white ring-1 ring-white/15 transition hover:bg-white/[0.18] disabled:cursor-not-allowed disabled:opacity-40"
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
                      <div key={entry.historyId} className="rounded-2xl border border-white/10 bg-slate-950/18 p-4 backdrop-blur-md">
                        <div className="flex flex-wrap items-center gap-2 text-xs text-white/55">
                          <span className="rounded-full bg-white/[0.08] px-2 py-1 ring-1 ring-white/10">{entry.domainId}</span>
                          <span className="rounded-full bg-white/[0.08] px-2 py-1 ring-1 ring-white/10">{entry.role}</span>
                          <span>{formatDateTime(entry.createdAt)}</span>
                          {entry.mcpInfo?.used && (
                            <span className="rounded-full bg-emerald-400/12 px-2 py-1 text-emerald-200 ring-1 ring-emerald-300/20">
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