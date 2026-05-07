import { useEffect, useRef, useState } from "react";
import { clsx } from "clsx";
import { config } from "@/utils/config";
import { IconButton } from "./iconButton";

function renderWithLinks(text: string) {
  const linkRegex = /((?:https?:\/\/)?(?:[a-zA-Z0-9-]+\.)+[a-zA-Z]{2,}(?:\/[\w\-./?%&=+#~:]*)?)/g;
  const parts = text.split(linkRegex);

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

export const AssistantText = ({ message }: { message: string }) => {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [unlimited, setUnlimited] = useState(false)

  // Replace all of the emotion tag in message with ""
  message = message.replace(/\[(.*?)\]/g, "");

  useEffect(() => {
    scrollRef.current?.scrollIntoView({
      behavior: "smooth",
      block: "center",
    });
  });

  return (
    <div className="fixed bottom-0 left-0 mb-20 w-full">
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
              <div className="min-h-8 max-h-full text-gray-700 typography-16 font-bold">
                {renderWithLinks(message.replace(/\[([a-zA-Z]*?)\]/g, ""))}
                <div ref={scrollRef} />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

