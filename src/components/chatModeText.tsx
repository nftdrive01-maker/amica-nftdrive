import { useEffect, useRef, useState } from "react";
import { clsx } from "clsx";
import { config } from "@/utils/config";
import { IconButton } from "./iconButton";
import { useTranslation } from "react-i18next";
import { Message } from "@/features/chat/messages";

export const ChatModeText = ({ messages }: { messages: Message[] }) => {
    const chatScrollRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        chatScrollRef.current?.scrollIntoView({
            behavior: "smooth",
            block: "center",
        });
    }, [messages]);

    return (
        <div className="fixed bottom-0 w-full h-[90%] mb-28 flex flex-col justify-end">
            <div className="w-full h-full overflow-y-auto flex flex-col-reverse">

                <div className="w-full max-w-full mx-auto px-4 md:px-16 flex flex-col">
                    {messages.map((msg, i) => {
                        return (
                            <div key={i} ref={messages.length - 1 === i ? chatScrollRef : null}>
                                <Chat
                                    role={msg.role}
                                    message={(msg.content as string)}
                                    num={i}
                                />
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>

    );
};

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
}: {
    role: string;
    message: string;
    num: number;
}) {
    const { t } = useTranslation();
    const scrollRef = useRef<HTMLDivElement>(null);
    const [unlimited, setUnlimited] = useState(false);
    const normalizedMessage = stripEmotionTags(message);
    const { chipLabel, chronicleContent, plainMessage } = splitChronicleBlock(normalizedMessage);

    // useEffect(() => {
    //     scrollRef.current?.scrollIntoView({
    //         behavior: "smooth",
    //         block: "center",
    //     });
    // });

    return (
        <div className={clsx(
            'mx-auto max-w-4xl my-2',
            role === "assistant" ? "pr-10 sm:pr-20" : "pl-10 sm:pl-20",
        )}>
            <div className="backdrop-blur-lg rounded-lg">
                <div className="shadow-lg backdrop-blur-lg rounded-lg bg-white/70">

                    <div className={clsx(
                        'pr-1 pt-3 pb-2 bg-rose/90 rounded-t-lg text-white font-bold tracking-wider',
                        role === "assistant" ? "px-6" : "px-6",
                    )}>
                        <span className={clsx(
                            "inline-flex px-3 py-1 text-sm rounded-lg rounded-tl-none rounded-tr-none shadow-sm",
                            role === "assistant" ? "bg-pink-600/80" : "bg-cyan-600/80",
                        )}>
                            {role === "assistant" && config('name').toUpperCase()}
                            {role === "user" && t("YOU")}
                        </span>

                        {role === "assistant" && (
                            <IconButton
                                iconName="24/FrameSize"
                                className="bg-transparent hover:bg-transparent active:bg-transparent disabled:bg-transparent float-right"
                                isProcessing={false}
                                onClick={() => setUnlimited(!unlimited)}
                            />

                        )}
                    </div>
                    {role === "assistant" && (
                        <div className={clsx(
                            "px-8 pt-5 pb-4 overflow-y-auto",
                            unlimited ? 'max-h-32' : 'max-h-[calc(75vh)]',
                        )}>
                            <div className="min-h-8 max-h-full typography-16 font-bold text-gray-600">
                                {chipLabel && chronicleContent && (
                                    <div className="mb-3 rounded-md border border-cyan-300 bg-cyan-50 p-3">
                                        <div className="mb-2 inline-flex items-center rounded-full border border-cyan-400 bg-white px-2 py-0.5 text-xs font-bold text-cyan-700">
                                            {chipLabel}
                                        </div>
                                        <div className="whitespace-pre-wrap break-words text-gray-700">
                                            {chronicleContent}
                                        </div>
                                    </div>
                                )}
                                {plainMessage}
                                <div ref={scrollRef} />
                            </div>
                        </div>
                    )}
                    {role === "user" && (
                        <div className="px-8 pt-5 pb-4 max-h-32 overflow-y-auto">
                            <div className="min-h-8 max-h-full typography-16 font-bold text-gray-600">
                                {normalizedMessage}
                                <div ref={scrollRef} />
                            </div>
                        </div>
                    )}
                </div>
            </div>


        </div>

    );
}
