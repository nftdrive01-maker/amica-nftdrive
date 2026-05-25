import { useTranslation } from 'react-i18next';
import { clsx } from "clsx";
import { useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import FlexTextarea from "@/components/flexTextarea/flexTextarea";
import { Message } from "@/features/chat/messages";
import { IconButton } from "@/components/iconButton";
import {
  ArrowPathIcon,
} from '@heroicons/react/20/solid';
import { config } from "@/utils/config";
import { normalizeThemeColor } from "@/utils/domainTheme";
import { stripDisplayControlTags } from "@/utils/stringProcessing";
import { ChatContext } from "@/features/chat/chatContext";
import { saveAs } from 'file-saver';
import { ChatDbResult } from '@/features/chat/messages';
import { DbResultPanel } from './dbResultPanel';

export const ChatLog = ({
  messages,
}: {
  messages: Message[];
}) => {
  const accentColor = normalizeThemeColor(config('theme_color'));
  const { t } = useTranslation();
  const { chat: bot } = useContext(ChatContext);
  const chatScrollRef = useRef<HTMLDivElement>(null);

  const handleResumeButtonClick = (num: number, newMessage: string) => {
    bot.setMessageList(messages.slice(0, num));
    bot.receiveMessageFromUser(newMessage,false);
  };

  const txtFileInputRef = useRef<HTMLInputElement>(null);
  const handleClickOpenTxtFile = useCallback(() => {
    txtFileInputRef.current?.click();
  }, []);

  const handleChangeTxtFile = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const files = event.target.files;
      if (!files) return;

      const file = files[0];
      if (!file) return;

      const fileReader = new FileReader();
      fileReader.onload = (e) => {
        const content = e.target?.result as string;
        const lines = content.split("\n");
        const parsedChat = lines.map((line) => {
          const match = line.match(/^(user|assistant)\s*:\s*(.*)$/);
          if (match) {
            return { role: match[1], content: match[2] };
          }
          return null;
        }).filter(Boolean) as Message[];

        try {
          if (parsedChat.length > 0) {
            const lastMessage = parsedChat[parsedChat.length - 1];
            bot.setMessageList(parsedChat.slice(0, parsedChat.length - 1));

            if (lastMessage.role === "user") {
              bot.receiveMessageFromUser(lastMessage.content as string, false);
            } else {
              bot.bubbleMessage(lastMessage.role, lastMessage.content as string);
            }
          } 
          console.error("Please attach the correct file format.");
        } catch (e: any) {
          console.error(e.toString());
        }
      };

      fileReader.readAsText(file);

      event.target.value = "";
    },
    [bot]
  );

  const exportMessagesToTxt = (messages: any[]) => {
    const blob = new Blob(
      [messages.map((msg: { role: string; content: string; }) => `${msg.role} : ${msg.content}`).join('\n\n')],
      { type: 'text/plain' }
    );
    saveAs(blob, 'chat_log.txt');
  };

  useEffect(() => {
    chatScrollRef.current?.scrollIntoView({
      behavior: "auto",
      block: "center",
    });
  }, []);

  useEffect(() => {
    chatScrollRef.current?.scrollIntoView({
      behavior: "smooth",
      block: "center",
    });
  }, [messages]);

  return (
    <>
      <div className="absolute left-12 top-4 z-10">
        <IconButton
          iconName="24/ReloadLoop"
          label={t("Restart")}
          isProcessing={false}
          className="bg-slate-600 hover:bg-slate-500 active:bg-slate-500 shadow-xl"
          onClick={() => {
            bot.setMessageList([]);
          }}
        ></IconButton>
        <IconButton
          iconName="24/UploadAlt"
          label={t("Load Chat")}
          isProcessing={false}
          className="bg-slate-600 hover:bg-slate-500 active:bg-slate-500 shadow-xl"
          onClick={handleClickOpenTxtFile}
        ></IconButton>
        <IconButton
          iconName="24/Save"
          label={t("Save")}
          isProcessing={false}
          className="bg-slate-600 hover:bg-slate-500 active:bg-slate-500 shadow-xl"
          onClick={() => exportMessagesToTxt(messages)}
        ></IconButton>
      </div>

      <div className="fixed w-col-span-6 max-w-full h-screen overflow-hidden">

        <div className="h-full px-16 pt-20 pb-56 overflow-y-auto scroll-hidden">
          {messages.map((msg, i) => {
            return (
              <div key={i} ref={messages.length - 1 === i ? chatScrollRef : null}>
                <Chat
                  role={msg.role}
                  message={(msg.content as string)}
                  dbResult={msg.dbResult}
                  num={i}
                  onClickResumeButton={handleResumeButtonClick}
                />

              </div>
            );
          })}
        </div>
      </div>
      <input
        type="file"
        accept=".txt"
        ref={txtFileInputRef}
        onChange={handleChangeTxtFile}
        className="hidden"
      />
    </>
  );
};

function sanitizeUrl(url: string): string {
  // Keep only URL-safe characters to avoid including surrounding Japanese text.
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

  // Recover hostnames split by spaces (e.g. "drive.google .com/..."), while
  // keeping non-URL text intact.
  return normalizedOAuth.replace(
    /https?:\/\/[A-Za-z0-9.-]+\s+\.[A-Za-z]{2,}(?:[^\s]*)?/gi,
    (segment) => segment.replace(/\s+/g, '')
  );
}

