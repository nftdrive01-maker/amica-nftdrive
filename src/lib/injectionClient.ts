/**
 * Injection Tool クライアント
 * 送信前インターセプト時に injection-tool に問い合わせるロジック
 */

import { InjectionInterceptRequest, InjectionInterceptResponse } from '@/types/injection';
import type { ChatHistoryEntry } from '@/features/chatHistory/chatHistoryModel';
import { config } from '@/utils/config';
import { getCachedInjection, cacheInjection } from '@/lib/injectionCache';
import { getDomainAccessSession } from '@/lib/domainAccessSession';

export type PublicDomainOption = {
  id: string;
  label: string;
  description?: string;
  chronicleAttached?: boolean;
  accessControlEnabled?: boolean;
  mcpServerIds?: string[];
  knowledgeIds?: string[];
  bgUrl?: string;
  headerImageUrl?: string;
  themeColor?: string;
  characterName?: string;
  vrmEnabled?: boolean;
  vrmUrl?: string;
  imageAvatarIdleUrl?: string;
  imageAvatarTalkUrl?: string;
  imageAvatarTalkIntervalMs?: number;
  ttsBackend?: string;
  stylebertvits2ModelId?: string;
  stylebertvits2Style?: string;
  ttsMuted?: boolean;
  amicaLifeEnabled?: boolean;
  timeBeforeIdleSec?: number;
  minTimeIntervalSec?: number;
  maxTimeIntervalSec?: number;
  timeToSleepSec?: number;
  gazeWakeEnabled?: boolean;
  gazeHoldMs?: number;
  gazeReleaseMs?: number;
  gazeCooldownMs?: number;
  gazeGreetings?: string[];
  gazeDebugUiEnabled?: boolean;
};

export type PublicAppSettings = {
  launcherEnabled: boolean;
  termsOfUseUrl: string;
  privacyPolicyUrl: string;
};

let _publicDomainOptionsCache: PublicDomainOption[] | null = null;
let _publicDomainOptionsFetchPromise: Promise<PublicDomainOption[]> | null = null;
let _publicAppSettingsCache: PublicAppSettings | null = null;
let _publicAppSettingsFetchPromise: Promise<PublicAppSettings> | null = null;

function buildDomainAccessHeaders(domainId?: string): Record<string, string> {
  const normalizedDomainId = String(domainId || '').trim();
  if (!normalizedDomainId) {
    return {};
  }

  const session = getDomainAccessSession(normalizedDomainId);
  if (!session?.accessToken) {
    return {};
  }

  return {
    'x-domain-access-token': session.accessToken,
  };
}

export function getDomainAccessHeaders(domainId?: string): Record<string, string> {
  return buildDomainAccessHeaders(domainId);
}

export async function loginDomainAccess(domainId: string, username: string, password: string): Promise<{ ok: boolean; accessToken?: string; username?: string; error?: string; code?: string }> {
  try {
    const url = typeof document !== 'undefined' ? config('injection_tool_url') : process.env.NEXT_PUBLIC_INJECTION_TOOL_URL || '/api/injection';
    const endpoint = buildEndpoint(url, '/api/public/domain-access/login/');
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ domainId, username, password }),
    });

    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      return {
        ok: false,
        error: payload?.error || 'ドメイン認証に失敗しました',
        code: payload?.code,
      };
    }

    return {
      ok: true,
      accessToken: typeof payload?.accessToken === 'string' ? payload.accessToken : '',
      username: typeof payload?.username === 'string' ? payload.username : username,
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : 'ドメイン認証に失敗しました',
    };
  }
}

function generateRequestId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function emitMcpTriggeredEvent(payload: InjectionInterceptResponse): void {
  if (typeof window === 'undefined') {
    return;
  }

  const metadata = payload?.metadata;
  if (!metadata?.mcpUsed) {
    return;
  }

  window.dispatchEvent(
    new CustomEvent('amica:mcp-triggered', {
      detail: {
        at: Date.now(),
        serverId: metadata.mcpServerId || '',
        toolName: metadata.mcpToolName || '',
      },
    }),
  );
}

