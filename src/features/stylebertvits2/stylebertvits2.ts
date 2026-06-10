import { config } from "@/utils/config";
import { normalizeTtsPronunciation } from '@/lib/ttsPronunciation';
import { getDomainVoiceConfig } from '@/lib/injectionClient';

async function buildStyleBertVits2Error(res: Response): Promise<Error> {
  let message = `Style-Bert-VITS2 API Error (${res.status})`;
  let retryAfterSeconds = '';

  try {
    const payload = await res.json().catch(() => null);
    const payloadMessage = typeof payload?.error === 'string' && payload.error.trim()
      ? payload.error.trim()
      : '';
    const payloadDetail = typeof payload?.detail === 'string' && payload.detail.trim()
      ? payload.detail.trim()
      : '';
    const payloadRetryAfter = payload?.retryAfterSeconds;

    if (payloadMessage) {
      message = payloadDetail ? `${payloadMessage}: ${payloadDetail}` : payloadMessage;
    }

    if (typeof payloadRetryAfter === 'number' && Number.isFinite(payloadRetryAfter) && payloadRetryAfter > 0) {
      retryAfterSeconds = String(Math.floor(payloadRetryAfter));
    }
  } catch {
    const text = await res.text().catch(() => '');
    if (text.trim()) {
      message = `Style-Bert-VITS2 API Error (${res.status}): ${text.trim()}`;
    }
  }

  if (!retryAfterSeconds) {
    const headerRetryAfter = res.headers.get('Retry-After');
    if (headerRetryAfter && /^\d+$/.test(headerRetryAfter.trim())) {
      retryAfterSeconds = headerRetryAfter.trim();
    }
  }

  if (res.status === 429) {
    return new Error(
      `RATE_LIMITED: 音声生成のレート制限中です。${retryAfterSeconds ? `${retryAfterSeconds}秒ほど待ってから再試行してください。` : '少し待ってから再試行してください。'}`
    );
  }

  return new Error(message);
}

export async function stylebertvits2(message: string, domainId?: string) {
  try {
    const spokenText = await normalizeTtsPronunciation(message, domainId);

    // ドメインに専用モデルID/スタイルが設定されていればそちらを使用する
    let modelId = config("stylebertvits2_model_id");
    let style = config("stylebertvits2_style");
    if (domainId) {
      const domainConfig = await getDomainVoiceConfig(domainId);
      if (domainConfig.stylebertvits2ModelId) modelId = domainConfig.stylebertvits2ModelId;
      if (domainConfig.stylebertvits2Style) style = domainConfig.stylebertvits2Style;
    }

    const res = await fetch("/api/tts", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        text: spokenText,
        // server_url はサーバー側環境変数 STYLEBERTVITS2_URL で管理するため送信しない
        model_id: modelId,
        style: style,
      }),
    });

    if (!res.ok) {
      throw await buildStyleBertVits2Error(res);
    }

    const arrayBuffer = await res.arrayBuffer();
    return { audio: arrayBuffer };
  } catch (err: any) {
    console.error("Browser fetch error in stylebertvits2.ts:", err);
    throw new Error(`Browser fetch error: ${err.message}`);
  }
}
