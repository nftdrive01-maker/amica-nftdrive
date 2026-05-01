import { NextRequest } from "next/server";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { text, model_id, style } = body;

    if (!text) {
      return new Response(JSON.stringify({ error: "Text is required" }), { status: 400 });
    }

    // Style-Bert-VITS2 APIエンドポイント (サーバー環境変数のみ使用。クライアントからの指定は受け付けない)
    const baseUrl = process.env.STYLEBERTVITS2_URL || "http://127.0.0.1:5000";
    
    // クエリパラメータの構築
    const params = new URLSearchParams({
      text: text,
      model_id: model_id?.toString() || "0",
      style: style || "Neutral"
    });

    const apiUrl = `${baseUrl}/voice?${params.toString()}`;

    const res = await fetch(apiUrl, {
      method: "GET", // Style-Bert-VITS2の仕様に準拠 (GETリクエストで音声データを取得)
    });

    if (!res.ok) {
       console.error(`Style-Bert-VITS2 Error: ${res.statusText}`);
       return new Response(`Style-Bert-VITS2 proxy error: ${res.statusText}`, { status: res.status });
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