function emitInterceptEvent(payload: InjectionInterceptResponse): void {
  if (typeof window === 'undefined') {
    return;
  }

  const metadata = payload?.metadata;
  window.dispatchEvent(
    new CustomEvent('amica:mcp-intercepted', {
      detail: {
        at: Date.now(),
        used: Boolean(metadata?.mcpUsed),
        serverId: metadata?.mcpServerId || '',
        toolName: metadata?.mcpToolName || '',
      },
    }),
  );
}

/**
 * base が相対パス（BFF プロキシ）の場合も正しくエンドポイントを生成する。
 * 例: base='/api/injection', apiPath='/api/intercept' → '/api/injection/intercept'
 *     base='http://localhost:4001', apiPath='/api/health' → 'http://localhost:4001/api/health'
 */
function buildEndpoint(base: string, apiPath: string): string {
  if (base.startsWith('http://') || base.startsWith('https://')) {
    return new URL(apiPath, base).toString();
  }
  // 相対BFFパス: apiPath の /api プレフィックスを除いて結合
  const suffix = apiPath.replace(/^\/api/, '');
  return base.replace(/\/$/, '') + suffix;
}

function buildEnvFallback(domainId: string): InjectionInterceptResponse {
  const fallbackSystem =
    typeof document !== 'undefined'
      ? config('injection_fallback_system_prompt')
      : process.env.NEXT_PUBLIC_INJECTION_FALLBACK_SYSTEM_PROMPT || '';

  const fallbackUserContext =
    typeof document !== 'undefined'
      ? config('injection_fallback_user_context')
      : process.env.NEXT_PUBLIC_INJECTION_FALLBACK_USER_CONTEXT || '';

  if (!fallbackSystem && !fallbackUserContext) {
    return {};
  }

  return {
    injectedSystemPrompt: fallbackSystem,
    injectedUserContext: fallbackUserContext,
    metadata: {
      domainId,
      ttl: 3600,
      version: 'env-fallback',
    },
  };
}

export async function syncServerChatHistory(entries: ChatHistoryEntry[]): Promise<void> {
  try {
    if (!Array.isArray(entries) || entries.length === 0) {
      return;
    }

    const enabled =
      typeof document !== 'undefined'
        ? config('injection_tool_enabled').toLowerCase() === 'true'
        : process.env.NEXT_PUBLIC_INJECTION_TOOL_ENABLED !== 'false';

    const url =
      typeof document !== 'undefined'
        ? config('injection_tool_url')
        : process.env.NEXT_PUBLIC_INJECTION_TOOL_URL || '/api/injection';

    if (!enabled || !url) {
      return;
    }

    const endpoint = buildEndpoint(url, '/api/public/chat-history/');
    const groupedEntries = new Map<string, ChatHistoryEntry[]>();
    for (const entry of entries) {
      const domainId = String(entry.domainId || '').trim();
      if (!domainId) {
        continue;
      }

      const current = groupedEntries.get(domainId) || [];
      current.push(entry);
      groupedEntries.set(domainId, current);
    }

    const domainOptions = await getCachedPublicDomainOptions();
    const domainOptionMap = new Map(domainOptions.map((domain) => [domain.id, domain]));

    for (const [domainId, grouped] of groupedEntries.entries()) {
      const domainAccessHeaders = buildDomainAccessHeaders(domainId);
      const accessControlEnabled = domainOptionMap.get(domainId)?.accessControlEnabled === true;
      if (accessControlEnabled && !domainAccessHeaders['x-domain-access-token']) {
        continue;
      }

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...domainAccessHeaders,
        },
        body: JSON.stringify({ entries: grouped }),
      });

      if (!response.ok) {
        console.warn('Chat history sync failed:', response.status, response.statusText);
      }
    }
  } catch (error) {
    console.warn('Chat history sync failed:', error);
  }
}

async function getCachedPublicDomainOptions(): Promise<PublicDomainOption[]> {
  if (_publicDomainOptionsCache) {
    return _publicDomainOptionsCache;
  }

  if (_publicDomainOptionsFetchPromise) {
    return _publicDomainOptionsFetchPromise;
  }

  _publicDomainOptionsFetchPromise = fetchPublicDomainOptions()
    .then((domains) => {
      _publicDomainOptionsCache = domains;
      return domains;
    })
    .finally(() => {
      _publicDomainOptionsFetchPromise = null;
    });

  return _publicDomainOptionsFetchPromise;
}

