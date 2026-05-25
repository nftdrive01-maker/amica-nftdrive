import { NextRequest, NextResponse } from 'next/server';

type PublicRateLimitSettings = {
  maxConcurrentSessions: number;
  chatRequestsPerUserPerMinute: number;
  ttsRequestsPerUserPerMinute: number;
  globalChatRequestsPerMinute: number;
  globalTtsRequestsPerMinute: number;
};

type PublicRateLimitKind = 'chat' | 'tts';

type RateLimitBucket = {
  count: number;
  resetAt: number;
};

const WINDOW_MS = 60_000;
const SETTINGS_CACHE_TTL_MS = 15_000;

const globalPublicRateLimitState = globalThis as typeof globalThis & {
  __amicaPublicRateLimitStore?: Map<string, RateLimitBucket>;
  __amicaPublicRateLimitSettings?: {
    value: PublicRateLimitSettings;
    expiresAt: number;
  };
  __amicaPublicRateLimitCleanupCounter?: number;
};

const rateLimitStore = globalPublicRateLimitState.__amicaPublicRateLimitStore ?? new Map<string, RateLimitBucket>();
globalPublicRateLimitState.__amicaPublicRateLimitStore = rateLimitStore;

function cleanupExpiredBuckets(now: number): void {
  const counter = (globalPublicRateLimitState.__amicaPublicRateLimitCleanupCounter || 0) + 1;
  globalPublicRateLimitState.__amicaPublicRateLimitCleanupCounter = counter;

  if (counter % 100 !== 0) {
    return;
  }

  for (const [key, bucket] of rateLimitStore.entries()) {
    if (bucket.resetAt <= now) {
      rateLimitStore.delete(key);
    }
  }
}

function consumeRateLimit(storeKey: string, limit: number): { allowed: boolean; retryAfterSeconds: number } {
  if (!Number.isFinite(limit) || limit <= 0) {
    return { allowed: true, retryAfterSeconds: 0 };
  }

  const now = Date.now();
  cleanupExpiredBuckets(now);

  const existing = rateLimitStore.get(storeKey);
  const bucket = !existing || existing.resetAt <= now
    ? { count: 0, resetAt: now + WINDOW_MS }
    : existing;

  if (bucket.count >= limit) {
    return {
      allowed: false,
      retryAfterSeconds: Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)),
    };
  }

  bucket.count += 1;
  rateLimitStore.set(storeKey, bucket);
  return { allowed: true, retryAfterSeconds: Math.max(0, Math.ceil((bucket.resetAt - now) / 1000)) };
}

function getClientIp(req: NextRequest): string {
  const cfConnectingIp = String(req.headers.get('cf-connecting-ip') || '').trim();
  if (cfConnectingIp) {
    return cfConnectingIp;
  }

  const forwardedFor = String(req.headers.get('x-forwarded-for') || '').trim();
  if (forwardedFor) {
    return forwardedFor.split(',')[0]?.trim() || 'unknown';
  }

  const realIp = String(req.headers.get('x-real-ip') || '').trim();
  if (realIp) {
    return realIp;
  }

  return 'unknown';
}

function getInjectionInternalBaseUrl(): string {
  return String(
    process.env.INJECTION_TOOL_INTERNAL_URL || process.env.INJECTION_TOOL_URL || 'http://localhost:4001'
  ).replace(/\/$/, '');
}

async function fetchRateLimitSettings(): Promise<PublicRateLimitSettings> {
  const cached = globalPublicRateLimitState.__amicaPublicRateLimitSettings;
  const now = Date.now();
  if (cached && cached.expiresAt > now) {
    return cached.value;
  }

  const fallback = cached?.value || {
    maxConcurrentSessions: 0,
    chatRequestsPerUserPerMinute: 0,
    ttsRequestsPerUserPerMinute: 0,
    globalChatRequestsPerMinute: 0,
    globalTtsRequestsPerMinute: 0,
  };

  try {
    const response = await fetch(`${getInjectionInternalBaseUrl()}/api/public/rate-limit`, {
      method: 'GET',
      cache: 'no-store',
    });

    if (!response.ok) {
      return fallback;
    }

    const payload = await response.json().catch(() => null);
    const value: PublicRateLimitSettings = {
      maxConcurrentSessions:
        typeof payload?.maxConcurrentSessions === 'number' && Number.isFinite(payload.maxConcurrentSessions)
          ? Math.max(0, Math.floor(payload.maxConcurrentSessions))
          : 0,
      chatRequestsPerUserPerMinute:
        typeof payload?.chatRequestsPerUserPerMinute === 'number' && Number.isFinite(payload.chatRequestsPerUserPerMinute)
          ? Math.max(0, Math.floor(payload.chatRequestsPerUserPerMinute))
          : 0,
      ttsRequestsPerUserPerMinute:
        typeof payload?.ttsRequestsPerUserPerMinute === 'number' && Number.isFinite(payload.ttsRequestsPerUserPerMinute)
          ? Math.max(0, Math.floor(payload.ttsRequestsPerUserPerMinute))
          : 0,
      globalChatRequestsPerMinute:
        typeof payload?.globalChatRequestsPerMinute === 'number' && Number.isFinite(payload.globalChatRequestsPerMinute)
          ? Math.max(0, Math.floor(payload.globalChatRequestsPerMinute))
          : 0,
      globalTtsRequestsPerMinute:
        typeof payload?.globalTtsRequestsPerMinute === 'number' && Number.isFinite(payload.globalTtsRequestsPerMinute)
          ? Math.max(0, Math.floor(payload.globalTtsRequestsPerMinute))
          : 0,
    };

    globalPublicRateLimitState.__amicaPublicRateLimitSettings = {
      value,
      expiresAt: now + SETTINGS_CACHE_TTL_MS,
    };

    return value;
  } catch {
    return fallback;
  }
}

export async function requirePublicRateLimit(
  req: NextRequest,
  routeLabel: string,
  kind: PublicRateLimitKind,
): Promise<NextResponse | null> {
  const settings = await fetchRateLimitSettings();
  const clientIp = getClientIp(req);
  const perUserLimit = kind === 'tts'
    ? settings.ttsRequestsPerUserPerMinute
    : settings.chatRequestsPerUserPerMinute;
  const globalLimit = kind === 'tts'
    ? settings.globalTtsRequestsPerMinute
    : settings.globalChatRequestsPerMinute;

  const userResult = consumeRateLimit(`public:${kind}:user:${clientIp}`, perUserLimit);
  if (!userResult.allowed) {
    return NextResponse.json(
      {
        error: `${routeLabel} のレート制限に達しました。しばらく待ってから再試行してください。`,
        code: 'RATE_LIMITED',
        retryAfterSeconds: userResult.retryAfterSeconds,
      },
      {
        status: 429,
        headers: {
          'Retry-After': String(userResult.retryAfterSeconds),
        },
      }
    );
  }

  const globalResult = consumeRateLimit(`public:${kind}:global`, globalLimit);
  if (!globalResult.allowed) {
    return NextResponse.json(
      {
        error: `${routeLabel} の全体レート制限に達しました。しばらく待ってから再試行してください。`,
        code: 'RATE_LIMITED',
        retryAfterSeconds: globalResult.retryAfterSeconds,
      },
      {
        status: 429,
        headers: {
          'Retry-After': String(globalResult.retryAfterSeconds),
        },
      }
    );
  }

  return null;
}