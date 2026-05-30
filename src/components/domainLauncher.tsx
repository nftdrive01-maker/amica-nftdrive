import { useEffect, useState } from 'react';
import { fetchPublicDomainOptions, type PublicDomainOption } from '@/lib/injectionClient';

interface DomainLauncherProps {
  selectedDomainId: string;
  startingDomainId?: string | null;
  onEnter: (domainId: string) => void;
}

function buildSummary(domain: PublicDomainOption): string {
  if (domain.description && domain.description.length > 0) {
    return domain.description;
  }

  const parts: string[] = [];
  if (domain.characterName) {
    parts.push(domain.characterName);
  }
  if ((domain.knowledgeIds?.length || 0) > 0) {
    parts.push(`ナレッジ ${domain.knowledgeIds?.length}件`);
  }
  if ((domain.mcpServerIds?.length || 0) > 0) {
    parts.push(`MCP ${domain.mcpServerIds?.length}件`);
  }
  if (domain.chronicleAttached) {
    parts.push('Chronicle 連携');
  }

  return parts.length > 0 ? parts.join(' / ') : 'このドメインの AI を起動します。';
}

export function DomainLauncher({ selectedDomainId, startingDomainId, onEnter }: DomainLauncherProps) {
  const [domains, setDomains] = useState<PublicDomainOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;

    const loadDomains = async () => {
      try {
        setLoading(true);
        setError('');
        const nextDomains = await fetchPublicDomainOptions();
        if (cancelled) {
          return;
        }
        setDomains(nextDomains);
      } catch {
        if (cancelled) {
          return;
        }
        setError('ドメイン一覧の取得に失敗しました。');
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    void loadDomains();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="relative min-h-screen overflow-hidden bg-[radial-gradient(circle_at_top_left,_rgba(255,255,255,0.96),_transparent_24%),radial-gradient(circle_at_20%_26%,_rgba(245,185,221,0.45),_transparent_22%),radial-gradient(circle_at_82%_18%,_rgba(143,224,255,0.58),_transparent_26%),linear-gradient(135deg,_#d7f4ff_0%,_#eef9ff_36%,_#f7e7f3_68%,_#e4f8ff_100%)] text-slate-800">
      <div
        className="pointer-events-none absolute inset-0 opacity-60"
        style={{
          backgroundImage: "url(\"data:image/svg+xml,%3Csvg width='90' height='78' viewBox='0 0 90 78' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M22.5 2 L67.5 2 L88 39 L67.5 76 L22.5 76 L2 39 Z' fill='none' stroke='rgba(92,158,220,0.24)' stroke-width='2'/%3E%3C/svg%3E\")",
          backgroundSize: '72px 62px',
          maskImage: 'linear-gradient(to bottom, black 0%, black 40%, transparent 70%)',
        }}
      />

      <div className="relative mx-auto flex min-h-screen w-full max-w-7xl flex-col px-6 py-8 md:px-10 lg:px-12">
        <div className="mb-10">
          <div>
            <div className="mb-3 inline-flex items-center gap-3 rounded-full border border-sky-200/70 bg-white/60 px-4 py-2 text-xs font-bold tracking-[0.25em] text-sky-700 shadow-[0_10px_30px_rgba(125,180,220,0.16)]">
              ARK-I CORE LAUNCHER
            </div>
            <h1 className="max-w-3xl text-4xl font-light tracking-[-0.05em] text-sky-900 md:text-6xl">
              ドメインを選んで、
              <span className="bg-[linear-gradient(100deg,#3d6fae_0%,#77a4e2_36%,#d693c8_76%,#c678bd_100%)] bg-clip-text text-transparent"> AI を起動。</span>
            </h1>
            <p
              className="mt-5 max-w-2xl text-sm font-bold leading-8 md:text-base"
              style={{ color: '#020617' }}
            >
              まずカードで役割を確認してから会話を開始します。病院受付、施設案内、社内ナレッジなど、用途ごとに最適化されたドメインを選択してください。
            </p>
          </div>
        </div>

        {loading ? (
          <div className="grid min-h-[320px] place-items-center rounded-[32px] border border-white/70 bg-white/45 shadow-[0_24px_70px_rgba(89,143,194,0.16)] backdrop-blur-md">
            <div className="text-center text-slate-600">
              <div className="mx-auto mb-4 h-12 w-12 animate-spin rounded-full border-4 border-sky-100 border-t-sky-400" />
              <div className="text-sm font-semibold">ドメイン一覧を読み込んでいます...</div>
            </div>
          </div>
        ) : error ? (
          <div className="rounded-[32px] border border-rose-200 bg-white/70 px-6 py-10 text-center text-rose-700 shadow-[0_24px_70px_rgba(89,143,194,0.16)] backdrop-blur-md">
            <div className="text-base font-semibold">{error}</div>
          </div>
        ) : (
          <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
            {domains.map((domain) => {
              const headerImageUrl = domain.headerImageUrl || domain.bgUrl || '';
              const isSelected = domain.id === selectedDomainId;

              return (
                <article
                  key={domain.id}
                  className="overflow-hidden rounded-[28px] border border-white/80 bg-white/58 shadow-[0_26px_70px_rgba(89,143,194,0.18)] backdrop-blur-md transition duration-300 hover:-translate-y-1 hover:shadow-[0_30px_80px_rgba(89,143,194,0.24)]"
                >
                  <div
                    className="relative h-44 bg-slate-200"
                    style={headerImageUrl
                      ? {
                          backgroundImage: `linear-gradient(180deg, rgba(15,23,42,0.08), rgba(15,23,42,0.42)), url(${headerImageUrl})`,
                          backgroundSize: 'cover',
                          backgroundPosition: 'center',
                        }
                      : {
                          backgroundImage: `linear-gradient(135deg, ${domain.themeColor || '#8ccfff'} 0%, #f1d3ea 100%)`,
                        }}
                  >
                    <div className="absolute left-4 top-4 flex flex-wrap gap-2">
                      {isSelected ? (
                        <span className="rounded-full bg-sky-700/90 px-3 py-1 text-[11px] font-bold tracking-[0.18em] text-white shadow-[0_8px_20px_rgba(14,116,204,0.28)]">
                          SELECTED
                        </span>
                      ) : null}
                      {domain.accessControlEnabled ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-amber-100/90 px-3 py-1 text-[11px] font-bold tracking-[0.12em] text-amber-800">
                          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-3.5 w-3.5" aria-hidden="true">
                            <path fillRule="evenodd" d="M10 1.75a3.75 3.75 0 00-3.75 3.75V7H5.5A1.75 1.75 0 003.75 8.75v6.5C3.75 16.216 4.534 17 5.5 17h9a1.75 1.75 0 001.75-1.75v-6.5A1.75 1.75 0 0014.5 7h-.75V5.5A3.75 3.75 0 0010 1.75zM12.25 7V5.5a2.25 2.25 0 10-4.5 0V7h4.5z" clipRule="evenodd" />
                          </svg>
                          LOGIN
                        </span>
                      ) : null}
                      {domain.chronicleAttached ? (
                        <span className="rounded-full bg-emerald-100/90 px-3 py-1 text-[11px] font-bold tracking-[0.12em] text-emerald-800">
                          CHRONICLE
                        </span>
                      ) : null}
                    </div>

                    <div className="absolute inset-x-0 bottom-0 p-5 text-white">
                      <div className="text-[11px] font-bold uppercase tracking-[0.24em] text-white/70">DOMAIN</div>
                      <h2 className="mt-2 text-2xl font-semibold tracking-[-0.03em]">{domain.label}</h2>
                    </div>
                  </div>

                  <div className="space-y-5 p-5">
                    <p className="min-h-[72px] text-sm font-medium leading-7 text-slate-600">
                      {buildSummary(domain)}
                    </p>

                    <div className="flex flex-wrap gap-2">
                      {domain.characterName ? (
                        <span className="rounded-full bg-sky-50 px-3 py-1 text-xs font-semibold text-sky-700">{domain.characterName}</span>
                      ) : null}
                      {(domain.knowledgeIds?.length || 0) > 0 ? (
                        <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">ナレッジ {domain.knowledgeIds?.length}件</span>
                      ) : null}
                      {(domain.mcpServerIds?.length || 0) > 0 ? (
                        <span className="rounded-full bg-cyan-50 px-3 py-1 text-xs font-semibold text-cyan-700">MCP {domain.mcpServerIds?.length}件</span>
                      ) : null}
                    </div>

                    <button
                      type="button"
                      onClick={() => onEnter(domain.id)}
                      disabled={Boolean(startingDomainId)}
                      className="inline-flex min-h-[52px] w-full items-center justify-center rounded-full bg-[linear-gradient(110deg,#80cfff_0%,#8fbff7_46%,#e2a4d4_100%)] px-5 text-sm font-bold text-white shadow-[0_18px_44px_rgba(145,180,227,0.30)] transition hover:brightness-105 disabled:cursor-wait disabled:opacity-70"
                    >
                      {startingDomainId === domain.id ? '起動準備中...' : 'このドメインで開始'}
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}