/**
 * Injection Tool に問い合わせて動的コンテキストを取得
 * fail-open: 失敗時は空オブジェクト（またはキャッシュ）を返し、Amica側で素通し処理する
 */
export async function fetchInjectedContext(
  userText: string,
  domainId?: string,
  sessionId?: string,
  messageHistory?: Array<{ role: string; content: string }>,
  options?: { requestId?: string; attachedPackIds?: string[] }
): Promise<InjectionInterceptResponse> {
  try {
    const targetDomainId =
      domainId ||
      (typeof document !== 'undefined'
        ? config('injection_default_domain')
        : process.env.NEXT_PUBLIC_INJECTION_DEFAULT_DOMAIN || 'default');

    // 設定から injection-tool の有効化と URL を読み込む
    const enabled =
      typeof document !== 'undefined'
        ? config('injection_tool_enabled').toLowerCase() === 'true'
        : process.env.NEXT_PUBLIC_INJECTION_TOOL_ENABLED !== 'false';

    const url =
      typeof document !== 'undefined'
        ? config('injection_tool_url')
        : process.env.NEXT_PUBLIC_INJECTION_TOOL_URL || '/api/injection';

    const timeoutMs = parseInt(
      typeof document !== 'undefined' ? config('injection_tool_timeout_ms') : '8000',
      10
    );

    if (!enabled) {
      return buildEnvFallback(targetDomainId);
    }

    if (!url) {
      return buildEnvFallback(targetDomainId);
    }

    const endpoint = buildEndpoint(url, '/api/intercept/');

    const request: InjectionInterceptRequest = {
      requestId: options?.requestId || generateRequestId(),
      userText,
      domainId: targetDomainId,
      sessionId,
      attachedPackIds: options?.attachedPackIds,
      messageHistory: messageHistory as Array<{ role: 'user' | 'assistant' | 'system'; content: string }>,
      timestamp: Date.now(),
    };

    // タイムアウト付きで Fetch
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...buildDomainAccessHeaders(targetDomainId) },
        body: JSON.stringify(request),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (response.ok) {
        const data = await response.json();
        if (data && typeof data === 'object') {
          // キャッシュに保存
          cacheInjection(targetDomainId, data);
          emitInterceptEvent(data as InjectionInterceptResponse);
          emitMcpTriggeredEvent(data as InjectionInterceptResponse);
          return data;
        }
        return {};
      } else {
        // HTTP エラー → キャッシュにフォールバック
        console.warn(
          `Injection API returned status ${response.status}, trying cache fallback`
        );
        const cached = getCachedInjection(targetDomainId);
        if (cached) {
          return cached;
        }
        // サーバーエラーを明示
        return { error: 'server_error' };
      }
    } catch (fetchErr: any) {
      clearTimeout(timeoutId);
      if (fetchErr.name === 'AbortError') {
        console.warn(`Injection API request timed out (domain=${targetDomainId}, endpoint=${endpoint}), trying cache fallback`);
      } else {
        console.warn('Injection API request failed:', fetchErr);
      }
      // キャッシュからフォールバック
      const cached = getCachedInjection(targetDomainId);
      if (cached) {
        return cached;
      }
      // サーバーエラーを明示
      return { error: 'server_error' };
    }
  } catch (err) {
    console.warn('Error in fetchInjectedContext:', err);
    const domain = domainId || 'consultation';
    const cached = getCachedInjection(domain);
    if (cached) {
      return cached;
    }
    // サーバーエラーを明示
    return { error: 'server_error' };
  }
}

/**
 * Injection Tool のヘルス チェック
 * 接続可能性を確認（任意・軽量チェック用）
 */
