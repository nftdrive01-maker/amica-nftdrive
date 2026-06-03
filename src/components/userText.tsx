import { useTranslation } from 'react-i18next';
import { useEffect, useRef } from "react";
import { clsx } from "clsx";
import { stripDisplayControlTags } from "@/utils/stringProcessing";
import { type Message } from "@/features/chat/messages";

export const UserText = ({ message, attachment, compact = false }: { message: string; attachment?: Message["attachment"]; compact?: boolean }) => {
  const scrollRef = useRef<HTMLDivElement>(null);

  message = stripDisplayControlTags(message);

  useEffect(() => {
    scrollRef.current?.scrollIntoView({
      behavior: "smooth",
      block: "center",
    });
  });

  return (
    <div className="fixed bottom-0 left-0 mb-28 w-full">
      <div className="mx-auto max-w-4xl w-full px-4 md:px-16">
        <div className="relative overflow-hidden rounded-none shadow-[0_22px_64px_rgba(15,23,42,0.2)]">
          <div className="pointer-events-none absolute inset-y-0 left-0 right-0 bg-slate-950/22 backdrop-blur-[3px]" />
          <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(90deg,rgba(15,23,42,0.2)_0%,rgba(15,23,42,0.24)_10%,rgba(15,23,42,0.32)_22%,rgba(15,23,42,0.4)_34%,rgba(15,23,42,0.46)_50%,rgba(15,23,42,0.4)_66%,rgba(15,23,42,0.32)_78%,rgba(15,23,42,0.24)_90%,rgba(15,23,42,0.2)_100%)]" />
          <div className={clsx("relative z-10 md:px-8", compact ? "px-5 py-3" : "px-6 py-5")}>
            <div className={clsx("overflow-y-auto pb-3 pt-0.5", compact ? "max-h-[9vh]" : "max-h-36")}>
              <div className="min-h-8 max-h-full whitespace-pre-wrap break-words text-right text-[15px] font-semibold leading-[1.5] text-white drop-shadow-[0_2px_10px_rgba(15,23,42,0.45)] sm:text-[22px]">
                {attachment?.kind === "image" && (
                  <div className="mb-3 ml-auto max-w-[280px] rounded-md border border-cyan-200/20 bg-cyan-50/10 p-3 text-left">
                    <div className="mb-2 text-xs font-semibold text-cyan-100">添付画像</div>
                    <img
                      src={attachment.dataUrl}
                      alt={attachment.fileName || "attached image"}
                      className="max-h-28 w-full rounded-md border border-cyan-100/20 object-contain"
                    />
                    {attachment.fileName && (
                      <div className="mt-2 text-xs text-cyan-50/80">{attachment.fileName}</div>
                    )}
                  </div>
                )}
                {message}
                <div ref={scrollRef} />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
