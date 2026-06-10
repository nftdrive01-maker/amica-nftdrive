import { NextRequest } from "next/server";
import { requireProtectedAppRoute } from '@/lib/apiSecurity';
import { requirePublicRateLimit } from '@/lib/publicRateLimit';

function getStyleBertVits2BaseUrlCandidates() {
  const candidates = [
    process.env.STYLEBERTVITS2_URL,
    process.env.NEXT_PUBLIC_STYLEBERTVITS2_SERVER_URL,
    "http://host.docker.internal:5000",
    "http://127.0.0.1:5000",
  ].filter((value): value is string => Boolean(value));

  const expandedCandidates = candidates.flatMap((value) => {
    if (value.includes("sbv2:")) {
      return [value, value.replace(/\/\/sbv2(?=[:/]|$)/, "//host.docker.internal")];
    }

    return [value];
  });

  return [...new Set(expandedCandidates)].map((value) => value.replace(/\/$/, ""));
}

export async function POST(req: NextRequest) {
  const protectionResponse = requireProtectedAppRoute(req, {
    publicEnvVar: 'AMICA_TTS_PROXY_PUBLIC',
    routeName: 'tts proxy',
  });
  if (protectionResponse) {
    return protectionResponse;
  }

  const rateLimitResponse = await requirePublicRateLimit(req, 'tts proxy', 'tts');
  if (rateLimitResponse) {
    return rateLimitResponse;
  }

  try {
    const body = await req.json();
    const { text, model_id, style } = body;

    if (!text) {
      return new Response(JSON.stringify({ error: "Text is required" }), { status: 400 });
    }

    // クエリパラメータの構築
    const params = new URLSearchParams({
      text: text,
      model_id: model_id?.toString() || "0",
      style: style || "Neutral"
    });

    const candidates = getStyleBertVits2BaseUrlCandidates();
    let res: Response | null = null;
    let lastError: unknown = null;

    for (const baseUrl of candidates) {
      try {
        const apiUrl = `${baseUrl}/voice?${params.toString()}`;
        res = await fetch(apiUrl, {
          method: "GET", // Style-Bert-VITS2の仕様に準拠 (GETリクエストで音声データを取得)
        });

        if (res.ok) {
          break;
        }

        const upstreamText = await res.text().catch(() => '');
        console.error(`Style-Bert-VITS2 Error from ${baseUrl}: ${res.status} ${res.statusText}`, {
          textLength: String(text || '').length,
          textPreview: String(text || '').slice(0, 120),
          upstreamText,
        });
        return new Response(
          JSON.stringify({
            error: `Style-Bert-VITS2 proxy error: ${res.statusText}`,
            status: res.status,
            detail: upstreamText,
          }),
          {
            status: res.status,
            headers: { "Content-Type": "application/json" },
          }
        );
      } catch (error) {
        lastError = error;
      }
    }

    if (!res || !res.ok) {
      throw lastError ?? new Error("Style-Bert-VITS2 server unreachable");
    }

    // wavデータをブラウザに返却
    const arrayBuffer = await res.arrayBuffer();
    return new Response(arrayBuffer, {
      headers: {
        "Content-Type": "audio/wav",
      },
    });

  } catch (error: any) {
    console.error("TTS Proxy API Error:", error);
    return new Response(JSON.stringify({ error: "Style-Bert-VITS2サーバーに接続できません。ローカルでAPIが稼働しているか確認してください。" }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
}
