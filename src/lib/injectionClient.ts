/**
 * Injection Tool クライアント
 * 送信前インターセプト時に injection-tool に問い合わせるロジック
 */

import { InjectionInterceptRequest, InjectionInterceptResponse } from '@/types/injection';
import { config } from '@/utils/config';
import { getCachedInjection, cacheInjection } from '@/lib/injectionCache';

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

/**
 * Injection Tool に問い合わせて動的コンテキストを取得
 * fail-open: 失敗時は空オブジェクト（またはキャッシュ）を返し、Amica側で素通し処理する
 */
export async function fetchInjectedContext(
  userText: string,
  domainId?: string,
  sessionId?: string,
  messageHistory?: Array<{ role: string; content: string }>
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
      userText,
      domainId: targetDomainId,
      sessionId,
      messageHistory: messageHistory as Array<{ role: 'user' | 'assistant' | 'system'; content: string }>,
      timestamp: Date.now(),
    };

    // タイムアウト付きで Fetch
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (response.ok) {
        const data = await response.json();
        if (data && typeof data === 'object') {
          // キャッシュに保存
          cacheInjection(targetDomainId, data);
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
        return buildEnvFallback(targetDomainId);
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
      return buildEnvFallback(targetDomainId);
    }
  } catch (err) {
    console.warn('Error in fetchInjectedContext:', err);
    const domain = domainId || 'consultation';
    const cached = getCachedInjection(domain);
    if (cached) {
      return cached;
    }
    return buildEnvFallback(domain);
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

export async function fetchPublicDomainOptions(): Promise<Array<{
  id: string;
  label: string;
  chronicleAttached?: boolean;
  bgUrl?: string;
  characterName?: string;
  vrmEnabled?: boolean;
  vrmUrl?: string;
  imageAvatarIdleUrl?: string;
  imageAvatarTalkUrl?: string;
  imageAvatarTalkIntervalMs?: number;
  stylebertvits2ModelId?: string;
  stylebertvits2Style?: string;
  ttsMuted?: boolean;
  gazeWakeEnabled?: boolean;
  gazeHoldMs?: number;
  gazeReleaseMs?: number;
  gazeCooldownMs?: number;
  gazeGreetings?: string[];
  gazeDebugUiEnabled?: boolean;
}>> {
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
            chronicleAttached: Boolean(domain.chronicleAttached),
            bgUrl: typeof domain.bgUrl === 'string' ? domain.bgUrl.trim() : '',
            characterName: typeof domain.characterName === 'string' ? domain.characterName.trim() : '',
            vrmEnabled: typeof domain.vrmEnabled === 'boolean' ? domain.vrmEnabled : true,
            vrmUrl: typeof domain.vrmUrl === 'string' ? domain.vrmUrl.trim() : '',
            imageAvatarIdleUrl:
              typeof domain.imageAvatarIdleUrl === 'string' ? domain.imageAvatarIdleUrl.trim() : '',
            imageAvatarTalkUrl:
              typeof domain.imageAvatarTalkUrl === 'string' ? domain.imageAvatarTalkUrl.trim() : '',
            imageAvatarTalkIntervalMs:
              typeof domain.imageAvatarTalkIntervalMs === 'number' ? domain.imageAvatarTalkIntervalMs : undefined,
            stylebertvits2ModelId:
              typeof domain.stylebertvits2ModelId === 'string'
                ? domain.stylebertvits2ModelId.trim()
                : '',
            stylebertvits2Style:
              typeof domain.stylebertvits2Style === 'string'
                ? domain.stylebertvits2Style.trim()
                : '',
            ttsMuted: typeof domain.ttsMuted === 'boolean' ? domain.ttsMuted : undefined,
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
          chronicleAttached?: boolean;
          bgUrl?: string;
          characterName?: string;
          vrmEnabled?: boolean;
          vrmUrl?: string;
          imageAvatarIdleUrl?: string;
          imageAvatarTalkUrl?: string;
          imageAvatarTalkIntervalMs?: number;
          stylebertvits2ModelId?: string;
          stylebertvits2Style?: string;
          ttsMuted?: boolean;
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

        return Array.from(unique.values());
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

// ドメイン音声設定のメモリキャッシュ（ページリロードまで有効）
let _domainVoiceCache: Map<string, { stylebertvits2ModelId?: string; stylebertvits2Style?: string }> | null = null;
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
  stylebertvits2ModelId?: string;
  stylebertvits2Style?: string;
}> {
  await ensureDomainVoiceCache();
  return _domainVoiceCache?.get(domainId) ?? {};
}
