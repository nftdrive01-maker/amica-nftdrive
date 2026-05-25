import type { NextApiRequest, NextApiResponse } from 'next';
import { NextRequest, NextResponse } from 'next/server';

function isTrue(value?: string): boolean {
  return String(value || '').trim().toLowerCase() === 'true';
}

function getConfiguredApiKey(): string {
  return String(
    process.env.AMICA_SERVER_API_KEY || process.env.AMICA_API_KEY || ''
  ).trim();
}

function trustCloudflareAccess(): boolean {
  return isTrue(process.env.AMICA_TRUST_CLOUDFLARE_ACCESS);
}

function getHeaderValue(headers: Headers, key: string): string {
  return String(headers.get(key) || '').trim();
}

function getNodeHeaderValue(
  headers: NextApiRequest['headers'],
  key: string
): string {
  const value = headers[key.toLowerCase()];
  if (Array.isArray(value)) {
    return String(value[0] || '').trim();
  }
  return String(value || '').trim();
}

function extractBearerToken(value: string): string {
  const match = value.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : '';
}

function isLocalHost(value: string): boolean {
  const host = value.split(',')[0]?.trim().toLowerCase() || '';
  return (
    host.startsWith('localhost') ||
    host.startsWith('127.0.0.1') ||
    host.startsWith('[::1]') ||
    host.startsWith('::1')
  );
}

function isLocalRequestFromHeaders(host: string, forwardedHost: string): boolean {
  return isLocalHost(host) || isLocalHost(forwardedHost);
}

function isAuthorizedValue(apiKey: string, providedKey: string, authorization: string): boolean {
  if (!apiKey) {
    return false;
  }

  return providedKey === apiKey || extractBearerToken(authorization) === apiKey;
}

function hasTrustedCloudflareAccessNode(headers: NextApiRequest['headers']): boolean {
  if (!trustCloudflareAccess()) {
    return false;
  }

  const accessEmail = getNodeHeaderValue(headers, 'cf-access-authenticated-user-email');
  const accessJwt = getNodeHeaderValue(headers, 'cf-access-jwt-assertion');
  return Boolean(accessEmail || accessJwt);
}

function hasTrustedCloudflareAccess(headers: Headers): boolean {
  if (!trustCloudflareAccess()) {
    return false;
  }

  const accessEmail = getHeaderValue(headers, 'cf-access-authenticated-user-email');
  const accessJwt = getHeaderValue(headers, 'cf-access-jwt-assertion');
  return Boolean(accessEmail || accessJwt);
}

type ProtectionOptions = {
  publicEnvVar: string;
  routeName: string;
};

export function requireProtectedApiRoute(
  req: NextApiRequest,
  res: NextApiResponse,
  options: ProtectionOptions
): boolean {
  if (process.env.NODE_ENV !== 'production') {
    return true;
  }

  if (isTrue(process.env[options.publicEnvVar])) {
    return true;
  }

  const host = getNodeHeaderValue(req.headers, 'host');
  const forwardedHost = getNodeHeaderValue(req.headers, 'x-forwarded-host');
  if (isLocalRequestFromHeaders(host, forwardedHost)) {
    return true;
  }

  const apiKey = getConfiguredApiKey();
  const providedKey = getNodeHeaderValue(req.headers, 'x-amica-api-key');
  const authorization = getNodeHeaderValue(req.headers, 'authorization');

  if (isAuthorizedValue(apiKey, providedKey, authorization)) {
    return true;
  }

  if (hasTrustedCloudflareAccessNode(req.headers)) {
    return true;
  }

  res.status(403).json({
    error: `${options.routeName} is not public`,
    code: 'AMICA_API_PROTECTED',
  });
  return false;
}

export function requireProtectedAppRoute(
  req: NextRequest,
  options: ProtectionOptions
): NextResponse | null {
  if (process.env.NODE_ENV !== 'production') {
    return null;
  }

  if (isTrue(process.env[options.publicEnvVar])) {
    return null;
  }

  const host = getHeaderValue(req.headers, 'host');
  const forwardedHost = getHeaderValue(req.headers, 'x-forwarded-host');
  if (isLocalRequestFromHeaders(host, forwardedHost)) {
    return null;
  }

  const apiKey = getConfiguredApiKey();
  const providedKey = getHeaderValue(req.headers, 'x-amica-api-key');
  const authorization = getHeaderValue(req.headers, 'authorization');

  if (isAuthorizedValue(apiKey, providedKey, authorization)) {
    return null;
  }

  if (hasTrustedCloudflareAccess(req.headers)) {
    return null;
  }

  return NextResponse.json(
    {
      error: `${options.routeName} is not public`,
      code: 'AMICA_API_PROTECTED',
    },
    { status: 403 }
  );
}