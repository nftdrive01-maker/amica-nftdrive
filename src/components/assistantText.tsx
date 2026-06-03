import { useEffect, useRef } from "react";
import { clsx } from "clsx";
import { config } from "@/utils/config";
import { normalizeThemeColor } from "@/utils/domainTheme";
import { stripDisplayControlTags } from "@/utils/stringProcessing";
import { ChatDbResult, type Message } from "@/features/chat/messages";
import { DbResultPanel } from "./dbResultPanel";

function sanitizeUrl(url: string): string {
  const strict = url.match(/^https?:\/\/[A-Za-z0-9\-._~:/?#\[\]@!$&'()*+,;=%]+/);
  if (strict) {
    return strict[0];
  }
  return url.replace(/[\]\[\"'.,!?;:]+$/g, '').replace(/\)+$/g, '');
}

function toHref(urlOrHost: string): string {
  const base = /^https?:\/\//i.test(urlOrHost) ? urlOrHost : `https://${urlOrHost}`;
  if (/^https:\/\/accounts\.google\.com\/(oauth2\/auth|o\/oauth2\/auth|oauth2\/v2\/auth|o\/oauth2\/v2\/auth)/i.test(base)) {
    try {
      const url = new URL(
        base.replace(
          /^https:\/\/accounts\.google\.com\/(oauth2\/auth|o\/oauth2\/auth|oauth2\/v2\/auth)/i,
          'https://accounts.google.com/o/oauth2/v2/auth'
        )
      );
      const redirectUri = url.searchParams.get('redirect_uri') || '';
      if (/^https?:\/\/(localhost|127\.0\.0\.1)(?::(?:80|801))?\/oauth2callback$/i.test(redirectUri)) {
        url.searchParams.set('redirect_uri', 'http://localhost:8001/oauth2callback');
      }
      return url.toString();
    } catch {
      return base;
    }
  }
  return base;
}

function extractHttpUrl(text: string): string | null {
  const compact = text
    .replace(/\[[^\]]*\]/g, '')
    .replace(/\s+/g, '');
  const match = compact.match(/https?:\/\/.+/i);
  if (!match) {
    return null;
  }
  return sanitizeUrl(match[0]);
}

function normalizeBrokenGoogleOAuthText(input: string): string {
  const normalizedOAuth = input.replace(
    /https:\/\/accounts\.google\s*\.com\/[\s\S]*?(?=$|\n)/gi,
    (segment) => segment.replace(/\s+/g, '')
  );

  return normalizedOAuth.replace(
    /https?:\/\/[A-Za-z0-9.-]+\s+\.[A-Za-z]{2,}(?:[^\s]*)?/gi,
    (segment) => segment.replace(/\s+/g, '')
  );
}

function renderWithLinks(line: string) {
  const normalizedLine = normalizeBrokenGoogleOAuthText(line);
  const nodes: Array<string | JSX.Element> = [];
  const pattern = /\[([^\]]+)\]\s*\(([^)]+)\)|<((?:https?:\/\/|www\.)[A-Za-z0-9\-._~:/?#\[\]@!$&'()*+,;=%]+)>|((?:https?:\/\/|www\.)[A-Za-z0-9\-._~:/?#\[\]@!$&'()*+,;=%]+)/gi;

  let cursor = 0;
  let key = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(normalizedLine)) !== null) {
    const start = match.index;
    const end = pattern.lastIndex;

    if (start > cursor) {
      nodes.push(normalizedLine.slice(cursor, start));
    }

    const markdownLabel = match[1];
    const markdownPayload = match[2];
    const angleWrappedUrl = match[3];
    const bareUrl = match[4];
    const rawUrl = markdownPayload
      ? extractHttpUrl(markdownPayload)
      : sanitizeUrl(angleWrappedUrl || bareUrl || '');
    if (!rawUrl) {
      nodes.push(match[0]);
      cursor = end;
      continue;
    }
    const normalizedUrl = rawUrl;
    const href = toHref(normalizedUrl);

    nodes.push(
      <a
        key={`link-${key++}`}
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="underline decoration-pink-500 hover:text-pink-700"
      >
        {markdownLabel || normalizedUrl}
      </a>
    );

    cursor = end;
  }

  if (cursor < normalizedLine.length) {
    nodes.push(normalizedLine.slice(cursor));
  }

  if (nodes.length === 1 && typeof nodes[0] === 'string') {
    const recovered = extractHttpUrl(normalizedLine);
    if (recovered && /accounts\.google\.com/i.test(recovered)) {
      const href = toHref(recovered);
      return [
        <a
          key="link-recovered"
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="underline decoration-pink-500 hover:text-pink-700"
        >
          {href}
        </a>,
      ];
    }
  }

  return nodes;
}

function renderMultilineWithLinks(text: string) {
  const lines = text.split(/\r?\n/);
  return lines.map((line, index) => (
    <div key={index}>
      {renderWithLinks(line)}
    </div>
  ));
}

function splitDbResultBlock(text: string): {
  dbResult: ChatDbResult | null;
  plainMessage: string;
} {
  const match = text.match(/\[\[DB_RESULT\]\]\n([\s\S]*?)\n\[\[\/DB_RESULT\]\]\n*/);
  if (!match) {
    return {
      dbResult: null,
      plainMessage: text,
    };
  }

  try {
    const matchedBlock = match[0] || "";
    return {
      dbResult: JSON.parse(match[1] || '{}') as ChatDbResult,
      plainMessage: text.replace(matchedBlock, '').trimStart(),
    };
  } catch {
    const matchedBlock = match[0] || "";
    return {
      dbResult: null,
      plainMessage: text.replace(matchedBlock, '').trimStart(),
    };
  }
}

function splitChronicleBlock(text: string): {
  chipLabel: string | null;
  chronicleContent: string | null;
  plainMessage: string;
} {
  const match = text.match(/^\[\[CHRONICLE_TITLE:([^\]]+)\]\]\n([\s\S]*?)\n\[\[\/CHRONICLE\]\]\n*/);
  if (!match) {
    return {
      chipLabel: null,
      chronicleContent: null,
      plainMessage: text,
    };
  }

  return {
    chipLabel: (match[1] || "CHRONICLE").trim(),
    chronicleContent: (match[2] || "").trim(),
    plainMessage: text.slice(match[0].length),
  };
}

