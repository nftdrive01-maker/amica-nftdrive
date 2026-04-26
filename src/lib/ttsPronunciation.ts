import { config } from '@/utils/config';

interface PronunciationRule {
  id?: string;
  from: string;
  to: string;
  priority?: number;
  domainId?: string;
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
      : process.env.NEXT_PUBLIC_INJECTION_TOOL_URL || 'http://localhost:4001';

  if (!enabled || !baseUrl) {
    return applyRules(message, fallbackRules);
  }

  const now = Date.now();
  const cacheTtlMs = 5 * 60 * 1000;

  if (inMemoryCache && now - inMemoryCache.at < cacheTtlMs && inMemoryCache.domainId === domainId) {
    return applyRules(message, inMemoryCache.rules);
  }

  try {
    const endpoint = new URL('/api/public/pronunciations', baseUrl);
    if (domainId) {
      endpoint.searchParams.set('domainId', domainId);
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 1500);

    try {
      const res = await fetch(endpoint.toString(), {
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
