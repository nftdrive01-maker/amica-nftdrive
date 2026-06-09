import { Queue } from "typescript-collections";
import { Message, Role, Screenplay, Talk, textsToScreenplay, type ChatImageAttachment } from "./messages";
import { Viewer } from "@/features/vrmViewer/viewer";
import { Alert } from "@/features/alert/alert";

import { getEchoChatResponseStream } from "./echoChat";
import {
  getArbiusChatResponseStream,
} from "./arbiusChat";
import {
  getOpenAiChatResponseStream,
  getOpenAiVisionChatResponse,
} from "./openAiChat";
import {
  getLlamaCppChatResponseStream,
  getLlavaCppChatResponse,
} from "./llamaCppChat";
import { getWindowAiChatResponseStream } from "./windowAiChat";
import {
  getOllamaChatResponseStream,
  getOllamaVisionChatResponse,
} from "./ollamaChat";
import { getKoboldAiChatResponseStream } from "./koboldAiChat";
import { getReasoingEngineChatResponseStream } from "./reasoiningEngineChat";
import { fetchInjectedContext, getDomainVoiceConfig } from "@/lib/injectionClient";
import type { InjectionInterceptResponse } from "@/types/injection";

import { rvc } from "@/features/rvc/rvc";
import { coquiLocal } from "@/features/coquiLocal/coquiLocal";
import { piper } from "@/features/piper/piper";
import { elevenlabs } from "@/features/elevenlabs/elevenlabs";
import { speecht5 } from "@/features/speecht5/speecht5";
import { openaiTTS } from "@/features/openaiTTS/openaiTTS";
import { localXTTSTTS } from "@/features/localXTTS/localXTTS";
import { kokoro } from "../kokoro/kokoro";
import { stylebertvits2 } from "@/features/stylebertvits2/stylebertvits2";

import { AmicaLife } from "@/features/amicaLife/amicaLife";

import { config, updateConfig } from "@/utils/config";
import { cleanTalk } from "@/utils/cleanTalk";
import { processResponse } from "@/utils/processResponse";
import { wait } from "@/utils/wait";
import isDev from '@/utils/isDev';

import { isCharacterIdle, characterIdleTime, resetIdleTimer } from "@/utils/isIdle";
import { getOpenRouterChatResponseStream } from './openRouterChat';
import { handleUserInput } from '../externalAPI/externalAPI';
import { loadVRMAnimation } from '@/lib/VRMAnimation/loadVRMAnimation';
import { sessionManager } from '@/lib/sessionManager';

function resolveActiveDomainId(): string {
  const selectedDomainId =
    typeof window !== 'undefined'
      ? (window.localStorage.getItem('amica_selected_domain_id') || '').trim()
      : '';
  const defaultDomainId = (config('injection_default_domain') || '').trim();

  return selectedDomainId || defaultDomainId || 'default';
}

