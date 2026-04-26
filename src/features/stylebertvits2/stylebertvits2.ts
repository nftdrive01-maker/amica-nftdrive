import { config } from "@/utils/config";
import { normalizeTtsPronunciation } from '@/lib/ttsPronunciation';

export async function stylebertvits2(message: string, domainId?: string) {
  try {
    const spokenText = await normalizeTtsPronunciation(message, domainId);

    const res = await fetch("/api/tts", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        text: spokenText,
        server_url: config("stylebertvits2_server_url"),
        model_id: config("stylebertvits2_model_id"),
        style: config("stylebertvits2_style"),
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
