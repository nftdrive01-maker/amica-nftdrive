import { useEffect, useRef } from "react";
import { Chat } from "@/features/chat/chat";
import { AmicaLife } from "@/features/amicaLife/amicaLife";

/**
 * YouTubeライブチャット → AIチャット自動入力フック。
 *
 * 安全設計（配信OFF時に現行動作へ影響しないこと）:
 * - `active` が false（injection-tool無効 or ドメイン未確定）の間はポーリングを一切行わない。
 * - poll応答が enabled:false の間はドーマント間隔(60s)で待機するだけで、
 *   receiveMessageFromUser は決して呼ばない。
 * - メッセージ投入は AI がアイドル（処理中でも発話中でもない）かつ配速ポリシー条件を満たす時のみ。
 */

interface PollMessage {
  id: string;
  author: string;
  text: string;
  type: string;
  isMember: boolean;
  publishedAt: string;
}

interface PollResult {
  enabled: boolean;
  connected: boolean;
  messages: PollMessage[];
  pollingIntervalMillis: number;
  ingestion: { mode: string; keywords: string[]; includeMembersOnly: boolean };
  pacing: { mode: "sequential" | "latest" | "sampling"; intervalSec: number; maxQueue: number };
  passAuthorName: boolean;
  error?: string;
}

const DORMANT_INTERVAL_MS = 60000;
const DRAIN_INTERVAL_MS = 1500;

export function useStreamingChat(opts: {
  active: boolean;
  domainId: string;
  bot: Chat;
  amicaLife: AmicaLife;
  busy: boolean;
  injectionBaseUrl: string;
}) {
  const { active, domainId, bot, amicaLife, busy, injectionBaseUrl } = opts;

  // busy は毎レンダリングで変わるため ref 経由で参照し、ポーリング effect を安定させる
  const busyRef = useRef(busy);
  busyRef.current = busy;

  const queueRef = useRef<PollMessage[]>([]);
  const seenRef = useRef<Set<string>>(new Set());
  const lastSentAtRef = useRef<number>(0);
  const pacingRef = useRef<PollResult["pacing"] | null>(null);
  const passAuthorRef = useRef<boolean>(true);
  const manualRef = useRef<boolean>(false);

  useEffect(() => {
    if (!active || !domainId) {
      return; // 完全に何もしない（OFF-safe）
    }

    let cancelled = false;
    let pollTimer: ReturnType<typeof setTimeout> | null = null;

    // ドメイン切替時はキュー/既読をリセット
    queueRef.current = [];
    seenRef.current = new Set();
    lastSentAtRef.current = 0;
    pacingRef.current = null;

    const maybeSend = () => {
      const pacing = pacingRef.current;
      if (!pacing || manualRef.current) return;
      if (queueRef.current.length === 0) return;
      if (busyRef.current) return;

      if (pacing.mode === "sampling") {
        const now = Date.now();
        if (now - lastSentAtRef.current < pacing.intervalSec * 1000) return;
      }

      let msg: PollMessage | undefined;
      if (pacing.mode === "latest") {
        msg = queueRef.current[queueRef.current.length - 1];
        queueRef.current = []; // 積み残し破棄
      } else {
        msg = queueRef.current.shift(); // sequential / sampling は古い順
      }
      if (!msg) return;

      const text = passAuthorRef.current ? `${msg.author}さんからのコメント: ${msg.text}` : msg.text;
      lastSentAtRef.current = Date.now();
      try {
        bot.receiveMessageFromUser(text, false, domainId);
      } catch (e) {
        console.warn("[streaming] receiveMessageFromUser failed", e);
      }
    };

    const tick = async () => {
      if (cancelled) return;
      let nextDelay = DORMANT_INTERVAL_MS;
      try {
        const res = await fetch(
          `${injectionBaseUrl}/streaming/poll?domainId=${encodeURIComponent(domainId)}`,
          { credentials: "include", cache: "no-store" },
        );
        if (res.ok) {
          const data: PollResult = await res.json();
          if (data.enabled) {
            nextDelay = Math.max(2000, data.pollingIntervalMillis || 5000);
            pacingRef.current = data.pacing;
            passAuthorRef.current = data.passAuthorName;
            manualRef.current = data.ingestion?.mode === "manual";

            for (const m of data.messages || []) {
              if (!seenRef.current.has(m.id)) {
                seenRef.current.add(m.id);
                queueRef.current.push(m);
              }
            }
            if (seenRef.current.size > 5000) {
              seenRef.current = new Set(queueRef.current.map((m) => m.id));
            }
            const maxQueue = data.pacing?.maxQueue || 0;
            if (maxQueue > 0 && queueRef.current.length > maxQueue) {
              queueRef.current = queueRef.current.slice(-maxQueue);
            }
            maybeSend();
          }
        }
      } catch {
        // ネットワークエラーはドーマント間隔で再試行
      }
      if (!cancelled) {
        pollTimer = setTimeout(tick, nextDelay);
      }
    };

    // ポーリング間隔と独立して、アイドルになった瞬間にキューを捌くためのドレイン
    const drainTimer = setInterval(() => {
      maybeSend();
    }, DRAIN_INTERVAL_MS);

    tick();

    return () => {
      cancelled = true;
      if (pollTimer) clearTimeout(pollTimer);
      clearInterval(drainTimer);
    };
  }, [active, domainId, bot, amicaLife, injectionBaseUrl]);
}
