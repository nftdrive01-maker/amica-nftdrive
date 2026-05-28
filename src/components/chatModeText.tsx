import { useEffect, useRef, useState } from "react";
import { clsx } from "clsx";
import { config } from "@/utils/config";
import { normalizeThemeColor } from "@/utils/domainTheme";
import { stripDisplayControlTags } from "@/utils/stringProcessing";
import { IconButton } from "./iconButton";
import { useTranslation } from "react-i18next";
import { ChatDbResult, ChatMcpInfo, Message } from "@/features/chat/messages";
import { DbResultPanel } from "./dbResultPanel";

function splitDbResultBlock(text: string): {
    dbResult: ChatDbResult | null;
    plainMessage: string;
} {
    const match = text.match(/\[\[DB_RESULT\]\]\n([\s\S]*?)\n\[\[\/DB_RESULT\]\]\n*/);
    if (!match) {
        return {
            dbResult: null,
            plainMessage: text,
        };
    }

    try {
        const matchedBlock = match[0] || "";
        return {
            dbResult: JSON.parse(match[1] || '{}') as ChatDbResult,
            plainMessage: text.replace(matchedBlock, '').trimStart(),
        };
    } catch {
        const matchedBlock = match[0] || "";
        return {
            dbResult: null,
            plainMessage: text.replace(matchedBlock, '').trimStart(),
        };
    }
}

function getMessageDbResult(message: Message): ChatDbResult | null {
    if (message.dbResult) {
        return message.dbResult;
    }

    const normalizedMessage = stripDisplayControlTags(message.content);
    return splitDbResultBlock(normalizedMessage).dbResult;
}

function getDbResultSignature(dbResult?: ChatDbResult | null): string {
    if (!dbResult) {
        return "";
    }

    return JSON.stringify({
        title: dbResult.title,
        sourceName: dbResult.sourceName,
        toolName: dbResult.toolName,
        summary: dbResult.summary,
        queryText: dbResult.queryText,
        sortLabel: dbResult.sortLabel,
        totalCount: dbResult.totalCount,
        previewColumns: dbResult.previewColumns,
        previewRows: dbResult.previewRows?.slice(0, 5),
    });
}