export async function checkInjectionToolHealth(): Promise<boolean> {
  try {
    const enabled =
      typeof document !== 'undefined'
        ? config('injection_tool_enabled').toLowerCase() === 'true'
        : process.env.NEXT_PUBLIC_INJECTION_TOOL_ENABLED !== 'false';

    if (!enabled) return false;

    const url =
      typeof document !== 'undefined'
        ? config('injection_tool_url')
        : process.env.NEXT_PUBLIC_INJECTION_TOOL_URL || '/api/injection';

    if (!url) return false;

    const endpoint = buildEndpoint(url, '/api/health');

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 1000);

    try {
      const response = await fetch(endpoint, {
        method: 'GET',
        signal: controller.signal,
      });

      clearTimeout(timeoutId);
      return response.ok;
    } catch (err) {
      clearTimeout(timeoutId);
      console.warn('Health check failed:', err);
      return false;
    }
  } catch (err) {
    return false;
  }
}

function buildPublicSessionsEndpoint(base: string, action?: string): string {
  const endpoint = buildEndpoint(base, '/api/public/sessions');
  if (!action) return endpoint;
  const connector = endpoint.includes('?') ? '&' : '?';
  return `${endpoint}${connector}action=${encodeURIComponent(action)}`;
}

export async function getServerAttachedPacks(sessionId: string, domainId?: string): Promise<string[]> {
  if (!sessionId) return [];

  try {
    const url = typeof document !== 'undefined' ? config('injection_tool_url') : process.env.NEXT_PUBLIC_INJECTION_TOOL_URL || '/api/injection';
    const endpoint = buildPublicSessionsEndpoint(url, 'attached');
    const requestUrl = `${endpoint}&sessionId=${encodeURIComponent(sessionId)}`;
    const response = await fetch(requestUrl, { method: 'GET', cache: 'no-store', headers: buildDomainAccessHeaders(domainId) });
    if (!response.ok) return [];
    const data = await response.json();
    return Array.isArray(data?.attachedPackIds)
      ? data.attachedPackIds.filter((id: unknown): id is string => typeof id === 'string')
      : [];
  } catch {
    return [];
  }
}

export type AttachedPackItem = {
  id: string;
  name: string;
};

export type ServerAttachedPackDetails = {
  mcpServers: AttachedPackItem[];
  knowledges: AttachedPackItem[];
  unknownPackIds: string[];
  isReachable: boolean;
  errorCode?: string;
};

export async function getServerAttachedPackDetails(sessionId: string, domainId?: string): Promise<ServerAttachedPackDetails> {
  if (!sessionId && !domainId) {
    return { mcpServers: [], knowledges: [], unknownPackIds: [], isReachable: true };
  }

  try {
    const url = typeof document !== 'undefined' ? config('injection_tool_url') : process.env.NEXT_PUBLIC_INJECTION_TOOL_URL || '/api/injection';
    const endpoint = buildPublicSessionsEndpoint(url, 'attached');
    const requestUrl = `${endpoint}&sessionId=${encodeURIComponent(sessionId || '')}&domainId=${encodeURIComponent(domainId || '')}`;
    const response = await fetch(requestUrl, { method: 'GET', cache: 'no-store', headers: buildDomainAccessHeaders(domainId) });
    if (!response.ok) {
      const payload = await response.json().catch(() => null);
      return {
        mcpServers: [],
        knowledges: [],
        unknownPackIds: [],
        isReachable: false,
        errorCode: typeof payload?.code === 'string' ? payload.code : undefined,
      };
    }

    const data = await response.json();
    const details = data?.attachedDetails;
    if (!details || typeof details !== 'object') {
      return { mcpServers: [], knowledges: [], unknownPackIds: [], isReachable: true };
    }

    const normalizeItems = (items: unknown): AttachedPackItem[] =>
      Array.isArray(items)
        ? items
            .filter((item): item is { id: unknown; name: unknown } => typeof item === 'object' && item !== null)
            .map((item) => ({
              id: typeof item.id === 'string' ? item.id : '',
              name: typeof item.name === 'string' ? item.name : '',
            }))
            .filter((item) => item.id && item.name)
        : [];

    const unknownPackIds = Array.isArray(details.unknownPackIds)
      ? details.unknownPackIds.filter((id: unknown): id is string => typeof id === 'string' && id.trim().length > 0)
      : [];

    return {
      mcpServers: normalizeItems(details.mcpServers),
      knowledges: normalizeItems(details.knowledges),
      unknownPackIds,
      isReachable: true,
    };
  } catch {
    return { mcpServers: [], knowledges: [], unknownPackIds: [], isReachable: false };
  }
}

