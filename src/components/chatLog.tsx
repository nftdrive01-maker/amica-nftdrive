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
import { ChatContext } from "@/features/chat/chatContext";
import { saveAs } from 'file-saver';

export const ChatLog = ({
  messages,
}: {
  messages: Message[];
}) => {
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

function renderWithLinks(line: string): ReactNode[] {
  const linkRegex = /((?:https?:\/\/)?(?:[a-zA-Z0-9-]+\.)+[a-zA-Z]{2,}(?:\/[\w\-./?%&=+#~:]*)?)/g;
  const parts = line.split(linkRegex);
  return parts.map((part, i) => {
    const trimmed = part.trim();
    const isUrlLike = /^(?:https?:\/\/)?(?:[a-zA-Z0-9-]+\.)+[a-zA-Z]{2,}(?:\/[\w\-./?%&=+#~:]*)?$/.test(trimmed);
    if (isUrlLike) {
      const href = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
      return (
        <a
          key={i}
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          title={href}
          className="underline decoration-blue-500 hover:text-blue-700"
        >
          {part}
        </a>
      );
    }
    return part;
  });
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

function stripEmotionTags(text: string): string {
  return text.replace(/\[(neutral|happy|sad|angry|fear|surprised|disgust)\]\s*/gi, '');
}

function Chat({
  role,
  message,
  num,
  onClickResumeButton
}: {
  role: string;
  message: string;
  num: number;
  onClickResumeButton: (num: number, message: string) => void;
}) {
  const { t } = useTranslation();
  const normalizedMessage = stripEmotionTags(message);
  const { chipLabel, chronicleContent, plainMessage } = splitChronicleBlock(normalizedMessage);
  // const [textAreaValue, setTextAreaValue] = useState(message);



  return (
    <div className={clsx(
      'mx-auto max-w-sm my-8',
      role === "assistant" ? "pr-10 sm:pr-20" : "pl-10 sm:pl-20",
    )}>
      <div
        className={clsx(
          'px-6 py-2 rounded-t-lg font-bold tracking-wider flex justify-between shadow-inner backdrop-blur-lg',
          role === "assistant" ? "bg-pink-600/80" : "bg-cyan-600/80",
        )}
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
                // --- 出典 --- で分割し、前半:本文, 後半:出典
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
              // onChange={setTextAreaValue}
            />
          )}
        </div>
      </div>
    </div>
  );
};
