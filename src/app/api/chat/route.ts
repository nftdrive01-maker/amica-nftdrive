import { NextRequest } from "next/server";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { messages, model, ...rest } = body;

    // 3. コンテキスト（システムプロンプト）のサーバーサイド注入
    const systemPrompt = {
      role: "system",
      content: "あなたは〇〇市の公式AIコンシェルジュです。丁寧で親しみやすい公務員として、住民の質問に短く的確に答えてください。"
    };

    // 先頭にシステムプロンプトを挿入。すでにシステムプロンプトがある場合は上書きするなどのロジックも可能ですが、
    // ここでは強制的に先頭に注入します。
    const newMessages = [systemPrompt, ...messages.filter((m: any) => m.role !== "system")];

    // ローカルのOllamaへリクエストをプロキシ (直接ローカルホストを叩く)
    const ollamaUrl = "http://127.0.0.1:11434/api/chat";
    const res = await fetch(ollamaUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: model,
        messages: newMessages,
        ...rest,
      }),
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