export async function attachPackToSession(sessionId: string, packId: string): Promise<boolean> {
  if (!sessionId || !packId) return false;

  try {
    const url = typeof document !== 'undefined' ? config('injection_tool_url') : process.env.NEXT_PUBLIC_INJECTION_TOOL_URL || '/api/injection';
    const endpoint = buildPublicSessionsEndpoint(url, 'attach');
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...buildDomainAccessHeaders(packId) },
      body: JSON.stringify({ sessionId, packId }),
    });
    return response.ok;
  } catch {
    return false;
  }
}

export async function detachPackFromSession(sessionId: string, packId: string): Promise<boolean> {
  if (!sessionId || !packId) return false;

  try {
    const url = typeof document !== 'undefined' ? config('injection_tool_url') : process.env.NEXT_PUBLIC_INJECTION_TOOL_URL || '/api/injection';
    const endpoint = buildPublicSessionsEndpoint(url, 'detach');
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...buildDomainAccessHeaders(packId) },
      body: JSON.stringify({ sessionId, packId }),
    });
    return response.ok;
  } catch {
    return false;
  }
}

export async function fetchPublicDomainOptions(): Promise<PublicDomainOption[]> {
  try {
    const enabled =
      typeof document !== 'undefined'
        ? config('injection_tool_enabled').toLowerCase() === 'true'
        : process.env.NEXT_PUBLIC_INJECTION_TOOL_ENABLED !== 'false';

    if (!enabled) {
      return [];
    }

    const url =
      typeof document !== 'undefined'
        ? config('injection_tool_url')
        : process.env.NEXT_PUBLIC_INJECTION_TOOL_URL || '/api/injection';

    if (!url) {
      return [];
    }

    const endpoint = buildEndpoint(url, '/api/public/domains/');
    const maxAttempts = 3;

    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 3000 + attempt * 1000);

      try {
        const response = await fetch(endpoint, {
          method: 'GET',
          cache: 'no-store',
          signal: controller.signal,
        });
        clearTimeout(timeoutId);

        if (!response.ok) {
          if (attempt < maxAttempts - 1) {
            await new Promise((resolve) => setTimeout(resolve, 250 * (attempt + 1)));
            continue;
          }
          return [];
        }

        const payload = await response.json();
        if (!Array.isArray(payload?.domains)) {
          if (attempt < maxAttempts - 1) {
            await new Promise((resolve) => setTimeout(resolve, 250 * (attempt + 1)));
            continue;
          }
          return [];
        }

        const options = payload.domains
          .filter(
            (domain: any) =>
              typeof domain?.id === 'string' &&
              (typeof domain?.name === 'string' || typeof domain?.label === 'string') &&
              domain?.enabled !== false
          )
          .map((domain: any) => ({
            id: String(domain.id).trim(),
            label: String(domain.name || domain.label).trim(),
            description: typeof domain.description === 'string' ? domain.description.trim() : '',
            chronicleAttached: Boolean(domain.chronicleAttached),
            accessControlEnabled: Boolean(domain.accessControlEnabled),
            mcpServerIds: Array.isArray(domain.mcpServerIds)
              ? domain.mcpServerIds.filter((id: unknown): id is string => typeof id === 'string' && id.trim().length > 0)
              : [],
            knowledgeIds: Array.isArray(domain.knowledgeIds)
              ? domain.knowledgeIds.filter((id: unknown): id is string => typeof id === 'string' && id.trim().length > 0)
              : [],
            bgUrl: typeof domain.bgUrl === 'string' ? domain.bgUrl.trim() : '',
            headerImageUrl: typeof domain.headerImageUrl === 'string' ? domain.headerImageUrl.trim() : '',
            themeColor: typeof domain.themeColor === 'string' ? domain.themeColor.trim() : '',
            characterName: typeof domain.characterName === 'string' ? domain.characterName.trim() : '',
            vrmEnabled: typeof domain.vrmEnabled === 'boolean' ? domain.vrmEnabled : true,
            vrmUrl: typeof domain.vrmUrl === 'string' ? domain.vrmUrl.trim() : '',
            imageAvatarIdleUrl:
              typeof domain.imageAvatarIdleUrl === 'string' ? domain.imageAvatarIdleUrl.trim() : '',
            imageAvatarTalkUrl:
              typeof domain.imageAvatarTalkUrl === 'string' ? domain.imageAvatarTalkUrl.trim() : '',
            imageAvatarTalkIntervalMs:
              typeof domain.imageAvatarTalkIntervalMs === 'number' ? domain.imageAvatarTalkIntervalMs : undefined,
            ttsBackend:
              typeof domain.ttsBackend === 'string'
                ? domain.ttsBackend.trim()
                : '',
            stylebertvits2ModelId:
              typeof domain.stylebertvits2ModelId === 'string'
                ? domain.stylebertvits2ModelId.trim()
                : '',
            stylebertvits2Style:
              typeof domain.stylebertvits2Style === 'string'
                ? domain.stylebertvits2Style.trim()
                : '',
            ttsMuted: typeof domain.ttsMuted === 'boolean' ? domain.ttsMuted : undefined,
            amicaLifeEnabled:
              typeof domain.amicaLifeEnabled === 'boolean' ? domain.amicaLifeEnabled : undefined,
            timeBeforeIdleSec:
              typeof domain.timeBeforeIdleSec === 'number' ? domain.timeBeforeIdleSec : undefined,
            minTimeIntervalSec:
              typeof domain.minTimeIntervalSec === 'number' ? domain.minTimeIntervalSec : undefined,
            maxTimeIntervalSec:
              typeof domain.maxTimeIntervalSec === 'number' ? domain.maxTimeIntervalSec : undefined,
            timeToSleepSec:
              typeof domain.timeToSleepSec === 'number' ? domain.timeToSleepSec : undefined,
            gazeWakeEnabled:
              typeof domain.gazeWakeEnabled === 'boolean' ? domain.gazeWakeEnabled : undefined,
            gazeHoldMs:
              typeof domain.gazeHoldMs === 'number' ? domain.gazeHoldMs : undefined,
            gazeReleaseMs:
              typeof domain.gazeReleaseMs === 'number' ? domain.gazeReleaseMs : undefined,
            gazeCooldownMs:
              typeof domain.gazeCooldownMs === 'number' ? domain.gazeCooldownMs : undefined,
            gazeGreetings:
              Array.isArray(domain.gazeGreetings)
                ? domain.gazeGreetings
                    .filter((phrase: unknown) => typeof phrase === 'string')
                    .map((phrase: string) => phrase.trim())
                    .filter(Boolean)
                : undefined,
            gazeDebugUiEnabled:
              typeof domain.gazeDebugUiEnabled === 'boolean' ? domain.gazeDebugUiEnabled : undefined,
          }))
          .filter((domain: { id: string; label: string }) => domain.id.length > 0 && domain.label.length > 0);

        const unique = new Map<string, {
          id: string;
          label: string;
          description?: string;
          chronicleAttached?: boolean;
          accessControlEnabled?: boolean;
          bgUrl?: string;
          headerImageUrl?: string;
          themeColor?: string;
          characterName?: string;
          vrmEnabled?: boolean;
          vrmUrl?: string;
          imageAvatarIdleUrl?: string;
          imageAvatarTalkUrl?: string;
          imageAvatarTalkIntervalMs?: number;
          stylebertvits2ModelId?: string;
          stylebertvits2Style?: string;
          ttsMuted?: boolean;
          amicaLifeEnabled?: boolean;
          timeBeforeIdleSec?: number;
          minTimeIntervalSec?: number;
          maxTimeIntervalSec?: number;
          timeToSleepSec?: number;
          gazeWakeEnabled?: boolean;
          gazeHoldMs?: number;
          gazeReleaseMs?: number;
          gazeCooldownMs?: number;
          gazeGreetings?: string[];
          gazeDebugUiEnabled?: boolean;
        }>();
        for (const domain of options) {
          if (!unique.has(domain.id)) {
            unique.set(domain.id, domain);
          }
        }

        const domains = Array.from(unique.values());
        _publicDomainOptionsCache = domains;
        return domains;
      } catch {
        clearTimeout(timeoutId);
        if (attempt < maxAttempts - 1) {
          await new Promise((resolve) => setTimeout(resolve, 250 * (attempt + 1)));
          continue;
        }
        return [];
      }
    }

    return [];
  } catch {
    return [];
  }
}

