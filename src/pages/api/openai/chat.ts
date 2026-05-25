import type { NextApiRequest, NextApiResponse } from "next";
import { readServerConfig } from "@/features/externalAPI/dataHelper";
import { requireProtectedApiRoute } from '@/lib/apiSecurity';

type ConfigRecord = Record<string, string | undefined>;

function getStoredConfigValue(config: ConfigRecord, key: string): string {
  const value = config[key];
  return typeof value === "string" ? value : "";
}

function getServerValue(config: ConfigRecord, key: string, envValue?: string): string {
  return getStoredConfigValue(config, key) || envValue || "";
}

export const config = {
  api: {
    responseLimit: false,
  },
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!requireProtectedApiRoute(req, res, {
    publicEnvVar: 'AMICA_OPENAI_PROXY_PUBLIC',
    routeName: 'OpenAI proxy',
  })) {
    return;
  }

  if (req.method !== "POST") {
    res.setHeader("Allow", ["POST"]);
    return res.status(405).end(`Method ${req.method} Not Allowed`);
  }

  const { messages, mode = "chat" } = req.body ?? {};
  if (!Array.isArray(messages)) {
    return res.status(400).json({ error: "messages are required" });
  }

  if (mode !== "chat" && mode !== "vision") {
    return res.status(400).json({ error: "mode must be chat or vision" });
  }

  const storedConfig = readServerConfig();
  const apiKey = getServerValue(
    storedConfig,
    mode === "vision" ? "vision_openai_apikey" : "openai_apikey",
    mode === "vision"
      ? process.env.VISION_OPENAI_APIKEY || process.env.NEXT_PUBLIC_VISION_OPENAI_APIKEY
      : process.env.OPENAI_APIKEY || process.env.AMICA_OPENAI_APIKEY || process.env.NEXT_PUBLIC_OPENAI_APIKEY,
  );
  const url = getServerValue(
    storedConfig,
    mode === "vision" ? "vision_openai_url" : "openai_url",
    mode === "vision" ? process.env.NEXT_PUBLIC_VISION_OPENAI_URL : process.env.NEXT_PUBLIC_OPENAI_URL,
  );
  const model = getServerValue(
    storedConfig,
    mode === "vision" ? "vision_openai_model" : "openai_model",
    mode === "vision" ? process.env.NEXT_PUBLIC_VISION_OPENAI_MODEL : process.env.NEXT_PUBLIC_OPENAI_MODEL,
  );

  if (!apiKey) {
    return res.status(400).json({ error: "OpenAI API key is not configured on the server" });
  }

  if (!url || !model) {
    return res.status(400).json({ error: "OpenAI URL or model is not configured" });
  }

  const upstream = await fetch(`${url.replace(/\/$/, "")}/v1/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`,
      "HTTP-Referer": "https://amica.arbius.ai",
      "X-Title": "Amica",
    },
    body: JSON.stringify({
      model,
      messages,
      stream: true,
      max_tokens: 400,
    }),
  });

  if (!upstream.ok || !upstream.body) {
    const errorText = await upstream.text().catch(() => "");
    return res.status(upstream.status || 500).json({
      error: errorText || `OpenAI chat error (${upstream.status})`,
    });
  }

  res.status(upstream.status);
  res.setHeader("Content-Type", upstream.headers.get("content-type") || "text/event-stream; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");

  const reader = upstream.body.getReader();
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      res.write(Buffer.from(value));
    }
  } catch (error) {
    console.error("Failed to proxy OpenAI response", error);
  } finally {
    reader.releaseLock();
    res.end();
  }
}