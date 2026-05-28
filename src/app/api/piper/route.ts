import { NextRequest } from 'next/server';
import { requireProtectedAppRoute } from '@/lib/apiSecurity';
import { requirePublicRateLimit } from '@/lib/publicRateLimit';

function getPiperBaseUrlCandidates(bodyUrl?: string) {
  const candidates = [
    process.env.PIPER_URL,
    process.env.NEXT_PUBLIC_PIPER_URL,
    bodyUrl,
  ].filter((value): value is string => Boolean(value && value.trim()));

  const expandedCandidates = candidates.flatMap((value) => {
    const normalized = value.trim().replace(/\/$/, '');
    if (normalized.includes('localhost:')) {
      return [normalized, normalized.replace('//localhost', '//host.docker.internal')];
    }

    if (normalized.includes('127.0.0.1:')) {
      return [normalized, normalized.replace('//127.0.0.1', '//host.docker.internal')];
    }

    return [normalized];
  });

  return [...new Set(expandedCandidates)];
}

export async function POST(req: NextRequest) {
  const protectionResponse = requireProtectedAppRoute(req, {
    publicEnvVar: 'AMICA_TTS_PROXY_PUBLIC',
    routeName: 'piper proxy',
  });
  if (protectionResponse) {
    return protectionResponse;
  }

  const rateLimitResponse = await requirePublicRateLimit(req, 'piper proxy', 'tts');
  if (rateLimitResponse) {
    return rateLimitResponse;
  }

  try {
    const body = await req.json();
    const text = typeof body?.text === 'string' ? body.text.trim() : '';
    const requestedUrl = typeof body?.url === 'string' ? body.url.trim() : '';
    const language = (process.env.PIPER_DEFAULT_LANGUAGE || 'ja-en-zh-es-fr-pt').trim() || 'ja-en-zh-es-fr-pt';
    const lengthScale = Number(process.env.PIPER_LENGTH_SCALE || '1.5');
    const noiseScale = Number(process.env.PIPER_NOISE_SCALE || '0.667');
    const noiseW = Number(process.env.PIPER_NOISE_W || '0.8');
    const resolvedLengthScale = Number.isFinite(lengthScale) && lengthScale > 0 ? lengthScale : 1.5;

    if (!text) {
      return new Response(JSON.stringify({ error: 'Text is required' }), { status: 400 });
    }

    const candidates = getPiperBaseUrlCandidates(requestedUrl);
    let res: Response | null = null;
    let lastError: unknown = null;

    for (const baseUrl of candidates) {
      try {
        const url = new URL('/synthesize', baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`);
        url.searchParams.set('text', text);
        url.searchParams.set('language', language);
        url.searchParams.set('speaker_id', '0');
        url.searchParams.set('noise_scale', String(noiseScale));
        url.searchParams.set('length_scale', String(resolvedLengthScale));
        url.searchParams.set('noise_w', String(noiseW));

        res = await fetch(url.toString(), {
          method: 'GET',
          headers: {
            Accept: 'audio/wav',
          },
        });

        if (res.ok) {
          break;
        }

        lastError = new Error(`Piper error from ${baseUrl}: ${res.status} ${res.statusText}`);
      } catch (error) {
        lastError = error;
      }
    }

    if (!res || !res.ok) {
      throw lastError ?? new Error('Piper server unreachable');
    }

    const arrayBuffer = await res.arrayBuffer();
    return new Response(arrayBuffer, {
      headers: {
        'Content-Type': res.headers.get('Content-Type') || 'audio/wav',
      },
    });
  } catch (error) {
    console.error('Piper Proxy API Error:', error);
    return new Response(
      JSON.stringify({ error: 'Piperサーバーに接続できません。URLとコンテナ起動状態を確認してください。' }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      },
    );
  }
}