export async function fetchPublicAppSettings(): Promise<PublicAppSettings> {
  const fallback: PublicAppSettings = {
    launcherEnabled:
      typeof document !== 'undefined'
        ? config('injection_launcher_enabled') !== 'false'
        : process.env.NEXT_PUBLIC_INJECTION_LAUNCHER_ENABLED !== 'false',
    termsOfUseUrl: '',
    privacyPolicyUrl: '',
  };

  try {
    if (_publicAppSettingsCache) {
      return _publicAppSettingsCache;
    }

    if (_publicAppSettingsFetchPromise) {
      return _publicAppSettingsFetchPromise;
    }

    _publicAppSettingsFetchPromise = (async () => {
      const enabled =
        typeof document !== 'undefined'
          ? config('injection_tool_enabled').toLowerCase() === 'true'
          : process.env.NEXT_PUBLIC_INJECTION_TOOL_ENABLED !== 'false';

      if (!enabled) {
        _publicAppSettingsCache = fallback;
        return fallback;
      }

      const url =
        typeof document !== 'undefined'
          ? config('injection_tool_url')
          : process.env.NEXT_PUBLIC_INJECTION_TOOL_URL || '/api/injection';

      if (!url) {
        _publicAppSettingsCache = fallback;
        return fallback;
      }

      const endpoint = buildEndpoint(url, '/api/public/settings/');
      const response = await fetch(endpoint, {
        method: 'GET',
        cache: 'no-store',
      });

      if (!response.ok) {
        _publicAppSettingsCache = fallback;
        return fallback;
      }

      const payload = await response.json().catch(() => null);
      const next: PublicAppSettings = {
        launcherEnabled:
          typeof payload?.launcherEnabled === 'boolean'
            ? payload.launcherEnabled
            : fallback.launcherEnabled,
        termsOfUseUrl:
          typeof payload?.termsOfUseUrl === 'string'
            ? payload.termsOfUseUrl.trim()
            : fallback.termsOfUseUrl,
        privacyPolicyUrl:
          typeof payload?.privacyPolicyUrl === 'string'
            ? payload.privacyPolicyUrl.trim()
            : fallback.privacyPolicyUrl,
      };

      _publicAppSettingsCache = next;
      return next;
    })().finally(() => {
      _publicAppSettingsFetchPromise = null;
    });

    return _publicAppSettingsFetchPromise;
  } catch {
    return fallback;
  }
}