function renderWithLinks(line: string): ReactNode[] {
  const normalizedLine = normalizeBrokenGoogleOAuthText(line);
  const nodes: ReactNode[] = [];
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
        title={href}
        className="underline decoration-blue-500 hover:text-blue-700"
      >
        {markdownLabel || normalizedUrl}
      </a>
    );

    cursor = end;
  }

  if (cursor < normalizedLine.length) {
    nodes.push(normalizedLine.slice(cursor));
  }

  // Recover malformed OAuth URL text like "accounts.google .com ... ? ... & ...".
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
          title={href}
          className="underline decoration-blue-500 hover:text-blue-700"
        >
          {href}
        </a>,
      ];
    }
  }

  return nodes;
}

function renderMultilineWithLinks(text: string): ReactNode[] {
  const lines = text.split(/\r?\n/);
  return lines.map((line, index) => (
    <div key={`line-${index}`}>{renderWithLinks(line)}</div>
  ));
}

function renderMultilineWithLinksSm(text: string): ReactNode[] {
  const lines = text.split(/\r?\n/);
  return lines.map((line, index) => (
    <div key={`line-${index}-sm`} style={{fontSize: '10px', fontWeight: 'normal', color: '#9ca3af', lineHeight: '1rem'}}>{renderWithLinks(line)}</div>
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
    chipLabel: (match[1] || 'CHRONICLE').trim(),
    chronicleContent: (match[2] || '').trim(),
    plainMessage: text.slice(match[0].length),
  };
}

function Chat({
  role,
  message,
  dbResult: dbResultProp,
  num,
  onClickResumeButton
}: {
  role: string;
  message: string;
  dbResult?: ChatDbResult;
  num: number;
  onClickResumeButton: (num: number, message: string) => void;
}) {
  const { t } = useTranslation();
  const accentColor = normalizeThemeColor(config('theme_color'));
  const normalizedMessage = stripDisplayControlTags(message);
  const { dbResult: dbResultFromText, plainMessage: afterDbMessage } = splitDbResultBlock(normalizedMessage);
  const dbResult = dbResultProp || dbResultFromText;
  const { chipLabel, chronicleContent, plainMessage } = splitChronicleBlock(afterDbMessage);
  // const [textAreaValue, setTextAreaValue] = useState(message);



  return (
    <div className={clsx(
      'mx-auto max-w-7xl my-8',
      role === "assistant" ? "pr-10 sm:pr-20" : "pl-10 sm:pl-20",
    )}>
      <div
        className={clsx(
          'rounded-lg shadow-sm backdrop-blur-lg',
          role === "assistant" ? "bg-white/80" : "bg-white/80",
        )}
      >
        <div
          className={clsx(
            'px-6 py-2 rounded-t-lg font-bold tracking-wider flex justify-between shadow-inner backdrop-blur-lg',
            role === "assistant" ? "bg-pink-600/80" : "bg-cyan-600/80",
          )}
          style={role === 'assistant' && accentColor ? { backgroundColor: accentColor } : undefined}
        >
          <div className="text-sm font-bold text-white">
            {role === "assistant" && config('name').toUpperCase()}
            {role === "user" && t("YOU")}
          </div>
        </div>
        <div className="px-4 pt-3 pb-2 bg-white/80 backdrop-blur-lg rounded-b-lg shadow-sm">
          <div className='typography-16 font-M_PLUS_2 font-bold text-gray-800 whitespace-pre-wrap break-words leading-relaxed'>
            {role === "assistant" ? (
              <div>
                {chipLabel && chronicleContent && (() => {
                  const citationSeparator = /--- 出典 ---/;
                  const [mainText, ...citationParts] = chronicleContent.split(citationSeparator);
                  const citationText = citationParts.length > 0 ? citationParts.join('--- 出典 ---') : null;
                  return (
                    <div className="mb-3 rounded-md border border-cyan-300 bg-cyan-50 p-3">
                      <div className="mb-2 inline-flex items-center rounded-full border border-cyan-400 bg-white px-2 py-0.5 text-xs font-bold text-cyan-700">
                        {chipLabel}
                      </div>
                      <div className="typography-16 font-M_PLUS_2 text-gray-700 whitespace-pre-wrap break-words leading-relaxed">
                        {renderMultilineWithLinks(mainText.trim())}
                        {citationText && (
                          <div className="mt-4 border-t border-cyan-200 pt-2">
                            {renderMultilineWithLinksSm('--- 出典 ---' + citationText)}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })()}
                <div>{renderMultilineWithLinks(plainMessage)}</div>
              </div>
            ) : (
              <FlexTextarea
                value={message}
              />
            )}
          </div>
        </div>
        {role === "assistant" && dbResult && (
          <div className="border-t border-white/60 bg-white/45 px-6 py-4 rounded-b-lg">
            <DbResultPanel dbResult={dbResult} />
          </div>
        )}
      </div>
    </div>
  );
};
