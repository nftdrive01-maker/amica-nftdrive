import { useEffect, useRef, useState } from "react";
import { clsx } from "clsx";
import { config } from "@/utils/config";
import { IconButton } from "./iconButton";

function renderWithLinks(line: string) {
  const linkRegex = /((?:https?:\/\/)?(?:[a-zA-Z0-9-]+\.)+[a-zA-Z]{2,}(?:\/[\w\-./?%&=+#~:]*)?)/g;
  const parts = line.split(linkRegex);

  return parts.map((part, i) => {
    const trimmed = part.trim();
    if (!trimmed) {
      return part;
    }

    const isUrlLike = /^(?:https?:\/\/)?(?:[a-zA-Z0-9-]+\.)+[a-zA-Z]{2,}(?:\/[\w\-./?%&=+#~:]*)?$/.test(trimmed);
    if (!isUrlLike) {
      return part;
    }

    const href = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
    return (
      <a
        key={i}
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="underline decoration-pink-500 hover:text-pink-700"
      >
        {part}
      </a>
    );
  });
}

function renderMultilineWithLinks(text: string) {
  const lines = text.split(/\r?\n/);
  return lines.map((line, index) => (
    <div key={index}>
      {renderWithLinks(line)}
    </div>
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
    chipLabel: (match[1] || "CHRONICLE").trim(),
    chronicleContent: (match[2] || "").trim(),
    plainMessage: text.slice(match[0].length),
  };
}

function stripEmotionTags(text: string): string {
  return text.replace(/\[(neutral|happy|sad|angry|fear|surprised|disgust)\]\s*/gi, "");
}

export const AssistantText = ({ message }: { message: string }) => {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [unlimited, setUnlimited] = useState(false)
  const normalizedMessage = stripEmotionTags(message);
  const { chipLabel, chronicleContent, plainMessage } = splitChronicleBlock(normalizedMessage);

  useEffect(() => {
    scrollRef.current?.scrollIntoView({
      behavior: "smooth",
      block: "center",
    });
  });

  return (
    <div className="fixed bottom-0 left-0 mb-28 w-full">
      <div className="mx-auto max-w-4xl w-full px-4 md:px-16">
        <div className="backdrop-blur-lg rounded-lg">
          <div className="bg-white/70 rounded-lg backdrop-blur-lg shadow-lg">
            <div className="px-8 pr-1 py-3 bg-rose/90 rounded-t-lg text-white font-bold tracking-wider">
              <span className="p-4 bg-pink-600/80 rounded-lg rounded-tl-none rounded-tr-none shadow-sm">
                {config('name').toUpperCase()}
              </span>
              <IconButton
                iconName="24/FrameSize"
                className="bg-transparent hover:bg-transparent active:bg-transparent disabled:bg-transparent float-right"
                isProcessing={false}
                onClick={() => setUnlimited(!unlimited)}
              />
            </div>
            <div className={clsx(
              "px-8 py-4 overflow-y-auto",
              unlimited ? 'max-h-[calc(75vh)]' : 'max-h-32',
            )}>
              <div className="min-h-8 max-h-full text-gray-700 typography-16 font-bold whitespace-pre-wrap break-words leading-relaxed">
                {chipLabel && chronicleContent && (
                  <div className="mb-3 rounded-md border border-cyan-300 bg-cyan-50 p-3">
                    <div className="mb-2 inline-flex items-center rounded-full border border-cyan-400 bg-white px-2 py-0.5 text-xs font-bold text-cyan-700">
                      {chipLabel}
                    </div>
                    <div className="whitespace-pre-wrap break-words text-gray-700">
                      {renderMultilineWithLinks(chronicleContent)}
                    </div>
                  </div>
                )}
                {renderMultilineWithLinks(plainMessage)}
                <div ref={scrollRef} />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

