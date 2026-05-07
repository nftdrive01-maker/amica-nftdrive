import { config } from "@/utils/config";
import { normalizeTtsPronunciation } from '@/lib/ttsPronunciation';
import { getDomainVoiceConfig } from '@/lib/injectionClient';

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
      const text = await res.text();
      throw new Error(`Style-Bert-VITS2 API Error (${res.status}): ${text}`);
    }

    const arrayBuffer = await res.arrayBuffer();
    return { audio: arrayBuffer };
  } catch (err: any) {
    console.error("Browser fetch error in stylebertvits2.ts:", err);
    throw new Error(`Browser fetch error: ${err.message}`);
  }
}
