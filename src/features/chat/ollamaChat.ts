import { Message } from "./messages";
import { buildPrompt } from "@/utils/buildPrompt";
import { config } from '@/utils/config';

async function buildOllamaError(res: Response, fallbackLabel: string): Promise<Error> {
  let retryAfterSeconds = '';
  let message = `${fallbackLabel} (${res.status})`;

  try {
    const payload = await res.json().catch(() => null);
    const payloadMessage = typeof payload?.error === 'string' && payload.error.trim()
      ? payload.error.trim()
      : '';
    const payloadRetryAfter = payload?.retryAfterSeconds;

    if (payloadMessage) {
      message = payloadMessage;
    }

    if (typeof payloadRetryAfter === 'number' && Number.isFinite(payloadRetryAfter) && payloadRetryAfter > 0) {
      retryAfterSeconds = String(Math.floor(payloadRetryAfter));
    }
  } catch {
    // ignore json parse failure
  }

  if (!retryAfterSeconds) {
    const headerRetryAfter = res.headers.get('Retry-After');
    if (headerRetryAfter && /^\d+$/.test(headerRetryAfter.trim())) {
      retryAfterSeconds = headerRetryAfter.trim();
    }
  }

  if (res.status === 429) {
    return new Error(
      `RATE_LIMITED: レート制限中です。${retryAfterSeconds ? `${retryAfterSeconds}秒ほど待ってから再試行してください。` : '少し待ってから再試行してください。'}`
    );
  }

  return new Error(message);
}

function mergeChunkWithOverlap(
  assembledAssistantText: string,
  messagePiece: string,
): { nextAssembled: string; normalizedPiece: string } {
  if (!messagePiece) {
    return { nextAssembled: assembledAssistantText, normalizedPiece: "" };
  }

  // 累積全文チャンク（全文再送）: すでに組み立て済み部分を差し引く
  if (messagePiece.startsWith(assembledAssistantText)) {
    const normalizedPiece = messagePiece.slice(assembledAssistantText.length);
    return {
      nextAssembled: assembledAssistantText + normalizedPiece,
      normalizedPiece,
    };
  }

  // 完全な再送チャンク
  if (assembledAssistantText.endsWith(messagePiece)) {
    return { nextAssembled: assembledAssistantText, normalizedPiece: "" };
  }

  // 部分オーバーラップ（例: assembled='abc123', piece='123def'）
  const maxOverlap = Math.min(assembledAssistantText.length, messagePiece.length);
  let overlapLength = 0;
  for (let i = maxOverlap; i > 0; i--) {
    if (assembledAssistantText.endsWith(messagePiece.slice(0, i))) {
      overlapLength = i;
      break;
    }
  }

  const normalizedPiece = messagePiece.slice(overlapLength);
  return {
    nextAssembled: assembledAssistantText + normalizedPiece,
    normalizedPiece,
  };
}

export async function getOllamaChatResponseStream(messages: Message[]) {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  const res = await fetch(`/api/chat`, {
    headers: headers,
    method: "POST",
    body: JSON.stringify({
      model: config("ollama_model"),
      messages,
    }),
  });

  const reader = res.body?.getReader();
  if (res.status !== 200 || ! reader) {
    throw await buildOllamaError(res, `Ollama chat error (${res.status})`);
  }

  const stream = new ReadableStream({
    async start(controller: ReadableStreamDefaultController) {
      const decoder = new TextDecoder("utf-8");
      let buffer = "";
      let assembledAssistantText = "";
      try {
        // Ollama は NDJSON で返すため、チャンク境界を跨ぐ行をバッファで連結して解析する
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });

          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";

          for (const line of lines) {
            const jsonResponse = line.trim();
            if (!jsonResponse) {
              continue;
            }
            try {
              const json = JSON.parse(jsonResponse);
              const messagePiece = json?.message?.content;
              if (!!messagePiece) {
                const merged = mergeChunkWithOverlap(
                  assembledAssistantText,
                  messagePiece,
                );
                assembledAssistantText = merged.nextAssembled;
                const normalizedPiece = merged.normalizedPiece;

                if (normalizedPiece) {
                  controller.enqueue(normalizedPiece);
                }
              }
            } catch (error) {
              console.error(error);
            }
          }
        }

        // ループ終了後に末尾バッファをフラッシュ
        const tail = (buffer + decoder.decode()).trim();
        if (tail) {
          try {
            const json = JSON.parse(tail);
            const messagePiece = json?.message?.content;
            if (!!messagePiece) {
              const merged = mergeChunkWithOverlap(
                assembledAssistantText,
                messagePiece,
              );
              assembledAssistantText = merged.nextAssembled;
              const normalizedPiece = merged.normalizedPiece;

              if (normalizedPiece) {
                controller.enqueue(normalizedPiece);
              }
            }
          } catch (error) {
            console.error(error);
          }
        }
      } catch (error) {
        console.error(error);
        controller.error(error);
      } finally {
        reader.releaseLock();
        controller.close();
      }
    },
    async cancel() {
      await reader?.cancel();
      reader.releaseLock();
    }
  });

  return stream;
}

export async function getOllamaVisionChatResponse(messages: Message[], imageData: string) {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  const res = await fetch(`/api/chat`, {
    headers: headers,
    method: "POST",
    body: JSON.stringify({
      model: config("vision_ollama_model"),
      messages,
      images: [imageData],
      stream: false,
    }),
  });

  if (res.status !== 200) {
    throw await buildOllamaError(res, `Ollama chat error (${res.status})`);
  }

  const json = await res.json();
  return json.response;
}