export const AssistantText = ({
  message,
  dbResult: dbResultProp,
  attachment,
  compact = false,
}: {
  message: string;
  dbResult?: ChatDbResult;
  attachment?: Message["attachment"];
  compact?: boolean;
}) => {
  const scrollRef = useRef<HTMLDivElement>(null);
  const accentColor = normalizeThemeColor(config('theme_color'));
  const normalizedMessage = stripDisplayControlTags(message);
  const { dbResult: dbResultFromText, plainMessage: afterDbMessage } = splitDbResultBlock(normalizedMessage);
  const dbResult = dbResultProp || dbResultFromText;
  const { chipLabel, chronicleContent, plainMessage } = splitChronicleBlock(afterDbMessage);

  useEffect(() => {
    scrollRef.current?.scrollIntoView({
      behavior: "smooth",
      block: "center",
    });
  });

  return (
    <div className="fixed bottom-0 left-0 mb-28 w-full">
      <div className={clsx("mx-auto w-full px-4 md:px-10", dbResult ? "max-w-5xl" : "max-w-4xl")}>
        <div className="relative overflow-hidden rounded-none shadow-[0_22px_64px_rgba(15,23,42,0.2)]">
          <div className="pointer-events-none absolute inset-y-0 left-0 right-0 bg-slate-950/22 backdrop-blur-[3px]" />
          <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(90deg,rgba(15,23,42,0.2)_0%,rgba(15,23,42,0.24)_10%,rgba(15,23,42,0.32)_22%,rgba(15,23,42,0.4)_34%,rgba(15,23,42,0.46)_50%,rgba(15,23,42,0.4)_66%,rgba(15,23,42,0.32)_78%,rgba(15,23,42,0.24)_90%,rgba(15,23,42,0.2)_100%)]" />
          <div className={clsx("relative z-10 md:px-8", compact ? "px-5 py-3" : "px-6 py-5")}>
            <div className="flex items-center gap-2 pb-1 text-white font-bold tracking-wider">
              <span className="inline-flex items-center text-[24px] font-bold leading-none text-pink-400 drop-shadow-[0_2px_10px_rgba(15,23,42,0.45)] sm:text-[24px]" style={accentColor ? { color: accentColor } : undefined}>
                {`${config('name')}:`}
              </span>
            </div>
            <div className={clsx("scroll-card overflow-y-auto pb-3 pt-1", compact ? "max-h-[19vh]" : "max-h-[25vh]")}>
              <div className="min-h-8 max-h-full whitespace-pre-wrap break-words text-[15px] font-semibold leading-[1.5] text-white/95 drop-shadow-[0_2px_10px_rgba(15,23,42,0.45)] sm:text-[25px]">
                {attachment?.kind === "image" && (
                  <div className="mb-3 rounded-md border border-slate-200/20 bg-slate-950/20 p-3">
                    <div className="mb-2 text-xs font-semibold text-cyan-200">添付画像</div>
                    <img
                      src={attachment.dataUrl}
                      alt={attachment.fileName || "attached image"}
                      className="max-h-36 w-auto rounded-md border border-slate-200/20 object-contain"
                    />
                    {attachment.fileName && (
                      <div className="mt-2 text-xs text-slate-200/80">{attachment.fileName}</div>
                    )}
                  </div>
                )}
                {chipLabel && chronicleContent && (
                  <div className="mb-3 bg-slate-950/12 px-3 py-2 backdrop-blur-[2px]">
                    <div className="mb-2 inline-flex items-center text-[13px] font-bold tracking-[0.18em] text-cyan-200">
                      {chipLabel}
                    </div>
                    <div className="whitespace-pre-wrap break-words text-[14px] font-medium leading-[1.55] text-white/90 sm:text-[22px]">
                      {renderMultilineWithLinks(chronicleContent)}
                    </div>
                  </div>
                )}
                {renderMultilineWithLinks(plainMessage)}
                <div ref={scrollRef} />
              </div>
            </div>
            {dbResult && (
              <div className="mt-4 border-t border-white/10 px-1 pt-4">
                <DbResultPanel dbResult={dbResult} />
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