export const ChatModeText = ({ messages }: { messages: Message[] }) => {
    const chatScrollRef = useRef<HTMLDivElement>(null);
    const chatViewportRef = useRef<HTMLDivElement>(null);
    const hasMessages = messages.length > 0;
    const resolvedLatestDbResult = [...messages]
        .reverse()
        .map((message) => (message.role === "assistant" ? getMessageDbResult(message) : null))
        .find((dbResult): dbResult is ChatDbResult => Boolean(dbResult)) || null;
    const latestDbResultSignature = getDbResultSignature(resolvedLatestDbResult);
    const [overlayResult, setOverlayResult] = useState<ChatDbResult | null>(null);
    const [overlayResultSignature, setOverlayResultSignature] = useState("");
    const [isOverlayOpen, setIsOverlayOpen] = useState(false);
    const [showScrollToBottom, setShowScrollToBottom] = useState(false);

    const updateScrollToBottomVisibility = () => {
        const container = chatViewportRef.current;
        if (!container) {
            return;
        }

        setShowScrollToBottom(Math.abs(container.scrollTop) > 96);
    };

    useEffect(() => {
        if (!resolvedLatestDbResult || !latestDbResultSignature) {
            return;
        }

        if (latestDbResultSignature !== overlayResultSignature) {
            setOverlayResult(resolvedLatestDbResult);
            setOverlayResultSignature(latestDbResultSignature);
            setIsOverlayOpen(true);
        }
    }, [resolvedLatestDbResult, latestDbResultSignature, overlayResultSignature]);

    useEffect(() => {
        chatScrollRef.current?.scrollIntoView({
            behavior: "smooth",
            block: "center",
        });
        setShowScrollToBottom(false);
    }, [messages]);

    useEffect(() => {
        const container = chatViewportRef.current;
        if (!container) {
            return;
        }

        updateScrollToBottomVisibility();

        const handleScroll = () => updateScrollToBottomVisibility();
        container.addEventListener("scroll", handleScroll, { passive: true });

        return () => {
            container.removeEventListener("scroll", handleScroll);
        };
    }, []);

    const openOverlay = (dbResult: ChatDbResult) => {
        setOverlayResult(dbResult);
        setOverlayResultSignature(getDbResultSignature(dbResult));
        setIsOverlayOpen(true);
    };

    const scrollToBottom = () => {
        const container = chatViewportRef.current;
        if (!container) {
            return;
        }

        container.scrollTo({
            top: 0,
            behavior: "smooth",
        });
        setShowScrollToBottom(false);
    };

    return (
        <>
            {isOverlayOpen && overlayResult && (
                <button
                    type="button"
                    className="fixed inset-0 z-30 bg-slate-900/30 backdrop-blur-[1px] lg:hidden"
                    onClick={() => setIsOverlayOpen(false)}
                    aria-label="Close search canvas backdrop"
                />
            )}
            {hasMessages && (
                <div className="fixed inset-x-0 bottom-40 top-14 z-10 flex w-full flex-col justify-end lg:bottom-0 lg:left-[33.333vw] lg:top-auto lg:max-h-[90%] lg:w-[33.333vw] lg:mb-20">
                    <div className="pointer-events-none absolute inset-y-3 left-1 right-1 z-0 rounded-none bg-slate-950/22 backdrop-blur-[3px] lg:inset-y-0 lg:left-0 lg:right-0" />
                    <div className="pointer-events-none absolute inset-0 z-0 bg-[linear-gradient(90deg,rgba(15,23,42,0.2)_0%,rgba(15,23,42,0.24)_10%,rgba(15,23,42,0.32)_22%,rgba(15,23,42,0.4)_34%,rgba(15,23,42,0.46)_50%,rgba(15,23,42,0.4)_66%,rgba(15,23,42,0.32)_78%,rgba(15,23,42,0.24)_90%,rgba(15,23,42,0.2)_100%)]" />
                    <div ref={chatViewportRef} className="scroll-hidden relative z-10 max-h-full w-full overflow-y-auto flex flex-col-reverse">

                        <div className="mx-auto flex w-full max-w-full flex-col gap-3 px-4 pb-6 pt-4 md:px-6 lg:px-5 lg:pb-10 xl:px-6">
                            {messages.map((msg, i) => {
                                return (
                                    <div key={i} ref={messages.length - 1 === i ? chatScrollRef : null}>
                                        <Chat
                                            role={msg.role}
                                            message={(msg.content as string)}
                                            dbResult={msg.dbResult}
                                            mcpInfo={msg.mcpInfo}
                                            num={i}
                                            onOpenResult={openOverlay}
                                            activeResultSignature={isOverlayOpen ? overlayResultSignature : ""}
                                        />
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </div>
            )}
            {hasMessages && showScrollToBottom && (
                <div className="pointer-events-none fixed bottom-32 left-1/2 z-[60] -translate-x-1/2 lg:bottom-16">
                    <button
                        type="button"
                        className="pointer-events-auto inline-flex items-center rounded-full border border-slate-300 bg-white/95 px-4 py-2 text-sm font-semibold text-slate-700 shadow-lg backdrop-blur transition hover:bg-slate-100"
                        onClick={scrollToBottom}
                    >
                        最新まで移動
                    </button>
                </div>
            )}
            <div className="pointer-events-none fixed inset-x-0 bottom-28 top-14 z-40 flex justify-end px-2 sm:inset-y-0 sm:right-0 sm:px-0 sm:items-stretch">
                <div className={clsx(
                    "pointer-events-auto flex h-full w-full max-w-[min(96vw,700px)] flex-col overflow-hidden rounded-lg border border-slate-700/60 bg-slate-900/80 shadow-lg backdrop-blur-md transition-all duration-300 sm:w-[min(94vw,700px)] lg:mb-12 lg:h-[88%] lg:w-[34vw] xl:w-[32vw]",
                    isOverlayOpen && overlayResult ? "translate-x-0 opacity-100" : "translate-x-full opacity-0",
                )}>
                    <div className="flex items-start justify-between border-b border-slate-700/60 bg-slate-800/70 px-3 py-2 text-slate-200">
                        <div className="min-w-0">
                            <div className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">
                                Search Workspace
                            </div>
                            <div className="mt-1 truncate text-sm font-semibold text-white/95">
                                検索結果
                            </div>
                            {(overlayResult?.sourceName || overlayResult?.toolName) && (
                                <div className="mt-2 flex flex-wrap gap-1.5 text-xs font-medium text-white/75">
                                    {overlayResult.sourceName && (
                                        <span className="inline-block rounded px-1.5 py-0.5 text-[11px] font-medium leading-tight bg-slate-700/70 text-slate-100">
                                            {overlayResult.sourceName}
                                        </span>
                                    )}
                                    {overlayResult.toolName && (
                                        <span className="inline-block rounded px-1.5 py-0.5 text-[11px] font-medium leading-tight bg-slate-700/70 text-slate-100">
                                            {overlayResult.toolName}
                                        </span>
                                    )}
                                </div>
                            )}
                        </div>
                        <button
                            type="button"
                            className="ml-4 inline-flex h-7 w-7 items-center justify-center rounded text-current/90 transition hover:bg-black/10 hover:text-white"
                            onClick={() => setIsOverlayOpen(false)}
                            aria-label="Close search canvas"
                        >
                            ×
                        </button>
                    </div>

                    <div className="min-h-0 flex-1 overflow-y-auto px-3 py-2 lg:px-3 lg:py-3">
                        {overlayResult && <DbResultPanel dbResult={overlayResult} embedded />}
                    </div>
                </div>
            </div>
        </>

    );
};

function splitChronicleBlock(text: string): {
    chipLabel: string | null;
    chronicleContent: string | null;
    plainMessage: string;
} {
    const match = text.match(/^\[\[CHRONICLE_TITLE:([^\]]+)\]\]\n([\s\S]*?)\n\[\[\/CHRONICLE\]\]\n*/);
    if (!match) {
        return {
            chipLabel: null,
            chronicleContent: null,
            plainMessage: text,
        };
    }

    return {
        chipLabel: (match[1] || 'CHRONICLE').trim(),
        chronicleContent: (match[2] || '').trim(),
        plainMessage: text.slice(match[0].length),
    };
}

function Chat({
    role,
    message,
    dbResult: dbResultProp,
    mcpInfo,
    num,
    onOpenResult,
    activeResultSignature,
}: {
    role: string;
    message: string;
    dbResult?: ChatDbResult;
    mcpInfo?: ChatMcpInfo;
    num: number;
    onOpenResult: (dbResult: ChatDbResult) => void;
    activeResultSignature: string;
}) {
    const scrollRef = useRef<HTMLDivElement>(null);
    const accentColor = normalizeThemeColor(config('theme_color'));
    const normalizedMessage = stripDisplayControlTags(message);
    const { dbResult: dbResultFromText, plainMessage: afterDbMessage } = splitDbResultBlock(normalizedMessage);
    const dbResult = dbResultProp || dbResultFromText;
    const dbResultSignature = getDbResultSignature(dbResult);
    const isResultActive = Boolean(dbResult && activeResultSignature && dbResultSignature === activeResultSignature);
    const { chipLabel, chronicleContent, plainMessage } = splitChronicleBlock(afterDbMessage);

    // useEffect(() => {
    //     scrollRef.current?.scrollIntoView({
    //         behavior: "smooth",
    //         block: "center",
    //     });
    // });

    return (
        <div className={clsx(
            'mx-auto w-full max-w-3xl',
            role === "assistant" ? "px-2 sm:px-4 lg:px-6" : "ml-auto px-2 pl-5 sm:px-4 sm:pl-10 lg:px-6 lg:pl-14",
        )}>
            <div className="px-3 py-2 sm:px-5 lg:px-6">
                    <div className={clsx(
                        "flex items-center gap-2 pb-1 text-white font-bold tracking-wider",
                        role === "user" && "justify-end",
                    )}>
                        {role === "assistant" && (
                            <span className="inline-flex items-center text-[24px] font-bold leading-none text-pink-400 drop-shadow-[0_2px_10px_rgba(15,23,42,0.45)] sm:text-[24px]" style={accentColor ? { color: accentColor } : undefined}>
                                {`${config('name')}:`}
                            </span>
                        )}

                        {role === "assistant" && mcpInfo?.used && (
                            <span className="inline-flex items-center rounded-full bg-emerald-400/12 px-2 py-1 text-[9px] font-bold tracking-[0.14em] text-emerald-200 shadow-sm ring-1 ring-emerald-300/20">
                                +MCP{mcpInfo.toolName ? ` ${mcpInfo.toolName}` : ""}
                            </span>
                        )}
                    </div>
                    {role === "assistant" && (
                        <div className="overflow-y-auto pb-3 pt-1 max-h-[calc(75vh)]">
                            <div className="min-h-8 max-h-full whitespace-pre-wrap break-words text-[18px] font-semibold leading-[1.5] text-white/95 drop-shadow-[0_2px_10px_rgba(15,23,42,0.45)] sm:text-[25px]">
                                {chipLabel && chronicleContent && (
                                    <div className="mb-3 bg-slate-950/12 px-3 py-2 backdrop-blur-[2px]">
                                        <div className="mb-2 inline-flex items-center text-[13px] font-bold tracking-[0.18em] text-cyan-200">
                                            {chipLabel}
                                        </div>
                                        <div className="whitespace-pre-wrap break-words text-[17px] font-medium leading-[1.55] text-white/90 sm:text-[22px]">
                                            {chronicleContent}
                                        </div>
                                    </div>
                                )}
                                {plainMessage}
                                {dbResult && (
                                    <div className="mt-4">
                                        <button
                                            type="button"
                                            className={clsx(
                                                "inline-flex items-center rounded-full px-3 py-1.5 text-xs font-bold tracking-wide transition",
                                                isResultActive
                                                    ? "bg-emerald-400/18 text-emerald-100 ring-1 ring-emerald-300/25"
                                                    : "bg-white/10 text-white/88 hover:text-pink-100 ring-1 ring-white/15",
                                            )}
                                            onClick={() => onOpenResult(dbResult)}
                                        >
                                            {isResultActive ? "結果を表示中" : "結果を開く"}
                                        </button>
                                    </div>
                                )}
                                <div ref={scrollRef} />
                            </div>
                        </div>
                    )}
                    {role === "user" && (
                        <div className="max-h-36 overflow-y-auto pb-3 pt-0.5">
                            <div className="min-h-8 max-h-full whitespace-pre-wrap break-words text-right text-[17px] font-semibold leading-[1.5] text-white drop-shadow-[0_2px_10px_rgba(15,23,42,0.45)] sm:text-[22px]">
                                {normalizedMessage}
                                <div ref={scrollRef} />
                            </div>
                        </div>
                    )}
            </div>
        </div>

    );
}