// ドメイン音声設定のメモリキャッシュ（ページリロードまで有効）
let _domainVoiceCache: Map<string, { ttsBackend?: string; stylebertvits2ModelId?: string; stylebertvits2Style?: string }> | null = null;
let _domainVoiceFetchPromise: Promise<void> | null = null;

async function ensureDomainVoiceCache(): Promise<void> {
  if (_domainVoiceCache !== null) return;
  if (_domainVoiceFetchPromise) {
    return _domainVoiceFetchPromise;
  }
  _domainVoiceFetchPromise = fetchPublicDomainOptions().then((domains) => {
    _domainVoiceCache = new Map();
    for (const domain of domains) {
      _domainVoiceCache.set(domain.id, {
        ttsBackend: domain.ttsBackend || '',
        stylebertvits2ModelId: domain.stylebertvits2ModelId || '',
        stylebertvits2Style: domain.stylebertvits2Style || '',
      });
    }
  }).catch(() => {
    _domainVoiceCache = new Map();
  });
  return _domainVoiceFetchPromise;
}

/**
 * ドメインIDに対応する音声モデル設定を取得する
 * stylebertvits2ModelId / stylebertvits2Style が空の場合はグローバル設定にフォールバック
 */
export async function getDomainVoiceConfig(domainId: string): Promise<{
  ttsBackend?: string;
  stylebertvits2ModelId?: string;
  stylebertvits2Style?: string;
}> {
  await ensureDomainVoiceCache();
  return _domainVoiceCache?.get(domainId) ?? {};
}
