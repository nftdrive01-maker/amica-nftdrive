type DomainAccessSession = {
  username: string;
  accessToken: string;
};

function buildStorageKey(domainId: string): string {
  return `amica_domain_access_${String(domainId || '').trim()}`;
}

export function getDomainAccessSession(domainId: string): DomainAccessSession | null {
  if (typeof window === 'undefined') {
    return null;
  }

  const raw = window.sessionStorage.getItem(buildStorageKey(domainId));
  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as Partial<DomainAccessSession>;
    if (typeof parsed.username !== 'string' || typeof parsed.accessToken !== 'string') {
      return null;
    }

    return {
      username: parsed.username,
      accessToken: parsed.accessToken,
    };
  } catch {
    return null;
  }
}

export function setDomainAccessSession(domainId: string, session: DomainAccessSession): void {
  if (typeof window === 'undefined') {
    return;
  }

  window.sessionStorage.setItem(buildStorageKey(domainId), JSON.stringify(session));
}

export function clearDomainAccessSession(domainId: string): void {
  if (typeof window === 'undefined') {
    return;
  }

  window.sessionStorage.removeItem(buildStorageKey(domainId));
}

export function hasDomainAccessSession(domainId: string): boolean {
  return Boolean(getDomainAccessSession(domainId)?.accessToken);
}