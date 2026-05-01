/**
 * BFF Proxy: /api/injection/[...path] → INJECTION_TOOL_INTERNAL_URL/api/[...path]
 *
 * クライアントは NEXT_PUBLIC_INJECTION_TOOL_URL=/api/injection を使う。
 * 外部ブラウザからは Amica サーバーのこのエンドポイントにリクエストが届き、
 * サーバー側でローカルの injection-tool へ転送する。
 * これにより injection-tool のポートを外部に公開する必要がなくなる。
 */

import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const INTERNAL_URL =
  process.env.INJECTION_TOOL_INTERNAL_URL || 'http://localhost:4001';

const INTERNAL_ORIGIN = INTERNAL_URL.replace(/\/$/, '');

function rewriteAssetUrlForBff(url: unknown): string {
  if (typeof url !== 'string' || url.trim() === '') {
    return '';
  }

  const value = url.trim();

  if (value.startsWith('/vrm/') || value.startsWith('/bgimage/')) {
    return `/api/injection-assets${value}`;
  }

  if (value.startsWith('http://') || value.startsWith('https://')) {
    try {
      const parsed = new URL(value);
      const isAssetPath = parsed.pathname.startsWith('/vrm/') || parsed.pathname.startsWith('/bgimage/');
      if (isAssetPath) {
        return `/api/injection-assets${parsed.pathname}${parsed.search}`;
      }
    } catch {
      return value;
    }
  }

  return value;
}

function maybeRewritePublicDomainsPayload(params: { path: string[] }, payload: any): any {
  const isPublicDomains = params.path.length === 2 && params.path[0] === 'public' && params.path[1] === 'domains';
  if (!isPublicDomains) {
    return payload;
  }

  if (!payload || !Array.isArray(payload.domains)) {
    return payload;
  }

  return {
    ...payload,
    domains: payload.domains.map((domain: any) => ({
      ...domain,
      bgUrl: rewriteAssetUrlForBff(domain?.bgUrl),
      vrmUrl: rewriteAssetUrlForBff(domain?.vrmUrl),
    })),
  };
}

function buildTargetUrl(pathSegments: string[], searchString: string): string {
  const apiPath = pathSegments.join('/');
  const base = INTERNAL_URL.replace(/\/$/, '');
  return `${base}/api/${apiPath}${searchString ? '?' + searchString : ''}`;
}

async function proxyRequest(
  req: NextRequest,
  params: { path: string[] }
): Promise<NextResponse> {
  const targetUrl = buildTargetUrl(
    params.path,
    req.nextUrl.searchParams.toString()
  );

  // リクエストヘッダーをコピー（host は除外）
  const headers = new Headers();
  req.headers.forEach((value, key) => {
    if (key.toLowerCase() !== 'host') {
      headers.set(key, value);
    }
  });

  const hasBody = !['GET', 'HEAD', 'OPTIONS'].includes(req.method);
  const body = hasBody ? await req.arrayBuffer() : undefined;

  try {
    const upstream = await fetch(targetUrl, {
      method: req.method,
      headers,
      body: body ? Buffer.from(body) : undefined,
    });

    const contentType = upstream.headers.get('content-type') || '';
    const canRewriteJson =
      req.method === 'GET' &&
      contentType.toLowerCase().includes('application/json') &&
      params.path.length === 2 &&
      params.path[0] === 'public' &&
      params.path[1] === 'domains';

    if (canRewriteJson) {
      const payload = await upstream.json().catch(() => null);
      const rewritten = maybeRewritePublicDomainsPayload(params, payload);

      const responseHeaders = new Headers();
      upstream.headers.forEach((value, key) => {
        if (!['transfer-encoding', 'connection', 'content-length'].includes(key.toLowerCase())) {
          responseHeaders.set(key, value);
        }
      });
      responseHeaders.set('content-type', 'application/json; charset=utf-8');

      return new NextResponse(JSON.stringify(rewritten), {
        status: upstream.status,
        headers: responseHeaders,
      });
    }

    const responseHeaders = new Headers();
    upstream.headers.forEach((value, key) => {
      // transfer-encoding / content-encoding はブラウザが自動処理するため除外
      if (!['transfer-encoding', 'connection'].includes(key.toLowerCase())) {
        responseHeaders.set(key, value);
      }
    });

    const responseBody = await upstream.arrayBuffer();

    return new NextResponse(responseBody, {
      status: upstream.status,
      headers: responseHeaders,
    });
  } catch (err: any) {
    console.error('[injection proxy] upstream error:', err);
    return NextResponse.json(
      { error: 'injection-tool に接続できません', detail: err?.message },
      { status: 502 }
    );
  }
}

export async function GET(
  req: NextRequest,
  { params }: { params: { path: string[] } }
) {
  return proxyRequest(req, params);
}

export async function POST(
  req: NextRequest,
  { params }: { params: { path: string[] } }
) {
  return proxyRequest(req, params);
}

export async function PUT(
  req: NextRequest,
  { params }: { params: { path: string[] } }
) {
  return proxyRequest(req, params);
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: { path: string[] } }
) {
  return proxyRequest(req, params);
}

export async function OPTIONS(
  req: NextRequest,
  { params }: { params: { path: string[] } }
) {
  return proxyRequest(req, params);
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { path: string[] } }
) {
  return proxyRequest(req, params);
}
