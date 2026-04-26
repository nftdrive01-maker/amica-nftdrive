import * as ort from "onnxruntime-web"
ort.env.wasm.wasmPaths = '/_next/static/chunks/'

import { useContext, useEffect, useRef, useState } from "react";
import { useMicVAD } from "@ricky0123/vad-react"
import { IconButton } from "./iconButton";
import { useTranscriber } from "@/hooks/useTranscriber";
import { cleanTranscript, cleanFromPunctuation, cleanFromWakeWord } from "@/utils/stringProcessing";
import { hasOnScreenKeyboard } from "@/utils/hasOnScreenKeyboard";
import { AlertContext } from "@/features/alert/alertContext";
import { ChatContext } from "@/features/chat/chatContext";
import { openaiWhisper  } from "@/features/openaiWhisper/openaiWhisper";
import { whispercpp  } from "@/features/whispercpp/whispercpp";
import { config } from "@/utils/config";
import { WaveFile } from "wavefile";
import { AmicaLifeContext } from "@/features/amicaLife/amicaLifeContext";
import { AudioControlsContext } from "@/features/moshi/components/audioControlsContext";
import { checkInjectionToolHealth, fetchPublicDomainOptions } from "@/lib/injectionClient";


export default function MessageInput({
  userMessage,
  setUserMessage,
  isChatProcessing,
  onChangeUserMessage,
}: {
  userMessage: string;
  setUserMessage: (message: string) => void;
  isChatProcessing: boolean;
  onChangeUserMessage: (
    event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
  ) => void;
}) {
  const transcriber = useTranscriber();
  const inputRef = useRef<HTMLInputElement>(null);
  const [whisperOpenAIOutput, setWhisperOpenAIOutput] = useState<any | null>(null);
  const [whisperCppOutput, setWhisperCppOutput] = useState<any | null>(null);
  const { chat: bot } = useContext(ChatContext);
  const { alert } = useContext(AlertContext);
  const { amicaLife } = useContext(AmicaLifeContext);
  const { audioControls: moshi } = useContext(AudioControlsContext);
  const [ moshiMuted, setMoshiMuted] = useState(moshi.isMuted());
  const [domainMenuOpen, setDomainMenuOpen] = useState(false);
  const [selectedDomain, setSelectedDomain] = useState(config("injection_default_domain"));
  const [domainOptions, setDomainOptions] = useState<Array<{ id: string; label: string }>>(() => {
    const fallback = [
      { id: 'consultation', label: '専門相談' },
      { id: 'facility_guide', label: '施設案内' },
      { id: 'urgent_notice', label: '緊急告知' },
    ];

    try {
      const parsed = JSON.parse(config("injection_domain_options"));
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed;
      }
      return fallback;
    } catch {
      return fallback;
    }
  });

  const selectedDomainLabel =
    domainOptions.find((domain: { id: string; label: string }) => domain.id === selectedDomain)?.label ||
    config("injection_default_domain_label");

  useEffect(() => {
    const applyDefaultDomainFromApi = async () => {
      try {
        const defaultDomainId = config("injection_default_domain");
        const isHealthy = await checkInjectionToolHealth();

        if (isHealthy) {
          const optionsFromApi = await fetchPublicDomainOptions();
          if (optionsFromApi.length > 0) {
            setDomainOptions(optionsFromApi);
          }

          const hasDefault = optionsFromApi.some((domain) => domain.id === defaultDomainId);
          if (hasDefault) {
            setSelectedDomain(defaultDomainId);
          } else if (optionsFromApi.length > 0) {
            setSelectedDomain(optionsFromApi[0].id);
          } else {
            setSelectedDomain(defaultDomainId);
          }
          return;
        }

        setSelectedDomain(defaultDomainId);
      } catch {
        setSelectedDomain(config("injection_default_domain"));
      }
    };

    applyDefaultDomainFromApi();
  }, []);

  const vad = useMicVAD({
    startOnLoad: false,
    onSpeechStart: () => {
      console.debug('vad', 'on_speech_start');
      console.time('performance_speech');
    },
    onSpeechEnd: (audio: Float32Array) => {
      console.debug('vad', 'on_speech_end');
      console.timeEnd('performance_speech');
      console.time('performance_transcribe');
      (window as any).chatvrm_latency_tracker = {
        start: +Date.now(),
        active: true,
      };

      try {
        switch (config("stt_backend")) {
          case 'whisper_browser': {
            console.debug('whisper_browser attempt');
            // since VAD sample rate is same as whisper we do nothing here
            // both are 16000
            const audioCtx = new AudioContext();
            const buffer = audioCtx.createBuffer(1, audio.length, 16000);
            buffer.copyToChannel(audio, 0, 0);
            transcriber.start(buffer);
            break;
          }
          case 'whisper_openai': {
            console.debug('whisper_openai attempt');
            const wav = new WaveFile();
            wav.fromScratch(1, 16000, '32f', audio);
            const file = new File([wav.toBuffer()], "input.wav", { type: "audio/wav" });

            let prompt;
            // TODO load prompt if it exists

            (async () => {
              try {
                const transcript = await openaiWhisper(file, prompt);
                setWhisperOpenAIOutput(transcript);
              } catch (e: any) {
                console.error('whisper_openai error', e);
                alert.error('whisper_openai error', e.toString());
              }
            })();
            break;
          }
          case 'whispercpp': {
            console.debug('whispercpp attempt');
            const wav = new WaveFile();
            wav.fromScratch(1, 16000, '32f', audio);
            wav.toBitDepth('16');
            const file = new File([wav.toBuffer()], "input.wav", { type: "audio/wav" });

            let prompt;
            // TODO load prompt if it exists

            (async () => {
              try {
                const transcript = await whispercpp(file, prompt);
                setWhisperCppOutput(transcript);
              } catch (e: any) {
                console.error('whispercpp error', e);
                alert.error('whispercpp error', e.toString());
              }
            })();
            break;
          }
        }
      } catch (e: any) {
        console.error('stt_backend error', e);
        alert.error('STT backend error', e.toString());
      }
    },
  });

  if (vad.errored) {
    console.error('vad error', vad.errored);
  }

  function handleTranscriptionResult(preprocessed: string) {
    const cleanText = cleanTranscript(preprocessed);
    const wakeWordEnabled = config("wake_word_enabled") === 'true';
    const textStartsWithWakeWord = wakeWordEnabled && cleanFromPunctuation(cleanText).startsWith(cleanFromPunctuation(config("wake_word")));
    const text = wakeWordEnabled && textStartsWithWakeWord ? cleanFromWakeWord(cleanText, config("wake_word")) : cleanText;

    if (wakeWordEnabled) {
      // Text start with wake word
      if (textStartsWithWakeWord) {
        // Pause amicaLife and update bot's awake status when speaking
        if (config("amica_life_enabled") === "true") {
          amicaLife.pause();
        }
        bot.updateAwake();
      // Case text doesn't start with wake word and not receive trigger message in amica life
      } else {
        if (config("amica_life_enabled") === "true" && amicaLife.triggerMessage !== true && !bot.isAwake()) {
          bot.updateAwake();
        }
      }
    } else {
      // If wake word off, update bot's awake when speaking
      if (config("amica_life_enabled") === "true") {
        amicaLife.pause();
        bot.updateAwake();
      }
    }


    if (text === "") {
      return;
    }


    if (config("autosend_from_mic") === 'true') {
      if (!wakeWordEnabled || bot.isAwake()) {
        bot.receiveMessageFromUser(text, false, selectedDomain);
      } 
    } else {
      setUserMessage(text);
    }
    console.timeEnd('performance_transcribe');
  }

  function handleInputChange(event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) {
    onChangeUserMessage(event); 
  
    // Pause amicaLife and update bot's awake status when typing
    if (config("amica_life_enabled") === "true") {
      amicaLife.pause();
      bot.updateAwake();
    }
  }

  // for whisper_browser
  useEffect(() => {
    if (transcriber.output && ! transcriber.isBusy) {
      const output = transcriber.output?.text;
      handleTranscriptionResult(output);
    }
  }, [transcriber]);

  // for whisper_openai
  useEffect(() => {
    if (whisperOpenAIOutput) {
      const output = whisperOpenAIOutput?.text;
      handleTranscriptionResult(output);
    }
  }, [whisperOpenAIOutput]);

  // for whispercpp
  useEffect(() => {
    if (whisperCppOutput) {
      const output = whisperCppOutput?.text;
      handleTranscriptionResult(output);
    }
  }, [whisperCppOutput]);

  function clickedSendButton() {
    bot.receiveMessageFromUser(userMessage, false, selectedDomain);
    // only if we are using non-VAD mode should we focus on the input
    if (! vad.listening) {
      if (! hasOnScreenKeyboard()) {
        inputRef.current?.focus();
      }
    }
    setUserMessage("");
  }

  return (
    <div className="fixed bottom-2 z-20 w-full">
      <div className="mx-auto max-w-4xl p-2 backdrop-blur-lg border-0 rounded-lg">
        <div className="mb-1 px-1 text-xs text-white/90">
          ナレッジ：{selectedDomainLabel}
        </div>
        <div className="grid grid-flow-col grid-cols-[min-content_min-content_1fr_min-content] gap-[8px]">
          <div>
            <div className='flex flex-col justify-center items-center'>
              {config("chatbot_backend") === "moshi" ? (
                <IconButton
                iconName={!moshiMuted ? "24/PauseAlt" : "24/Microphone"}
                className="bg-secondary hover:bg-secondary-hover active:bg-secondary-press disabled:bg-secondary-disabled"
                isProcessing={moshiMuted && moshi.getRecorder() != null}
                disabled={!moshi.getRecorder()}
                onClick={() => {
                  moshi.toggleMute();
                  setMoshiMuted(!moshiMuted);
                }}
              />
              ) : (
                <IconButton
                iconName={vad.listening ? "24/PauseAlt" : "24/Microphone"}
                className="bg-secondary hover:bg-secondary-hover active:bg-secondary-press disabled:bg-secondary-disabled"
                isProcessing={vad.userSpeaking}
                disabled={config('stt_backend') === 'none' || vad.loading || Boolean(vad.errored)}
                onClick={vad.toggle}
              />
              )}
            </div>
          </div>

          <div className="relative flex flex-col justify-center items-center">
            <button
              type="button"
              className="h-8 w-8 rounded-lg bg-secondary text-white hover:bg-secondary-hover active:bg-secondary-press flex items-center justify-center"
              onClick={() => setDomainMenuOpen((prev) => !prev)}
              title={`ナレッジ: ${selectedDomainLabel}`}
            >
              {/* 本（ナレッジ）アイコン */}
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
                <path d="M11.25 4.533A9.707 9.707 0 006 3a9.735 9.735 0 00-3.25.555.75.75 0 00-.5.707v14.25a.75.75 0 001 .707A8.237 8.237 0 016 18.75c1.995 0 3.823.707 5.25 1.886V4.533zM12.75 20.636A8.214 8.214 0 0118 18.75c.966 0 1.89.166 2.75.47a.75.75 0 001-.708V4.262a.75.75 0 00-.5-.707A9.735 9.735 0 0018 3a9.707 9.707 0 00-5.25 1.533v16.103z" />
              </svg>
            </button>

            {domainMenuOpen && (
              <div className="absolute bottom-10 left-0 z-30 min-w-[160px] rounded-md bg-white shadow-md ring-1 ring-gray-200">
                {domainOptions.map((domain: { id: string; label: string }) => (
                  <button
                    key={domain.id}
                    type="button"
                    className={`block w-full px-3 py-2 text-left text-sm hover:bg-gray-100 ${selectedDomain === domain.id ? 'font-bold' : ''}`}
                    onClick={() => {
                      setSelectedDomain(domain.id);
                      setDomainMenuOpen(false);
                    }}
                  >
                    {domain.label}
                  </button>
                ))}
              </div>
            )}
          </div>

          <input
            type="text"
            ref={inputRef}
            placeholder={config("chatbot_backend") === "moshi" ? "Disabled in moshi chatbot" : "Write message here..."}
            onChange={handleInputChange}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                if (hasOnScreenKeyboard()) {
                  inputRef.current?.blur();
                }

                if (userMessage === "") {
                  return false;
                }

                clickedSendButton();
              }
            }}
            disabled={config("chatbot_backend") === "moshi"}

            className="disabled block w-full rounded-md border-0 py-1.5 text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-1 focus:ring-inset focus:ring-gray-400 sm:text-sm sm:leading-6"
            value={userMessage}
            autoComplete="off"
          />

          <div className='flex flex-col justify-center items-center'>
            <IconButton
              iconName="24/Send"
              className="ml-2 bg-secondary hover:bg-secondary-hover active:bg-secondary-press disabled:bg-secondary-disabled"
              isProcessing={isChatProcessing || transcriber.isBusy}
              disabled={isChatProcessing || !userMessage || transcriber.isModelLoading || config("chatbot_backend") === "moshi"}
              onClick={clickedSendButton}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
