import { config } from '@/utils/config';

interface PronunciationRule {
  id?: string;
  from: string;
  to: string;
  priority?: number;
  domainId?: string;
}

/**
 * base が相対パス（BFFプロキシ）でも正しくエンドポイントを生成する
 * 例: base='/api/injection', apiPath='/api/public/pronunciations' → '/api/injection/public/pronunciations'
 */
function buildEndpoint(base: string, apiPath: string, params?: URLSearchParams): string {
  let url: string;
  if (base.startsWith('http://') || base.startsWith('https://')) {
    const u = new URL(apiPath, base);
    if (params) params.forEach((v, k) => u.searchParams.set(k, v));
    return u.toString();
  }
  const suffix = apiPath.replace(/^\/api/, '');
  url = base.replace(/\/$/, '') + suffix;
  if (params && params.toString()) url += '?' + params.toString();
  return url;
}

let inMemoryCache: {
  at: number;
  domainId?: string;
  rules: PronunciationRule[];
} | null = null;

function parseFallbackRules(): PronunciationRule[] {
  try {
    const raw =
      typeof document !== 'undefined'
        ? config('injection_tts_pronunciation_fallback_rules')
        : process.env.NEXT_PUBLIC_INJECTION_TTS_PRONUNCIATION_FALLBACK_RULES || '[]';

    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed
      .filter((item) => item && typeof item === 'object')
      .filter((item) => typeof item.from === 'string' && typeof item.to === 'string');
  } catch {
    return [];
  }
}

function applyRules(message: string, rules: PronunciationRule[]): string {
  let result = message;
  const sorted = [...rules].sort((a, b) => (b.priority || 0) - (a.priority || 0));

  for (const rule of sorted) {
    if (!rule.from || !rule.to) {
      continue;
    }

    result = result.split(rule.from).join(rule.to);
  }

  return result;
}

export async function normalizeTtsPronunciation(message: string, domainId?: string): Promise<string> {
  const fallbackRules = parseFallbackRules();

  const enabled =
    typeof document !== 'undefined'
      ? config('injection_tool_enabled').toLowerCase() === 'true'
      : process.env.NEXT_PUBLIC_INJECTION_TOOL_ENABLED !== 'false';

  const baseUrl =
    typeof document !== 'undefined'
      ? config('injection_tool_url')
      : process.env.NEXT_PUBLIC_INJECTION_TOOL_URL || '/api/injection';

  if (!enabled || !baseUrl) {
    return applyRules(message, fallbackRules);
  }

  const now = Date.now();
  const cacheTtlMs = 5 * 60 * 1000;

  if (inMemoryCache && now - inMemoryCache.at < cacheTtlMs && inMemoryCache.domainId === domainId) {
    return applyRules(message, inMemoryCache.rules);
  }

  try {
    const qs = new URLSearchParams();
    if (domainId) qs.set('domainId', domainId);
    const endpoint = buildEndpoint(baseUrl, '/api/public/pronunciations', qs);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 1500);

    try {
      const res = await fetch(endpoint, {
        method: 'GET',
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!res.ok) {
        return applyRules(message, fallbackRules);
      }

      const payload = await res.json();
      const rules = Array.isArray(payload?.rules)
        ? payload.rules.filter(
            (item: any) => item && typeof item.from === 'string' && typeof item.to === 'string'
          )
        : fallbackRules;

      inMemoryCache = {
        at: now,
        domainId,
        rules,
      };

      return applyRules(message, rules);
    } catch {
      clearTimeout(timeoutId);
      return applyRules(message, fallbackRules);
    }
  } catch {
    return applyRules(message, fallbackRules);
  }
}
