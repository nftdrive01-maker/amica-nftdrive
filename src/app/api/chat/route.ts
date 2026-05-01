import { NextRequest } from "next/server";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { messages, model, ...rest } = body;

    // クライアント（chat.ts）からsystemメッセージが来ていればそれを優先する
    // systemが無い場合のみ環境変数で補完する
    const hasClientSystem = Array.isArray(messages) && messages.some((m: any) => m.role === "system");

    const newMessages = hasClientSystem
      ? messages
      : [
          {
            role: "system",
            content:
              process.env.ARKI_SYSTEM_PROMPT ||
              process.env.NEXT_PUBLIC_SYSTEM_PROMPT ||
              "【キャラクター設定】\nあなたは公式AIコンシェルジュです。\n丁寧で親しみやすく、質問に短く的確に回答してください。",
          },
          ...messages,
        ];

    const payload = {
      model,
      messages: newMessages,
      ...rest,
    };

        // デバッグログ（必要時のみ）
    if (process.env.CHAT_DEBUG_LOG === "true") {
      const lastUser = [...newMessages].reverse().find((m: any) => m?.role === "user");
      console.log("[CHAT->OLLAMA]", JSON.stringify({
        model: payload.model,
        stream: (payload as any).stream,
        options: (payload as any).options,
        messageCount: payload.messages?.length ?? 0,
        lastUser: lastUser?.content ?? null,
      }, null, 2));
    }


    // ローカルのOllamaへリクエストをプロキシ (直接ローカルホストを叩く)
    const ollamaUrl = "http://127.0.0.1:11434/api/chat";
    const res = await fetch(ollamaUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      return new Response(`Ollama proxy error: ${res.statusText}`, { status: res.status });
    }

    // Ollamaからのストリーミングレスポンスをそのままフロントエンドへ返却
    return new Response(res.body, {
      headers: {
        "Content-Type": res.headers.get("Content-Type") || "application/json",
      },
    });

  } catch (error: any) {
    console.error("BFF API Error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
}
