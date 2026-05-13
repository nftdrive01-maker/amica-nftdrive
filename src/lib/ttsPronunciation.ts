import { config } from '@/utils/config';
import { toKana } from 'wanakana';

interface PronunciationRule {
  id?: string;
  from: string;
  to: string;
  priority?: number;
  domainId?: string;
}

interface PronunciationSettings {
  wanaKanaEnabled: boolean;
}

const LATIN_WORD_PATTERN = /https?:\/\/\S+|www\.\S+|[A-Za-z][A-Za-z'-]*/g;

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
  settings: PronunciationSettings;
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

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function isAsciiWordRule(text: string): boolean {
  return /^[A-Za-z0-9 ._+\-]+$/.test(text);
}

function applyRules(message: string, rules: PronunciationRule[]): string {
  let result = message;
  const sorted = [...rules].sort((a, b) => (b.priority || 0) - (a.priority || 0));

  for (const rule of sorted) {
    if (!rule.from || !rule.to) {
      continue;
    }

    const from = rule.from.trim();
    if (!from) {
      continue;
    }

    // ASCII語は大文字小文字の揺れを許容し、単語境界で置換する。
    if (isAsciiWordRule(from)) {
      const pattern = new RegExp(`\\b${escapeRegExp(from)}\\b`, 'gi');
      result = result.replace(pattern, rule.to);
      continue;
    }

    result = result.split(from).join(rule.to);
  }

  return result;
}

function applyWanaKanaFallback(message: string, enabled: boolean): string {
  if (!enabled || !message) {
    return message;
  }

  return message.replace(LATIN_WORD_PATTERN, (segment) => {
    if (/^https?:\/\//i.test(segment) || /^www\./i.test(segment)) {
      return segment;
    }

    if (segment.length < 2 || !/[aeiou]/i.test(segment)) {
      return segment;
    }

    const converted = toKana(segment.toLowerCase());
    return /[ぁ-んァ-ヶ]/.test(converted) ? converted : segment;
  });
}

function applyPronunciationPipeline(
  message: string,
  rules: PronunciationRule[],
  settings: PronunciationSettings,
): string {
  const afterRules = applyRules(message, rules);
  return applyWanaKanaFallback(afterRules, settings.wanaKanaEnabled);
}

export async function normalizeTtsPronunciation(message: string, domainId?: string): Promise<string> {
  const fallbackRules = parseFallbackRules();
  const fallbackSettings: PronunciationSettings = { wanaKanaEnabled: false };

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
    return applyPronunciationPipeline(message, inMemoryCache.rules, inMemoryCache.settings);
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
        return applyPronunciationPipeline(message, fallbackRules, fallbackSettings);
      }

      const payload = await res.json();
      const rules = Array.isArray(payload?.rules)
        ? payload.rules.filter(
            (item: any) => item && typeof item.from === 'string' && typeof item.to === 'string'
          )
        : fallbackRules;
      const settings: PronunciationSettings = {
        wanaKanaEnabled: payload?.settings?.wanaKanaEnabled === true,
      };

      inMemoryCache = {
        at: now,
        domainId,
        rules,
        settings,
      };

      return applyPronunciationPipeline(message, rules, settings);
    } catch {
      clearTimeout(timeoutId);
      return applyPronunciationPipeline(message, fallbackRules, fallbackSettings);
    }
  } catch {
    return applyPronunciationPipeline(message, fallbackRules, fallbackSettings);
  }
}
