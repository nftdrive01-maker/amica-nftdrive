import { Message } from "./messages";

function enqueueOpenAiSsePayload(
  controller: ReadableStreamDefaultController,
  payload: string,
) {
  const trimmed = payload.trim();
  if (!trimmed || trimmed === "[DONE]") {
    return;
  }

  const json = JSON.parse(trimmed);
  const messagePiece = json.choices?.[0]?.delta?.content;
  if (messagePiece) {
    controller.enqueue(messagePiece);
  }
}

async function getResponseStream(
  messages: Message[],
  mode: "chat" | "vision" = "chat",
) {
  const res = await fetch(`/api/openai/chat`, {
    headers: {
      "Content-Type": "application/json",
    },
    method: "POST",
    body: JSON.stringify({
      messages,
      mode,
    }),
  });

  const reader = res.body?.getReader();
  if (res.status !== 200 || ! reader) {
    if (res.status === 401) {
      throw new Error('Invalid OpenAI authentication');
    }
    if (res.status === 402) {
      throw new Error('Payment required');
    }

    throw new Error(`OpenAI chat error (${res.status})`);
  }

  const stream = new ReadableStream({
    async start(controller: ReadableStreamDefaultController) {
      const decoder = new TextDecoder("utf-8");
      let buffer = "";
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });

          const lines = buffer.split(/\r?\n/);
          buffer = lines.pop() ?? "";

          for (const line of lines) {
            const trimmedLine = line.trim();
            if (!trimmedLine || trimmedLine.startsWith(":")) {
              continue;
            }

            if (trimmedLine.startsWith("data:")) {
              enqueueOpenAiSsePayload(controller, trimmedLine.slice(5));
            }
          }
        }

        const tail = (buffer + decoder.decode()).trim();
        if (tail.startsWith("data:")) {
          enqueueOpenAiSsePayload(controller, tail.slice(5));
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

export async function getOpenAiChatResponseStream(messages: Message[]) {
  return getResponseStream(messages, "chat");
}

export async function getOpenAiVisionChatResponse(messages: Message[],) {
  const stream = await getResponseStream(messages, "vision");
  const sreader = await stream.getReader();

  let combined = "";
  while (true) {
    const { done, value } = await sreader.read();
    if (done) break;
    combined += value;
  }

  return combined;
}
