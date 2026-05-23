import { useState } from "react";
import { clsx } from "clsx";
import { ChatDbResult } from "@/features/chat/messages";

function escapeCsvValue(value: string | number | boolean | null | undefined): string {
  const raw = value == null ? "" : String(value);
  const escaped = raw.replace(/"/g, '""');
  return `"${escaped}"`;
}

function downloadCsv(dbResult: ChatDbResult): void {
  if (!Array.isArray(dbResult.previewColumns) || !Array.isArray(dbResult.previewRows) || dbResult.previewColumns.length === 0) {
    return;
  }

  const header = dbResult.previewColumns.map((column) => escapeCsvValue(column)).join(',');
  const rows = dbResult.previewRows.map((row) => (
    dbResult.previewColumns!.map((column) => escapeCsvValue(row[column])).join(',')
  ));
  const csv = ['\uFEFF' + header, ...rows].join('\r\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  const stamp = new Date().toISOString().slice(0, 19).replace(/[T:]/g, '-');

  anchor.href = url;
  anchor.download = `db-result-${stamp}.csv`;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}

function getVisibleRowCount(dbResult: ChatDbResult): number {
  return Array.isArray(dbResult.previewRows) ? dbResult.previewRows.length : 0;
}

function hasTabularResult(dbResult: ChatDbResult): boolean {
  return Boolean(
    Array.isArray(dbResult.previewRows) &&
    dbResult.previewRows.length > 0 &&
    Array.isArray(dbResult.previewColumns) &&
    dbResult.previewColumns.length > 0
  );
}

export const DbResultPanel = ({
  dbResult,
  defaultExpanded = false,
  className,
  embedded = false,
}: {
  dbResult: ChatDbResult;
  defaultExpanded?: boolean;
  className?: string;
  embedded?: boolean;
}) => {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const visibleRowCount = getVisibleRowCount(dbResult);
  const showTable = hasTabularResult(dbResult);

  return (
    <div className={clsx(
      embedded
        ? "rounded-none border-0 bg-transparent shadow-none"
        : "rounded-lg border border-emerald-300 bg-emerald-50 shadow-lg",
      className,
    )}>
      <div className={clsx(
        "flex items-start justify-between gap-3 px-4 py-3",
        embedded ? "border-b border-slate-200" : "border-b border-emerald-200",
      )}>
        <div className="min-w-0 flex-1">
          <div className={clsx(
            "mb-2 inline-flex items-center rounded-full bg-white px-2 py-0.5 text-xs font-bold",
            embedded
              ? "border border-slate-300 text-slate-700"
              : "border border-emerald-400 text-emerald-700",
          )}>
            {dbResult.title || "DB検索結果"}
          </div>
          {dbResult.summary && (
            <div className="mb-2 whitespace-pre-wrap break-words text-sm font-bold text-gray-700">
              {dbResult.summary}
            </div>
          )}
          <div className="flex flex-wrap items-center gap-2 text-xs text-gray-500">
            <span>{dbResult.sourceName || "dbhub"}{dbResult.toolName ? ` / ${dbResult.toolName}` : ""}</span>
            {typeof dbResult.totalCount === "number" && (
              <span className={clsx(
                "rounded-full bg-white px-2 py-0.5 font-bold",
                embedded ? "text-slate-700 ring-1 ring-slate-200" : "text-emerald-700",
              )}>
                合計 {dbResult.totalCount} 件
              </span>
            )}
            {visibleRowCount > 0 && (
              <span className={clsx(
                "rounded-full bg-white px-2 py-0.5 font-bold",
                embedded ? "text-slate-700 ring-1 ring-slate-200" : "text-emerald-700",
              )}>
                表示 {visibleRowCount} 件
              </span>
            )}
          </div>
          {(dbResult.queryText || dbResult.sortLabel) && (
            <div className="mt-3 flex flex-wrap gap-2 text-xs">
              {dbResult.queryText && (
                <div className={clsx(
                  "rounded-md bg-white px-2 py-1 text-gray-600",
                  embedded ? "border border-slate-200" : "border border-emerald-200",
                )}>
                  <span className={clsx(
                    "mr-1 font-bold",
                    embedded ? "text-slate-700" : "text-emerald-700",
                  )}>検索条件</span>
                  <span>{dbResult.queryText}</span>
                </div>
              )}
              {dbResult.sortLabel && (
                <div className={clsx(
                  "rounded-md bg-white px-2 py-1 text-gray-600",
                  embedded ? "border border-slate-200" : "border border-emerald-200",
                )}>
                  <span className={clsx(
                    "mr-1 font-bold",
                    embedded ? "text-slate-700" : "text-emerald-700",
                  )}>並び順</span>
                  <span>{dbResult.sortLabel}</span>
                </div>
              )}
            </div>
          )}
        </div>
        <div className="flex shrink-0 flex-col gap-2">
          {showTable && (
            <button
              type="button"
              className={clsx(
                "rounded-md bg-white px-3 py-1 text-xs font-bold",
                embedded
                  ? "border border-slate-300 text-slate-700 hover:bg-slate-100"
                  : "border border-emerald-300 text-emerald-700 hover:bg-emerald-100",
              )}
              onClick={() => setExpanded((value) => !value)}
            >
              {expanded ? "結果を閉じる" : "結果を開く"}
            </button>
          )}
          {showTable && (
            <button
              type="button"
              className={clsx(
                "rounded-md bg-white px-3 py-1 text-xs font-bold",
                embedded
                  ? "border border-slate-300 text-slate-700 hover:bg-slate-100"
                  : "border border-emerald-300 text-emerald-700 hover:bg-emerald-100",
              )}
              onClick={() => downloadCsv(dbResult)}
            >
              CSV出力
            </button>
          )}
        </div>
      </div>

      {expanded && showTable && (
        <div className="overflow-x-auto px-4 py-3">
          <div className={clsx(
            "max-h-[32rem] overflow-auto rounded bg-white",
            embedded ? "border border-slate-200" : "border border-emerald-200",
          )}>
            <table className="min-w-full text-left text-xs font-normal">
              <thead className={clsx(
                "sticky top-0",
                embedded ? "bg-slate-100 text-slate-800" : "bg-emerald-100 text-emerald-900",
              )}>
                <tr>
                  {dbResult.previewColumns!.map((column) => (
                    <th key={column} className="px-2 py-2 font-bold">
                      {column}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {dbResult.previewRows!.map((row, rowIndex) => (
                  <tr key={`db-result-row-${rowIndex}`} className={clsx(
                    "align-top",
                    embedded ? "border-t border-slate-100" : "border-t border-emerald-100",
                  )}>
                    {dbResult.previewColumns!.map((column) => (
                      <td key={`${rowIndex}-${column}`} className="max-w-56 px-2 py-1.5 whitespace-pre-wrap break-words text-gray-700">
                        {row[column] == null ? "-" : String(row[column])}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};