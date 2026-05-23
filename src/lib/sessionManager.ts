/**
 * クライアント側セッションライフサイクル管理
 * - ページロード時に injection-tool へセッション取得をリクエスト
 * - 一定間隔でハートビートを送信し、接続を維持
 * - ページ離脱時にセッションを解放
 */

import { config } from '@/utils/config';
import { getDomainAccessHeaders } from '@/lib/injectionClient';

const HEARTBEAT_INTERVAL_MS = 20_000; // 20秒ごと
const POLL_INTERVAL_MS = 5_000;       // 待機中は5秒ごとに再チェック

export interface SessionStatus {
  current: number;
  max: number;
  available: boolean;
}

export interface AcquireResult {
  acquired: boolean;
  sessionId: string | null;
  current: number;
  max: number;
  errorCode?: string;
}

function getSessionsEndpoint(action?: string): string {
  const url =
    typeof document !== 'undefined'
      ? config('injection_tool_url')
      : process.env.NEXT_PUBLIC_INJECTION_TOOL_URL || '/api/injection';

  const base = url.replace(/\/$/, '');
  const suffix = base.startsWith('http') ? '/api/public/sessions' : '/public/sessions';
  const ep = base + suffix;
  return action ? `${ep}?action=${action}` : ep;
}

/** セッション状態を取得 */
export async function fetchSessionStatus(domainId: string): Promise<SessionStatus> {
  try {
    const ep = getSessionsEndpoint();
    const res = await fetch(`${ep}?domainId=${encodeURIComponent(domainId)}`, {
      method: 'GET',
      cache: 'no-store',
      headers: getDomainAccessHeaders(domainId),
    });
    if (!res.ok) return { current: 0, max: 0, available: true };
    return await res.json();
  } catch {
    return { current: 0, max: 0, available: true };
  }
}

/** セッションを取得する */
export async function acquireSession(domainId: string): Promise<AcquireResult> {
  try {
    const ep = getSessionsEndpoint();
    const res = await fetch(ep, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...getDomainAccessHeaders(domainId) },
      body: JSON.stringify({ domainId }),
    });
    if (res.status === 401) {
      const payload = await res.json().catch(() => null);
      return { acquired: true, sessionId: null, current: 0, max: 0, errorCode: payload?.code || 'DOMAIN_AUTH_REQUIRED' };
    }
    const data = await res.json();
    return data as AcquireResult;
  } catch {
    // fail-open: API 障害時はセッションなしで続行
    return { acquired: true, sessionId: null, current: 0, max: 0 };
  }
}

/** セッションを解放する */
export async function releaseSession(sessionId: string, domainId?: string): Promise<void> {
  try {
    const ep = getSessionsEndpoint();
    await fetch(ep, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json', ...getDomainAccessHeaders(domainId) },
      body: JSON.stringify({ sessionId }),
      keepalive: true, // ページ離脱時も確実に送信
    });
  } catch {
    // ignore
  }
}

/** ハートビート */
async function sendHeartbeat(sessionId: string, domainId?: string): Promise<void> {
  try {
    const ep = getSessionsEndpoint('heartbeat');
    await fetch(ep, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...getDomainAccessHeaders(domainId) },
      body: JSON.stringify({ sessionId }),
    });
  } catch {
    // ignore
  }
}

/** セッションマネージャーのインスタンス（ページ単位シングルトン） */
class SessionManager {
  private sessionId: string | null = null;
  private domainId: string | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;

  start(sessionId: string, domainId?: string) {
    this.sessionId = sessionId;
    this.domainId = domainId || null;
    this.heartbeatTimer = setInterval(() => {
      if (this.sessionId) sendHeartbeat(this.sessionId, this.domainId || undefined);
    }, HEARTBEAT_INTERVAL_MS);

    // ページ離脱時に自動解放
    const release = () => this.stop();
    window.addEventListener('beforeunload', release, { once: true });
    window.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') sendHeartbeat(this.sessionId!, this.domainId || undefined);
    });
  }

  stop() {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
    if (this.sessionId) {
      releaseSession(this.sessionId, this.domainId || undefined);
      this.sessionId = null;
      this.domainId = null;
    }
  }

  getSessionId() {
    return this.sessionId;
  }
}

export const sessionManager = new SessionManager();
export { POLL_INTERVAL_MS };
