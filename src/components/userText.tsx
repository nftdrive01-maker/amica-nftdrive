import { useTranslation } from 'react-i18next';
import { useEffect, useRef } from "react";
import { clsx } from "clsx";
import { stripDisplayControlTags } from "@/utils/stringProcessing";

export const UserText = ({ message, compact = false }: { message: string; compact?: boolean }) => {
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
