/**
 * Asset BFF Proxy: /api/injection-assets/[...path] → INJECTION_TOOL_INTERNAL_URL/[...path]
 *
 * 例:
 *  - /api/injection-assets/vrm/model.vrm
 *  - /api/injection-assets/bgimage/background.png
 */

import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const INTERNAL_URL =
  process.env.INJECTION_TOOL_INTERNAL_URL || 'http://localhost:4001';

function buildTargetUrl(pathSegments: string[], searchString: string): string {
  const assetPath = pathSegments.join('/');
  const base = INTERNAL_URL.replace(/\/$/, '');
  return `${base}/${assetPath}${searchString ? '?' + searchString : ''}`;
}

async function proxyAsset(
  req: NextRequest,
  params: { path: string[] }
): Promise<NextResponse> {
  const targetUrl = buildTargetUrl(
    params.path,
    req.nextUrl.searchParams.toString()
  );

  const headers = new Headers();
  req.headers.forEach((value, key) => {
    if (key.toLowerCase() !== 'host') {
      headers.set(key, value);
    }
  });

  try {
    const upstream = await fetch(targetUrl, {
      method: req.method,
      headers,
    });

    const responseHeaders = new Headers();
    upstream.headers.forEach((value, key) => {
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
    console.error('[injection asset proxy] upstream error:', err);
    return NextResponse.json(
      { error: 'injection-tool のアセット取得に失敗しました', detail: err?.message },
      { status: 502 }
    );
  }
}

export async function GET(
  req: NextRequest,
  { params }: { params: { path: string[] } }
) {
  return proxyAsset(req, params);
}

export async function HEAD(
  req: NextRequest,
  { params }: { params: { path: string[] } }
) {
  return proxyAsset(req, params);
}
