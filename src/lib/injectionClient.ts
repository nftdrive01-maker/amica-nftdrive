/**
 * Injection Tool クライアント
 * 送信前インターセプト時に injection-tool に問い合わせるロジック
 */

import { InjectionInterceptRequest, InjectionInterceptResponse } from '@/types/injection';
import { config } from '@/utils/config';
import { getCachedInjection, cacheInjection } from '@/lib/injectionCache';

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
        : process.env.NEXT_PUBLIC_INJECTION_TOOL_URL || 'http://localhost:4001';

    const timeoutMs = parseInt(
      typeof document !== 'undefined' ? config('injection_tool_timeout_ms') : '2000',
      10
    );

    if (!enabled) {
      return buildEnvFallback(targetDomainId);
    }

    if (!url) {
      return buildEnvFallback(targetDomainId);
    }

    const endpoint = new URL('/api/intercept', url).toString();

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
        console.warn('Injection API request timed out, trying cache fallback');
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
        : process.env.NEXT_PUBLIC_INJECTION_TOOL_URL || 'http://localhost:4001';

    if (!url) return false;

    const endpoint = new URL('/api/health', url).toString();

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

export async function fetchPublicDomainOptions(): Promise<Array<{ id: string; label: string }>> {
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
        : process.env.NEXT_PUBLIC_INJECTION_TOOL_URL || 'http://localhost:4001';

    if (!url) {
      return [];
    }

    const endpoint = new URL('/api/public/domains', url).toString();
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 1500);

    try {
      const response = await fetch(endpoint, {
        method: 'GET',
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (!response.ok) {
        return [];
      }

      const payload = await response.json();
      if (!Array.isArray(payload?.domains)) {
        return [];
      }

      return payload.domains
        .filter((domain: any) => typeof domain?.id === 'string' && typeof domain?.name === 'string')
        .map((domain: any) => ({ id: domain.id, label: domain.name }));
    } catch {
      clearTimeout(timeoutId);
      return [];
    }
  } catch {
    return [];
  }
}