function generateHistoryId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return `hist_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

type Speak = {
  audioBuffer: ArrayBuffer | null;
  screenplay: Screenplay;
  streamIdx: number;
  domainId?: string;
  bubbleToChat?: boolean;
};

type TTSJob = {
  screenplay: Screenplay;
  streamIdx: number;
  domainId?: string;
  bubbleToChat?: boolean;
};

const AMICA_LIFE_JAPANESE_RULE = [
  "【Amica Life 言語ルール】",
  "- 応答は必ず自然な日本語で行う。",
  "- 中国語（簡体字・繁体字）の文は出力しない。",
  "- 不自然な文になった場合は、短く日本語で言い直す。",
].join("\n");

const CHRONICLE_TRIGGER_MARKER = '[[USE_CHRONICLE]]';

function summarizeChronicleMainContent(content: string, maxLen = 180): string {
  const mainSection = (content.split(/---\s*出典\s*---/)[0] || content)
    .replace(/\r/g, "")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line && line !== "出典")
    .join(" ")
    .replace(/\s{2,}/g, " ")
    .trim();

  if (!mainSection) {
    return "";
  }

  const sentences = mainSection
    .split(/(?<=[。！？.!?])\s*/)
    .map((s) => s.trim())
    .filter(Boolean);

  let summary = "";
  for (const sentence of sentences) {
    if (!summary) {
      summary = sentence;
      if (summary.length >= maxLen) {
        break;
      }
      continue;
    }

    const candidate = `${summary} ${sentence}`;
    if (candidate.length > maxLen) {
      break;
    }
    summary = candidate;
  }

  if (!summary) {
    summary = mainSection.slice(0, maxLen);
  }

  return summary.trim();
}

function buildTtsSafeReactionText(text: string, maxLen = 120): string {
  const normalized = text
    .replace(/\[(neutral|happy|sad|angry|fear|surprised|disgust|relaxed|shy|jealous|bored|serious|suspicious|victory|sleep|love)\]\s*/gi, "")
    .replace(/[\r\n]+/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();

  if (normalized.length <= maxLen) {
    return normalized;
  }

  return `${normalized.slice(0, Math.max(0, maxLen - 1)).trim()}…`;
}

function stripRoleDecorators(text: string): string {
  return text
    .replace(/\[(neutral|happy|sad|angry|fear|surprised|disgust|relaxed|shy|jealous|bored|serious|suspicious|victory|sleep|love)\]\s*/gi, "")
    .replace(/[\r\n\t]+/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();
}

export class Chat {
  public initialized: boolean;

  public amicaLife?: AmicaLife;
  public viewer?: Viewer;
  public alert?: Alert;

  private currentResponseGuard?: {
    forceJapanese?: boolean;
  };

    // TTS向けに、意味のない記号列や装飾を除去
  private sanitizeTtsMessage(text: string): string {
    return text
      // URLを除去（TTSで読み上げないようにする）
      .replace(/https?:\/\/[^\s]+/g, "")
      // www 形式URLを除去
      .replace(/\bwww\.[^\s]+/gi, "")
      // スキームなしドメイン（例: example.com/path）を除去
      .replace(/\b(?:[a-z0-9-]+\.)+[a-z]{2,}(?:\/[\w\-./?%&=+#~:]*)?/gi, "")
      // 出典URLの見出し行を除去
      .replace(/(?:^|\n)\s*(?:出典URL|参照URL)\s*[:：]\s*(?=\n|$)/g, "\n")
      // URLのみの箇条書き行を除去
      .replace(/(?:^|\n)\s*[-*・]\s*(?:https?:\/\/|www\.)[^\n]*/g, "\n")
      // Markdownの水平線っぽい記号列を削除
      .replace(/(^|\n)\s*[-_*＝=]{3,}\s*(?=\n|$)/g, "\n")
      // 連続ハイフン/アンダーバー等を空白化
      .replace(/[-_＝=~]{3,}/g, " ")
      // 記号だけの行を削除
      .split(/\r?\n/)
      .filter((line) => !/^[\s`'".,、。!！?？:：;；/\\|()[\]{}<>…・･\-_=~＊*]+$/.test(line))
      .join(" ")
      // 余分な空白を整理
      .replace(/\s{2,}/g, " ")
      .trim();
  }

  private containsLikelyChinese(text: string): boolean {
    if (!text) {
      return false;
    }

    const normalized = text.replace(/\s+/g, "").trim();
    if (!normalized) {
      return false;
    }

    // Japanese text usually contains kana; kana-first check avoids over-blocking kanji-only words.
    if (/[ぁ-んァ-ヶ]/.test(normalized)) {
      return false;
    }

    const hasSimplifiedOnlyChars = /[这们说时会开见来对为是个国后里没从点]/.test(normalized);
    const chineseFunctionWords = normalized.match(/的|了|在|是|我|你|他|她|们|不|有|和|也|都|很|吗|呢|啊|吧|着/g) || [];
    const cjkChars = normalized.match(/[\u4E00-\u9FFF]/g) || [];

    return hasSimplifiedOnlyChars || (cjkChars.length >= 6 && chineseFunctionWords.length >= 2);
  }

  private containsLikelyEnglish(text: string): boolean {
    if (!text) {
      return false;
    }

    const normalized = text.replace(/\s+/g, " ").trim();
    if (!normalized) {
      return false;
    }

    const latinLetters = normalized.match(/[A-Za-z]/g)?.length ?? 0;
    const japaneseChars = normalized.match(/[ぁ-んァ-ヶ一-龯]/g)?.length ?? 0;

    return latinLetters >= 12 && latinLetters >= japaneseChars;
  }

  private shouldForceJapaneseForCurrentResponse(): boolean {
    return Boolean(
      this.currentResponseGuard?.forceJapanese ||
      this.pendingMcpInfo?.toolName === 'search_web',
    );
  }


  public setChatLog?: (messageLog: Message[]) => void;
  public setUserMessage?: (message: string) => void;
  public setAssistantMessage?: (message: string) => void;
  public setAssistantDbResult?: (dbResult?: Message["dbResult"]) => void;
  public setShownMessage?: (role: Role) => void;
  public setChatProcessing?: (processing: boolean) => void;
  public setChatSpeaking?: (speaking: boolean) => void;
  public setThoughtMessage?: (message: string) => void;

  // the message from the user that is currently being processed
  // it can be reset
  public stream: ReadableStream<Uint8Array> | null;
  public streams: ReadableStream<Uint8Array>[];
  public reader: ReadableStreamDefaultReader<Uint8Array> | null;
  public readers: ReadableStreamDefaultReader<Uint8Array>[];

  // process these immediately as they come in and add to audioToPlay
  public ttsJobs: Queue<TTSJob>;

  // this should be read as soon as they exist
  // and then deleted from the queue
  public speakJobs: Queue<Speak>;

  private currentAssistantMessage: string;
  private currentAssistantDbResult?: Message["dbResult"];
  private currentAssistantMcpInfo?: Message["mcpInfo"];
  private currentAssistantAttachment?: ChatImageAttachment;
  private currentAssistantHistoryId?: string;
  private currentAssistantDomainId?: string;
  private currentAssistantCreatedAt?: number;
  private currentUserMessage: string;
  private currentUserHistoryId?: string;
  private currentUserDomainId?: string;
  private currentUserCreatedAt?: number;
  private currentUserAttachment?: ChatImageAttachment;
  private thoughtMessage: string;
  private pendingDbResult?: Message["dbResult"];
  private pendingMcpInfo?: Message["mcpInfo"];
  private pendingChronicleDecoratedBlock: string;
  private speakingNow: boolean;
  private currentPlaybackAudioContext: AudioContext | null;
  private currentPlaybackSource: AudioBufferSourceNode | null;
  private currentPlaybackResolve: (() => void) | null;

  private lastAwake: number;

  public messageList: Message[];

  public currentStreamIdx: number;

  private eventSource: EventSource | null = null

  private isRateLimitedError(error: unknown): boolean {
    const message = error instanceof Error ? error.message : String(error || '');
    return message.includes('RATE_LIMITED:');
  }

  private toRateLimitedMessage(error: unknown): string {
    const message = error instanceof Error ? error.message : String(error || '');
    return message.replace(/^Browser fetch error:\s*/, '').replace(/^RATE_LIMITED:\s*/, '').trim();
  }

  constructor() {
    this.initialized = false;

    this.stream = null;
    this.reader = null;
    this.streams = [];
    this.readers = [];

    this.ttsJobs = new Queue<TTSJob>();
    this.speakJobs = new Queue<Speak>();

    this.currentAssistantMessage = "";
    this.currentAssistantDbResult = undefined;
    this.currentAssistantMcpInfo = undefined;
    this.currentAssistantAttachment = undefined;
    this.currentAssistantHistoryId = undefined;
    this.currentAssistantDomainId = undefined;
    this.currentAssistantCreatedAt = undefined;
    this.currentUserMessage = "";
    this.currentUserHistoryId = undefined;
    this.currentUserDomainId = undefined;
    this.currentUserCreatedAt = undefined;
    this.currentUserAttachment = undefined;
    this.thoughtMessage = "";
    this.pendingDbResult = undefined;
    this.pendingMcpInfo = undefined;
    this.pendingChronicleDecoratedBlock = "";
    this.speakingNow = false;
    this.currentPlaybackAudioContext = null;
    this.currentPlaybackSource = null;
    this.currentPlaybackResolve = null;

    this.messageList = [];
    this.currentStreamIdx = 0;

    this.lastAwake = 0;
  }

  private buildChronicleDecoratedBlock(input?: {
    title?: string;
    content?: string;
    sourceName?: string;
  }): string {
    const content = typeof input?.content === "string" ? input.content.trim() : "";
    if (!content) {
      return "";
    }

    const title = (input?.title || "CHRONICLE").trim();
    const source = input?.sourceName ? ` (${input.sourceName})` : "";

    return `[[CHRONICLE_TITLE:${title}${source}]]\n${content}\n[[/CHRONICLE]]\n\n`;
  }

  private buildChronicleReactionMessage(options: {
    used?: boolean;
    error?: string;
    sourceName?: string;
    content?: string;
  }): string {
    if (options.used) {
      const source = options.sourceName ? `（${options.sourceName}）` : "";
      const summary = typeof options.content === "string"
        ? summarizeChronicleMainContent(options.content)
        : "";

      if (summary) {
        return `[neutral] CHRONICLE${source}の結果を整理します。要点は「${summary}」です。必要なら、この内容をもとに優先度つきで次のアクションを具体化します。`;
      }

      return `[neutral] CHRONICLE${source}の結果を整理しました。重要ポイントを優先順位つきで説明できるので、必要なら次に実行する項目まで具体化します。`;
    }

    const reason = options.error ? `（${options.error}）` : "";
    return `[neutral] CHRONICLEの取得に失敗しました${reason}。接続先やタイムアウト設定を確認しつつ、必要なら再実行します。`;
  }

  private getLatestDbConversationContext(): { previousUserText: string; summary?: string } | null {
    for (let index = this.messageList.length - 1; index >= 0; index--) {
      const message = this.messageList[index];
      if (message.role !== "assistant" || !message.dbResult) {
        continue;
      }

      for (let prevIndex = index - 1; prevIndex >= 0; prevIndex--) {
        const previousMessage = this.messageList[prevIndex];
        if (previousMessage.role !== "user") {
          continue;
        }

        const previousUserText = stripRoleDecorators(previousMessage.content || "");
        if (!previousUserText) {
          break;
        }

        return {
          previousUserText,
          summary: message.dbResult.summary,
        };
      }
    }

    return null;
  }

  private shouldCarryDbSearchContext(userText: string, previousUserText: string): boolean {
    const currentText = stripRoleDecorators(userText);
    const priorText = stripRoleDecorators(previousUserText);

    if (!currentText || !priorText) {
      return false;
    }

    if (!/(物件|部屋|賃貸|不動産)/i.test(priorText)) {
      return false;
    }

    if (/(物件|部屋|賃貸|不動産|顧客|契約|テーブル|カラム|スキーマ|SQL|DB|データベース)/i.test(currentText)) {
      return false;
    }

    return /(検索|探して|絞|条件|一覧|表示|見せて|件数|市|区|町|村|駅|沿線|ペット|家賃|築|間取り|広さ|駐車場)/i.test(currentText);
  }

  private buildInjectionUserText(userText: string, hasChronicleMarker: boolean): string {
    const normalizedText = stripRoleDecorators(userText);
    const latestDbContext = this.getLatestDbConversationContext();

    let effectiveText = normalizedText;
    if (latestDbContext && this.shouldCarryDbSearchContext(normalizedText, latestDbContext.previousUserText)) {
      const contextParts = [
        "これは前回の表示結果の要約ではなく、新しいDB再検索依頼です。前回の表示内容だけで答えず、必ずDBへ再問い合わせしてください。",
        `検索対象: ${latestDbContext.previousUserText}`,
      ];

      contextParts.push(`追加条件: ${normalizedText}`);
      effectiveText = contextParts.join("\n");
    }

    return hasChronicleMarker
      ? `${CHRONICLE_TRIGGER_MARKER} ${effectiveText}`
      : effectiveText;
  }

  public initialize(
    amicaLife: AmicaLife,
    viewer: Viewer,
    alert: Alert,
    setChatLog: (messageLog: Message[]) => void,
    setUserMessage: (message: string) => void,
    setAssistantMessage: (message: string) => void,
    setAssistantDbResult: (dbResult?: Message["dbResult"]) => void,
    setThoughtMessage: (message: string) => void,
    setShownMessage: (role: Role) => void,
    setChatProcessing: (processing: boolean) => void,
    setChatSpeaking: (speaking: boolean) => void,
  ) {
    this.amicaLife = amicaLife;
    this.viewer = viewer;
    this.alert = alert;
    this.setChatLog = setChatLog;
    this.setUserMessage = setUserMessage;
    this.setAssistantMessage = setAssistantMessage;
    this.setAssistantDbResult = setAssistantDbResult;
    this.setShownMessage = setShownMessage;
    this.setThoughtMessage = setThoughtMessage;
    this.setChatProcessing = setChatProcessing;
    this.setChatSpeaking = setChatSpeaking;

    // these will run forever
    this.processTtsJobs();
    this.processSpeakJobs();

    this.updateAwake();
    this.initialized = true;

    this.initSSE();
  }

  public setMessageList(messages: Message[]) {
    this.messageList = messages;
    this.currentAssistantMessage = "";
    this.currentAssistantDbResult = undefined;
    this.currentAssistantMcpInfo = undefined;
    this.currentAssistantAttachment = undefined;
    this.currentAssistantHistoryId = undefined;
    this.currentAssistantDomainId = undefined;
    this.currentAssistantCreatedAt = undefined;
    this.currentUserMessage = "";
    this.currentUserHistoryId = undefined;
    this.currentUserDomainId = undefined;
    this.currentUserCreatedAt = undefined;
    this.currentUserAttachment = undefined;
    this.setChatLog!(this.messageList!);
    this.setAssistantMessage!(this.currentAssistantMessage);
    this.setAssistantDbResult?.(undefined);
    this.setUserMessage!(this.currentAssistantMessage);
    this.currentStreamIdx++;
  }

  public async handleRvc(audio: any) {
    const rvcModelName = config("rvc_model_name");
    const rvcIndexPath = config("rvc_index_path");
    const rvcF0upKey = parseInt(config("rvc_f0_upkey"));
    const rvcF0Method = config("rvc_f0_method");
    const rvcIndexRate = config("rvc_index_rate");
    const rvcFilterRadius = parseInt(config("rvc_filter_radius"));
    const rvcResampleSr = parseInt(config("rvc_resample_sr"));
    const rvcRmsMixRate = parseInt(config("rvc_rms_mix_rate"));
    const rvcProtect = parseInt(config("rvc_protect"));

    const voice = await rvc(
      audio,
      rvcModelName,
      rvcIndexPath,
      rvcF0upKey,
      rvcF0Method,
      rvcIndexRate,
      rvcFilterRadius,
      rvcResampleSr,
      rvcRmsMixRate,
      rvcProtect,
    );

    return voice.audio;
  }

  public idleTime(): number {
    return characterIdleTime(this.lastAwake);
  }

  public isAwake() {
    return !isCharacterIdle(this.lastAwake);
  }

  public updateAwake() {
    this.lastAwake = new Date().getTime();
    resetIdleTimer();
  }

  public async processTtsJobs() {
    while (true) {
      do {
        const ttsJob = this.ttsJobs.dequeue();
        if (!ttsJob) {
          break;
        }

        if (ttsJob.streamIdx !== this.currentStreamIdx) {
          console.log("skipping tts for streamIdx");
          continue;
        }

        const audioBuffer = await this.fetchAudio(ttsJob.screenplay.talk, ttsJob.domainId);
        this.speakJobs.enqueue({
          audioBuffer,
          screenplay: ttsJob.screenplay,
          streamIdx: ttsJob.streamIdx,
          domainId: ttsJob.domainId,
          bubbleToChat: ttsJob.bubbleToChat,
        });
      } while (this.ttsJobs.size() > 0);
      await wait(50);
    }
  }

  public async processSpeakJobs() {
    while (true) {
      do {
        const speak = this.speakJobs.dequeue();
        if (!speak) {
          break;
        }
        if (speak.streamIdx !== this.currentStreamIdx) {
          console.log("skipping speak for streamIdx");
          continue;
        }

        console.debug("speak dequeue", {
          streamIdx: speak.streamIdx,
          currentStreamIdx: this.currentStreamIdx,
          text: speak.screenplay.text,
          hasAudioBuffer: !!speak.audioBuffer,
        });

        if ((window as any).chatvrm_latency_tracker) {
          if ((window as any).chatvrm_latency_tracker.active) {
            const ms =
              +new Date() - (window as any).chatvrm_latency_tracker.start;
            console.log("performance_latency", ms);
            (window as any).chatvrm_latency_tracker.active = false;
          }
        }

        if (speak.bubbleToChat !== false) {
          this.bubbleMessage("assistant", speak.screenplay.text);
        }

        if (config("tts_muted") === "true") {
          this.speakingNow = false;
          this.setChatSpeaking!(false);
          this.isAwake() ? this.updateAwake() : null;
          continue;
        }

        if (speak.audioBuffer) {
          this.speakingNow = true;
          this.setChatSpeaking!(true);
          console.debug("speak start", {
            streamIdx: speak.streamIdx,
            text: speak.screenplay.text,
          });
          if (this.viewer?.model) {
            await this.viewer.model.speak(speak.audioBuffer, speak.screenplay);
          } else {
            // VRM非表示時：AudioContextで直接音声再生し、終了まで待機
            await new Promise<void>((resolve) => {
              try {
                const audioCtx = new AudioContext();
                audioCtx.decodeAudioData(speak.audioBuffer!.slice(0), (decoded) => {
                  const source = audioCtx.createBufferSource();
                  source.buffer = decoded;
                  source.connect(audioCtx.destination);
                  this.currentPlaybackAudioContext = audioCtx;
                  this.currentPlaybackSource = source;
                  this.currentPlaybackResolve = resolve;
                  source.start();
                  source.addEventListener("ended", () => {
                    if (this.currentPlaybackSource === source) {
                      this.currentPlaybackSource = null;
                    }
                    if (this.currentPlaybackAudioContext === audioCtx) {
                      this.currentPlaybackAudioContext = null;
                    }
                    if (this.currentPlaybackResolve === resolve) {
                      this.currentPlaybackResolve = null;
                    }
                    void audioCtx.close();
                    resolve();
                  }, { once: true });
                }, () => resolve());
              } catch {
                resolve();
              }
            });
          }
          console.debug("speak end", {
            streamIdx: speak.streamIdx,
            text: speak.screenplay.text,
          });
          this.speakingNow = false;
          this.setChatSpeaking!(false);
          this.isAwake() ? this.updateAwake() : null;
        }
      } while (this.speakJobs.size() > 0);
      await wait(50);
    }
  }

  public thoughtBubbleMessage(isThinking: boolean, thought: string) {
    // if not thinking, we should clear the thought bubble 
    if (!isThinking) {
      this.thoughtMessage = "";
      this.setThoughtMessage!("");
      return;
    }

    if (this.thoughtMessage !== "") {
      this.thoughtMessage += " ";
    }
    this.thoughtMessage += thought;
    this.setThoughtMessage!(this.thoughtMessage);
  }

  public isSpeaking(): boolean {
    return this.speakingNow;
  }

  private stopCurrentPlayback() {
    this.viewer?.model?.stopSpeaking();

    const source = this.currentPlaybackSource;
    const audioContext = this.currentPlaybackAudioContext;
    const resolve = this.currentPlaybackResolve;

    this.currentPlaybackSource = null;
    this.currentPlaybackAudioContext = null;
    this.currentPlaybackResolve = null;
    this.speakingNow = false;
    this.setChatSpeaking?.(false);

    if (source) {
      try {
        source.stop();
      } catch {
        // no-op
      }
    }

    if (audioContext) {
      void audioContext.close().catch(() => undefined);
    }

    resolve?.();
  }

  public speakAssistantReaction(text: string, domainId?: string): void {
    const reaction = (text || '').trim();
    if (!reaction) {
      return;
    }

    const effectiveDomainId = (domainId || '').trim() || resolveActiveDomainId();

    this.bubbleMessage('assistant', reaction);

    const screenplays = textsToScreenplay([reaction]);
    if (screenplays.length === 0) {
      return;
    }

    this.ttsJobs.enqueue({
      screenplay: screenplays[0],
      streamIdx: this.currentStreamIdx,
      domainId: effectiveDomainId,
      bubbleToChat: false,
    });
  }

  public speakPresentationText(text: string, domainId?: string): void {
    const presentationText = (text || "").trim();
    if (!presentationText) {
      return;
    }

    const effectiveDomainId = (domainId || "").trim() || resolveActiveDomainId();

    this.currentStreamIdx++;
    this.ttsJobs.clear();
    this.speakJobs.clear();
    this.stopCurrentPlayback();

    if (this.currentAssistantMessage !== "") {
      this.messageList!.push({
        role: "assistant",
        content: this.currentAssistantMessage,
        dbResult: this.currentAssistantDbResult,
        mcpInfo: this.currentAssistantMcpInfo,
        attachment: this.currentAssistantAttachment,
        historyId: this.currentAssistantHistoryId,
        domainId: this.currentAssistantDomainId,
        createdAt: this.currentAssistantCreatedAt,
      });
    }

    this.currentAssistantMessage = "";
    this.currentAssistantDbResult = undefined;
    this.currentAssistantMcpInfo = undefined;
    this.currentAssistantAttachment = undefined;
    this.currentAssistantHistoryId = undefined;
    this.currentAssistantCreatedAt = undefined;
    this.currentAssistantDomainId = effectiveDomainId;
    this.pendingDbResult = undefined;
    this.pendingMcpInfo = undefined;
    this.setAssistantDbResult?.(undefined);

    this.bubbleMessage("assistant", presentationText);

    const screenplays = textsToScreenplay([presentationText]);
    if (screenplays.length === 0) {
      return;
    }

    this.ttsJobs.enqueue({
      screenplay: screenplays[0],
      streamIdx: this.currentStreamIdx,
      domainId: effectiveDomainId,
      bubbleToChat: false,
    });
  }

  public bubbleMessage(role: Role, text: string, attachment?: ChatImageAttachment) {
    // TODO: currentUser & Assistant message should be contain the message with emotion in it

    if (role === "user") {
      if (this.currentUserMessage === "") {
        this.currentUserHistoryId = generateHistoryId();
        this.currentUserCreatedAt = Date.now();
        this.currentUserDomainId = this.currentUserDomainId || "default";
        this.currentUserAttachment = attachment;
      } else if (!this.currentUserAttachment && attachment) {
        this.currentUserAttachment = attachment;
      }

      // add space if there is already a partial message
      if (this.currentUserMessage !== "") {
        this.currentUserMessage += " ";
      }
      this.currentUserMessage += text;
      this.setUserMessage!(this.currentUserMessage);
      this.setAssistantMessage!("");

      if (this.currentAssistantMessage !== "") {
        this.messageList!.push({
          role: "assistant",
          content: this.currentAssistantMessage,
          dbResult: this.currentAssistantDbResult,
          mcpInfo: this.currentAssistantMcpInfo,
          historyId: this.currentAssistantHistoryId,
          domainId: this.currentAssistantDomainId,
          createdAt: this.currentAssistantCreatedAt,
        });

        this.currentAssistantMessage = "";
        this.currentAssistantDbResult = undefined;
        this.currentAssistantMcpInfo = undefined;
        this.currentAssistantHistoryId = undefined;
        this.currentAssistantDomainId = undefined;
        this.currentAssistantCreatedAt = undefined;
        this.setAssistantDbResult?.(undefined);
      }

      this.setChatLog!([
        ...this.messageList!,
        {
          role: "user",
          content: this.currentUserMessage,
          attachment: this.currentUserAttachment,
          historyId: this.currentUserHistoryId,
          domainId: this.currentUserDomainId,
          createdAt: this.currentUserCreatedAt,
        },
      ]);
    }

    if (role === "assistant") {
      if (this.currentAssistantMessage === "") {
        this.currentAssistantHistoryId = generateHistoryId();
        this.currentAssistantCreatedAt = Date.now();
        this.currentAssistantDomainId = this.currentUserDomainId || this.currentAssistantDomainId || "default";
        this.currentAssistantAttachment = this.currentUserAttachment;
      }

      if (this.currentAssistantMessage === "" && this.pendingDbResult) {
        this.currentAssistantDbResult = this.pendingDbResult;
        this.pendingDbResult = undefined;
      }

      if (this.currentAssistantMessage === "" && this.pendingMcpInfo) {
        this.currentAssistantMcpInfo = this.pendingMcpInfo;
        this.pendingMcpInfo = undefined;
      }

      if (
        this.currentAssistantMessage != "" &&
        config("async_tts_mode") !== "true" &&
        !this.isAwake() &&
        config("amica_life_enabled") === "true"
      ) {
        const nextAssistantDbResult = this.pendingDbResult;
        this.messageList!.push({
          role: "assistant",
          content: this.currentAssistantMessage,
          dbResult: this.currentAssistantDbResult,
          mcpInfo: this.currentAssistantMcpInfo,
          attachment: this.currentAssistantAttachment,
          historyId: this.currentAssistantHistoryId,
          domainId: this.currentAssistantDomainId,
          createdAt: this.currentAssistantCreatedAt,
        });

        this.currentAssistantMessage = text;
        this.currentAssistantDbResult = nextAssistantDbResult;
        this.currentAssistantMcpInfo = this.pendingMcpInfo;
        this.currentAssistantAttachment = this.currentUserAttachment;
        this.currentAssistantHistoryId = generateHistoryId();
        this.currentAssistantCreatedAt = Date.now();
        this.currentAssistantDomainId = this.currentUserDomainId || this.currentAssistantDomainId || "default";
        this.pendingDbResult = undefined;
        this.pendingMcpInfo = undefined;
        this.setAssistantMessage!(this.currentAssistantMessage);
        this.setAssistantDbResult?.(this.currentAssistantDbResult);
      } else if (config("chatbot_backend") === "moshi") {
        if (this.currentAssistantMessage !== "") {
          const nextAssistantDbResult = this.pendingDbResult;
          this.messageList!.push({
            role: "assistant",
            content: this.currentAssistantMessage,
            dbResult: this.currentAssistantDbResult,
            mcpInfo: this.currentAssistantMcpInfo,
            attachment: this.currentAssistantAttachment,
            historyId: this.currentAssistantHistoryId,
            domainId: this.currentAssistantDomainId,
            createdAt: this.currentAssistantCreatedAt,
          });
          this.currentAssistantDbResult = nextAssistantDbResult;
          this.currentAssistantMcpInfo = this.pendingMcpInfo;
          this.currentAssistantAttachment = this.currentUserAttachment;
          this.currentAssistantHistoryId = generateHistoryId();
          this.currentAssistantCreatedAt = Date.now();
          this.currentAssistantDomainId = this.currentUserDomainId || this.currentAssistantDomainId || "default";
          this.pendingDbResult = undefined;
          this.pendingMcpInfo = undefined;
        }
        this.currentAssistantMessage = text;
        this.setAssistantMessage!(this.currentAssistantMessage);
        this.setAssistantDbResult?.(this.currentAssistantDbResult);
        this.setUserMessage!("");

      } else {
        this.currentAssistantMessage += text;
        this.setUserMessage!("");
        this.setAssistantMessage!(this.currentAssistantMessage);
        this.setAssistantDbResult?.(this.currentAssistantDbResult);
      }

      if (this.currentUserMessage !== "") {
        this.messageList!.push({
          role: "user",
          content: this.currentUserMessage,
          attachment: this.currentUserAttachment,
          historyId: this.currentUserHistoryId,
          domainId: this.currentUserDomainId,
          createdAt: this.currentUserCreatedAt,
        });

        this.currentUserMessage = "";
        this.currentUserHistoryId = undefined;
        this.currentUserDomainId = undefined;
        this.currentUserCreatedAt = undefined;
        this.currentUserAttachment = undefined;
      }

      this.setChatLog!([
        ...this.messageList!,
        {
          role: "assistant",
          content: this.currentAssistantMessage,
          dbResult: this.currentAssistantDbResult,
          mcpInfo: this.currentAssistantMcpInfo,
          attachment: this.currentAssistantAttachment,
          historyId: this.currentAssistantHistoryId,
          domainId: this.currentAssistantDomainId,
          createdAt: this.currentAssistantCreatedAt,
        },
      ]);
    }

    this.setShownMessage!(role);
  }

  public async interrupt() {
    this.currentStreamIdx++;
    this.stopCurrentPlayback();
    try {
      if (this.reader) {
        console.debug("cancelling");
        if (!this.reader?.closed) {
          await this.reader?.cancel();
        }
        // this.reader = null;
        // this.stream = null;
        console.debug("finished cancelling");
      }
    } catch (e: any) {
      console.error(e.toString());
    }

    // TODO if llm type is llama.cpp, we can send /stop message here
    this.ttsJobs.clear();
    this.speakJobs.clear();
    // TODO stop viewer from speaking
  }

  // this happens either from text or from voice / whisper completion
  public async receiveMessageFromUser(message: string, amicaLife: boolean, domainId?: string) {
    if (message === null || message === "") {
      return;
    }

    const hasChronicleMarker = typeof message === 'string' && message.includes(CHRONICLE_TRIGGER_MARKER);
    const normalizedMessage = typeof message === 'string'
      ? message.replaceAll(CHRONICLE_TRIGGER_MARKER, '').trim()
      : '';

    if (!normalizedMessage) {
      return;
    }

    message = normalizedMessage;
    this.setChatProcessing?.(true);
    const effectiveDomainId = (domainId || this.currentUserDomainId || resolveActiveDomainId()).trim() || 'default';
    this.currentUserDomainId = effectiveDomainId;

    console.time("performance_interrupting");
    console.debug("interrupting...");
    await this.interrupt();
    console.timeEnd("performance_interrupting");
    await wait(0);
    console.debug("wait complete");

    if (!amicaLife) {
      console.log("receiveMessageFromUser", message);

      // For external API
      await handleUserInput(message);

      this.amicaLife?.receiveMessageFromUser(message);

      if (!/\[.*?\]/.test(message)) {
        message = `[neutral] ${message}`;
      }

      this.updateAwake();
      this.bubbleMessage("user", message);
    }

    // Fetch injected context from injection-tool (fail-open)
    const userTextForModel = amicaLife ? message : this.currentUserMessage;
    const userTextForInjection = this.buildInjectionUserText(userTextForModel, hasChronicleMarker);
    const injectionDomainId = effectiveDomainId || undefined;

    console.debug('[CHRONICLE] request', {
      domainId: injectionDomainId ?? 'default',
      markerDetected: hasChronicleMarker,
      messageLength: userTextForModel.length,
    });

    const injected = await fetchInjectedContext(
      userTextForInjection,
      injectionDomainId,
      sessionManager.getSessionId() || undefined,
      undefined,
      {
        isUserInput: !amicaLife,
      }
    );

    if (injected.metadata) {
      console.debug('[CHRONICLE] metadata', {
        domainId: injected.metadata.domainId,
        attached: injected.metadata.chronicleAttached,
        triggered: injected.metadata.chronicleTriggered,
        used: injected.metadata.chronicleUsed,
        name: injected.metadata.chronicleName,
        error: injected.metadata.chronicleError,
      });
    } else {
      console.debug('[CHRONICLE] metadata unavailable (intercept fallback or empty response)');
    }

    const chronicleRequested = Boolean(hasChronicleMarker || injected.metadata?.chronicleTriggered);
    if (chronicleRequested) {
      const chronicleContent = typeof injected.chronicle?.content === 'string'
        ? injected.chronicle.content.trim()
        : '';

      if (injected.metadata?.chronicleUsed && chronicleContent) {
        const chronicleOnlyBlock = this.buildChronicleDecoratedBlock(injected.chronicle);
        if (chronicleOnlyBlock) {
          const reactionMessage = this.buildChronicleReactionMessage({
            used: true,
            sourceName: injected.metadata?.chronicleName,
            content: chronicleContent,
          });
          const reactionTtsMessage = buildTtsSafeReactionText(reactionMessage, 120);
          const reactionScreenplay = textsToScreenplay([reactionTtsMessage])[0];
          if (reactionScreenplay) {
            this.ttsJobs.enqueue({
              screenplay: reactionScreenplay,
              streamIdx: this.currentStreamIdx,
              domainId: injectionDomainId,
              bubbleToChat: false,
            });
          }
          this.bubbleMessage("assistant", chronicleOnlyBlock);
          this.bubbleMessage("assistant", reactionMessage);
          this.setChatProcessing?.(false);
          return;
        }
      }

      const chronicleErrorText = injected.metadata?.chronicleError || 'CHRONICLE応答を取得できませんでした。';
      const chronicleErrorBlock = this.buildChronicleDecoratedBlock({
        title: 'CHRONICLE',
        sourceName: injected.metadata?.chronicleName,
        content: `取得に失敗しました: ${chronicleErrorText}`,
      });

      if (chronicleErrorBlock) {
        this.bubbleMessage("assistant", chronicleErrorBlock);
      }
      const failureReactionMessage = this.buildChronicleReactionMessage({
        used: false,
        error: injected.metadata?.chronicleError,
        sourceName: injected.metadata?.chronicleName,
      });

      const failureReactionTtsMessage = buildTtsSafeReactionText(failureReactionMessage, 120);
      const failureReactionScreenplay = textsToScreenplay([failureReactionTtsMessage])[0];
      if (failureReactionScreenplay) {
        this.ttsJobs.enqueue({
          screenplay: failureReactionScreenplay,
          streamIdx: this.currentStreamIdx,
          domainId: injectionDomainId,
          bubbleToChat: false,
        });
      }

      this.bubbleMessage("assistant", failureReactionMessage);
      this.setChatProcessing?.(false);
      return;
    }

    this.pendingDbResult = injected.dbResult;
    this.pendingMcpInfo = injected.metadata?.mcpUsed
      ? {
          used: true,
          serverId: injected.metadata?.mcpServerId,
          toolName: injected.metadata?.mcpToolName,
        }
      : undefined;
    this.pendingChronicleDecoratedBlock = this.buildChronicleDecoratedBlock(injected.chronicle);

    // Compose system prompt with injected context
    let systemPrompt: string;
    if (injected.injectedSystemPrompt) {
      systemPrompt = injected.injectedSystemPrompt;
    } else {
      systemPrompt = config("system_prompt");
    }

    if (amicaLife) {
      systemPrompt = `${systemPrompt}\n\n${AMICA_LIFE_JAPANESE_RULE}`;
    }

    if (injected.metadata?.mcpToolName === 'search_web') {
      systemPrompt = `${systemPrompt}\n\n[WEB検索の回答ルール]\n- 回答は必ず日本語で行うこと\n- 検索結果JSONの title / url / page_summary を優先して読むこと\n- 英語の検索結果が含まれていても、日本語に要約して答えること\n- そのまま英語で返さないこと\n- 「学習データでは〜」「現時点では〜」のような自己言及を避け、検索結果の事実だけを答えること\n- 断定する前に、検索結果の内容に基づいて短く整理して答えること`;
    }

    const contextMessages: Message[] = [];
    if (injected.injectedUserContext) {
      contextMessages.push({
        role: "system",
        content: `[参考情報]\n${injected.injectedUserContext}`,
      });
    }

    // make new stream (userはユーザーの質問のみ、ナレッジはsystemに統合済み)
    const messages: Message[] = [
      { role: "system", content: systemPrompt },
      ...this.messageList!,
      ...contextMessages,
      { role: "user", content: userTextForModel },
    ];

    // console.debug('messages', messages);

    const streamResult = await this.makeAndHandleStream(messages, effectiveDomainId, amicaLife, {
      forceJapanese: injected.metadata?.mcpToolName === 'search_web',
    });
    if (typeof streamResult === "string") {
      this.setChatProcessing?.(false);
    }
  }

  public initSSE() {
    if (!isDev || config("external_api_enabled") !== "true") {
      return;
    }
    // Close existing SSE connection if it exists
    this.closeSSE();

    this.eventSource = new EventSource('/api/amicaHandler');

    // Listen for incoming messages from the server
    this.eventSource.onmessage = async (event) => {
      try {
        // Parse the incoming JSON message
        const message = JSON.parse(event.data);

        console.log(message);

        // Destructure to get the message type and data
        const { type, data } = message;

        // Handle the message based on its type
        switch (type) {
          case 'normal':
            console.log('Normal message received:', data);
            const messages: Message[] = [
              { role: "system", content: config("system_prompt") },
              ...this.messageList!,
              { role: "user", content: data },
            ];
            let stream = await getEchoChatResponseStream(messages);
            this.streams.push(stream);
            this.handleChatResponseStream();
            break;

          case 'animation':
            console.log('Animation data received:', data);
            const animation = await loadVRMAnimation(`/animations/${data}`);
            if (!animation) {
              throw new Error("Loading animation failed");
            }
            this.viewer?.model?.playAnimation(animation, data);
            requestAnimationFrame(() => { this.viewer?.resetCameraLerp(); });
            break;

          case 'playback':
            console.log('Playback flag received:', data);
            this.viewer?.startRecording();
            // Automatically stop recording after 10 seconds
            setTimeout(() => {
              this.viewer?.stopRecording((videoBlob) => {
                // Log video blob to console
                console.log("Video recording finished", videoBlob);

                // Create a download link for the video file
                const url = URL.createObjectURL(videoBlob!);
                const a = document.createElement("a");
                a.href = url;
                a.download = "recording.webm"; // Set the file name for download
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);

                // Revoke the URL to free up memory
                URL.revokeObjectURL(url);
              });
            }, data); // Stop recording after 10 seconds
            break;

          case 'systemPrompt':
            console.log('System Prompt data received:', data);
            updateConfig("system_prompt", data);
            break;

          default:
            console.warn('Unknown message type:', type);
        }
      } catch (error) {
        console.error('Error parsing SSE message:', error);
      }
    };


    this.eventSource.addEventListener('end', () => {
      console.log('SSE session ended');
      this.eventSource?.close();
    });

    this.eventSource.onerror = (error) => {
      console.error('Error in SSE connection:', error);
      this.eventSource?.close();
      setTimeout(this.initSSE, 500);
    };
  }

  public closeSSE() {
    if (this.eventSource) {
      console.log("Closing existing SSE connection...");
      this.eventSource.close();
      this.eventSource = null;
    }
  }

  public async makeAndHandleStream(
    messages: Message[],
    domainId?: string,
    amicaLife: boolean = false,
    responseGuard?: { forceJapanese?: boolean },
  ) {
    try {
      this.currentResponseGuard = responseGuard;
      this.streams.push(await this.getChatResponseStream(messages));
    } catch (e: any) {
      const errMsg = e.toString();
      console.error(errMsg);
      this.currentResponseGuard = undefined;
      if (this.isRateLimitedError(e)) {
        this.alert?.warning("レート制限中", this.toRateLimitedMessage(e));
      } else {
        this.alert?.error("Failed to get chat response", errMsg);
      }
      this.setChatProcessing?.(false);
      return errMsg;
    }

    if (this.streams[this.streams.length - 1] == null) {
      const errMsg = "Error: Null stream encountered.";
      console.error(errMsg);
      this.currentResponseGuard = undefined;
      this.alert?.error("Null stream encountered", errMsg);
      this.setChatProcessing?.(false);
      return errMsg;
    }

    return await this.handleChatResponseStream(domainId, amicaLife);
  }

  public async handleChatResponseStream(domainId?: string, amicaLife: boolean = false) {
    if (this.streams.length === 0) {
      console.log("no stream!");
      return;
    }

    this.currentStreamIdx++;
    const streamIdx = this.currentStreamIdx;
    this.setChatProcessing!(true);

    console.time("chat stream processing");
    let reader = this.streams[this.streams.length - 1].getReader();
    this.readers.push(reader);
    let sentences = new Array<string>();

    let aiTextLog = "";
    let tag = "";
    let isThinking = false;
    let rolePlay = "";
    let receivedMessage = "";
    let insertedJapaneseFallback = false;
    const asyncTtsMode = config("async_tts_mode") === "true";

    if (this.pendingChronicleDecoratedBlock) {
      this.bubbleMessage("assistant", this.pendingChronicleDecoratedBlock);
      this.pendingChronicleDecoratedBlock = "";
    }

    let firstTokenEncountered = false;
    let firstSentenceEncountered = false;
    console.time("performance_time_to_first_token");
    console.time("performance_time_to_first_sentence");

    try {
      while (true) {
        if (this.currentStreamIdx !== streamIdx) {
          console.log("wrong stream idx");
          break;
        }
        const { done, value } = await reader.read();
        if (!firstTokenEncountered) {
          console.timeEnd("performance_time_to_first_token");
          firstTokenEncountered = true;
        }
        if (done) break;

        receivedMessage += value;
        receivedMessage = receivedMessage.trimStart();

        const proc = processResponse({
          sentences,
          aiTextLog,
          receivedMessage,
          tag,
          isThinking,
          rolePlay,
          callback: (aiTalks: Screenplay[]): boolean => {
            // Generate & play audio for each sentence, display responses
            if (streamIdx !== this.currentStreamIdx) {
              console.log("wrong stream idx");
              return true; // should break
            }

            if (amicaLife) {
              const currentText = aiTalks[0]?.talk?.message || aiTalks[0]?.text || "";
              if (this.containsLikelyChinese(currentText)) {
                if (insertedJapaneseFallback) {
                  return false;
                }

                insertedJapaneseFallback = true;
                aiTalks[0].text = "[neutral] すみません、日本語で言い直します。もう一度聞いてくれる？";
                aiTalks[0].talk.message = "すみません、日本語で言い直します。もう一度聞いてくれる？";
                aiTalks[0].expression = "neutral";
                aiTalks[0].talk.style = "talk";
              }
            }

            if (this.shouldForceJapaneseForCurrentResponse()) {
              const currentText = aiTalks[0]?.talk?.message || aiTalks[0]?.text || "";
              if (this.containsLikelyEnglish(currentText)) {
                if (insertedJapaneseFallback) {
                  return false;
                }

                insertedJapaneseFallback = true;
                aiTalks[0].text = "[neutral] すみません、日本語で言い直します。検索結果を日本語で整理し直しています。";
                aiTalks[0].talk.message = "すみません、日本語で言い直します。検索結果を日本語で整理し直しています。";
                aiTalks[0].expression = "neutral";
                aiTalks[0].talk.style = "talk";
              }
            }

            if (!isThinking) {
              if (asyncTtsMode) {
                this.bubbleMessage("assistant", aiTalks[0].text);
              }

              console.debug("tts enqueue", {
                streamIdx,
                text: aiTalks[0].text,
                hasAudio: true,
              });
              this.ttsJobs.enqueue({
                screenplay: aiTalks[0],
                streamIdx: streamIdx,
                domainId,
                bubbleToChat: !asyncTtsMode,
              });
            }

            // thought bubble
            this.thoughtBubbleMessage(isThinking, aiTalks[0].text);

            if (!firstSentenceEncountered) {
              console.timeEnd("performance_time_to_first_sentence");
              firstSentenceEncountered = true;
            }

            return false; // normal processing
          },
        });

        sentences = proc.sentences;
        aiTextLog = proc.aiTextLog;
        receivedMessage = proc.receivedMessage;
        tag = proc.tag;
        isThinking = proc.isThinking;
        rolePlay = proc.rolePlay;
        if (proc.shouldBreak) {
          break;
        }
      }
    } catch (e: any) {
      const errMsg = e.toString();
      this.bubbleMessage!("assistant", errMsg);
      console.error(errMsg);
    } finally {
      this.currentResponseGuard = undefined;
      if (!reader.closed) {
        reader.releaseLock();
      }
      console.timeEnd("chat stream processing");
      if (streamIdx === this.currentStreamIdx) {
        this.setChatProcessing!(false);
      }
    }

    return aiTextLog;
  }

  async fetchAudio(talk: Talk, domainId?: string): Promise<ArrayBuffer | null> {
    // TODO we should remove non-speakable characters
    // since this depends on the tts backend, we should do it
    // in their respective functions
    // this is just a simple solution for now
    talk = cleanTalk(talk);
    //sanitize message for tts (remove meaningless symbols and decorations)
    talk.message = this.sanitizeTtsMessage(talk.message);

    if (this.shouldForceJapaneseForCurrentResponse() && this.containsLikelyEnglish(talk.message)) {
      talk.message = "すみません、日本語で言い直します。検索結果を日本語で整理し直しています。";
      talk.style = "talk";
    }

    if (talk.message.trim() === "" || config("tts_muted") === "true") {
      return null;
    }

    const rvcEnabled = config("rvc_enabled") === "true";
    const domainVoiceConfig = domainId ? await getDomainVoiceConfig(domainId) : {};
    const effectiveTtsBackend = domainVoiceConfig.ttsBackend?.trim() || config("tts_backend");

    try {
      switch (effectiveTtsBackend) {
        case "none": {
          return null;
        }
        case "elevenlabs": {
          const voiceId = config("elevenlabs_voiceid");
          const voice = await elevenlabs(talk.message, voiceId, talk.style);
          if (rvcEnabled) {
            return await this.handleRvc(voice.audio);
          }
          return voice.audio;
        }
        case "speecht5": {
          const speakerEmbeddingUrl = config("speecht5_speaker_embedding_url");
          const voice = await speecht5(talk.message, speakerEmbeddingUrl);
          if (rvcEnabled) {
            return await this.handleRvc(voice.audio);
          }
          return voice.audio;
        }
        case "openai_tts": {
          const voice = await openaiTTS(talk.message);
          if (rvcEnabled) {
            return await this.handleRvc(voice.audio);
          }
          return voice.audio;
        }
        case "localXTTS": {
          const voice = await localXTTSTTS(talk.message);
          if (rvcEnabled) {
            return await this.handleRvc(voice.audio);
          }
          return voice.audio;
        }
        case "piper": {
          const voice = await piper(talk.message, domainId);
          if (rvcEnabled) {
            return await this.handleRvc(voice.audio);
          }
          return voice.audio;
        }
        case "coquiLocal": {
          const voice = await coquiLocal(talk.message, domainId);
          return voice.audio;
        }
        case "kokoro": {
          const voice = await kokoro(talk.message);
          return voice.audio;
        }
        case "stylebertvits2": {
          const voice = await stylebertvits2(talk.message, domainId);
          if (rvcEnabled) {
            return await this.handleRvc(voice.audio);
          }
          return voice.audio;
        }
      }
    } catch (e: any) {
      console.error(e.toString());
      if (this.isRateLimitedError(e)) {
        this.alert?.warning("レート制限中", this.toRateLimitedMessage(e));
      } else {
        this.alert?.error("Failed to get TTS response", e.toString());
      }
    }

    return null;
  }

  public async getChatResponseStream(messages: Message[]) {
    console.debug("getChatResponseStream", messages);
    const chatbotBackend = config("chatbot_backend");

    // Extract the system prompt and convo messages
    const systemPrompt = messages.find((msg) => msg.role === "system")!;
    const conversationMessages = messages.filter((msg) => msg.role !== "system");

    if (config("reasoning_engine_enabled") === "true") {
      return getReasoingEngineChatResponseStream(systemPrompt, conversationMessages)
    }

    switch (chatbotBackend.toLowerCase()) {
      case "arbius_llm":
        return getArbiusChatResponseStream(messages);
      case "chatgpt":
        return getOpenAiChatResponseStream(messages);
      case "llamacpp":
        return getLlamaCppChatResponseStream(messages);
      case "windowai":
        return getWindowAiChatResponseStream(messages);
      case "ollama":
        return getOllamaChatResponseStream(messages);
      case "koboldai":
        return getKoboldAiChatResponseStream(messages);
      case 'openrouter':
        return getOpenRouterChatResponseStream(messages);
    }

    return getEchoChatResponseStream(messages);
  }

  public async getVisionResponse(imageData: string, prompt?: string, domainId?: string) {
    try {
      const visionBackend = config("vision_backend");
      const visionPrompt = prompt?.trim() || "Describe the image as accurately as possible";

      console.debug("vision_backend", visionBackend);

      let res = "";
      if (visionBackend === "vision_llamacpp") {
        const messages: Message[] = [
          { role: "system", content: config("vision_system_prompt") },
          ...this.messageList!,
          {
            role: "user",
            content: visionPrompt,
          },
        ];

        res = await getLlavaCppChatResponse(messages, imageData);
      } else if (visionBackend === "vision_ollama") {
        const messages: Message[] = [
          { role: "system", content: config("vision_system_prompt") },
          ...this.messageList!,
          {
            role: "user",
            content: visionPrompt,
          },
        ];

        res = await getOllamaVisionChatResponse(messages, imageData);
      } else if (visionBackend === "vision_openai") {
        const messages: Message[] = [
          { role: "user", content: config("vision_system_prompt") },
          ...this.messageList! as any[],
          {
            role: "user",
            // @ts-ignore normally this is a string
            content: [
              {
                type: "text",
                text: visionPrompt,
              },
              {
                type: "image_url",
                image_url: {
                  url: `data:image/jpeg;base64,${imageData}`,
                },
              },
            ],
          },
        ];

        res = await getOpenAiVisionChatResponse(messages);
      } else {
        console.warn("vision_backend not supported", visionBackend);
        return;
      }

      const visionSummary = res?.trim() || "画像の内容を十分に取得できませんでした";
      const followUpPrompt = prompt?.trim()
        ? `This is an attached image. The user's request was: ${prompt.trim()}. The image was described between [[ and ]] : [[${visionSummary}]] Please respond accordingly and as though you can see it.`
        : `This is a picture I just took from my webcam (described between [[ and ]] ): [[${visionSummary}]] Please respond accordingly and as if it were just sent and as though you can see it.`;

      await this.makeAndHandleStream([
        { role: "system", content: config("system_prompt") },
        ...this.messageList!,
        {
          role: "user",
          content: followUpPrompt,
        },
      ], domainId);
    } catch (e: any) {
      console.error("getVisionResponse", e.toString());
      this.alert?.error("Failed to get vision response", e.toString());
    }
  }
}
