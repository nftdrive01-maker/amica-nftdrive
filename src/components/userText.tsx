import { useTranslation } from 'react-i18next';
import { useEffect, useRef } from "react";

export const UserText = ({ message }: { message: string }) => {
  const scrollRef = useRef<HTMLDivElement>(null);

  // Replace all of the emotion tag in message with ""
  message = message.replace(/\[(.*?)\]/g, "");

  useEffect(() => {
    scrollRef.current?.scrollIntoView({
      behavior: "smooth",
      block: "center",
    });
  });

  return (
    <div className="fixed bottom-0 left-0 mb-28 w-full">
      <div className="mx-auto max-w-4xl w-full px-4 md:px-16">
        <div className="relative overflow-hidden rounded-[28px] shadow-[0_22px_64px_rgba(15,23,42,0.2)]">
          <div className="pointer-events-none absolute inset-y-0 left-0 right-0 bg-slate-950/22 backdrop-blur-[3px]" />
          <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(90deg,rgba(255,255,255,0.04)_0%,rgba(255,255,255,0.015)_7%,rgba(15,23,42,0.2)_16%,rgba(15,23,42,0.34)_28%,rgba(15,23,42,0.46)_50%,rgba(15,23,42,0.34)_72%,rgba(15,23,42,0.2)_84%,rgba(255,255,255,0.015)_93%,rgba(255,255,255,0.04)_100%)]" />
          <div className="relative z-10 px-6 py-5 md:px-8">
            <div className="max-h-36 overflow-y-auto pb-3 pt-0.5">
              <div className="min-h-8 max-h-full whitespace-pre-wrap break-words text-right text-[17px] font-semibold leading-[1.5] text-white drop-shadow-[0_2px_10px_rgba(15,23,42,0.45)] sm:text-[22px]">
                {message.replace(/\[([a-zA-Z]*?)\]/g, "")}
                <div ref={scrollRef} />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
