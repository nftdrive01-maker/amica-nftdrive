import { animationList } from "@/paths";
import { loadVRMAnimation } from "@/lib/VRMAnimation/loadVRMAnimation";

import { Chat } from "@/features/chat/chat";
import { emotions } from "@/features/chat/messages";

import { basename } from "@/components/settings/common";
import { askLLM } from "@/utils/askLlm";

import { functionCalling } from "@/features/functionCalling/functionCalling";
import { AmicaLife } from "./amicaLife";
import { Viewer } from "../vrmViewer/viewer";
import { config } from "@/utils/config";
import isDev from "@/utils/isDev";
import { handleSubconscious } from "../externalAPI/externalAPI";

export const idleEvents = [
  "VRMA",
  "Subconcious",
  "IdleTextPrompts",
] as const;

export const basedPrompt = {
  /* The `idleTextPrompt` array contains a list of idle text prompts that can be randomly selected and
  displayed during idle events in the code. These prompts are meant to simulate conversational
  responses or interactions when the system is idle or waiting for user input. Each prompt
  represents a message that the system can output to engage the user or provide some form of
  interaction. When an idle event occurs, one of these prompts is randomly chosen and displayed to
    create a more dynamic and engaging user experience. */
  //   idleTextPrompt: [
  //   "*I am ignoring you*",
  //   "**sighs** It's so quiet here.",
  //   "Tell me something interesting about yourself.",
  //   "**looks around** What do you usually do for fun?",
  //   "I could use a good distraction right now.",
  //   "What's the most fascinating thing you know?",
  //   "If you could talk about anything, what would it be?",
  //   "Got any clever insights to share?",
  //   "**leans in** Any fun stories to tell?",
  // ],
//アイドル時の行動プロンプト
  idleTextPrompt: [
    "*無視してる*",
    "**ため息** 静かだね。",
    "何か面白いこと教えてよ。",
    "**見回す** 普段何して遊んでるの？",
    "何か気を紛らわせてほしいな。",
    "あなたが知ってる一番面白いことって何？",
    "何でもいいから話しかけてよ。",
    "何か賢いこと教えてよ。",
    "**身を乗り出す** 面白い話ない？",
  ],
};

export type AmicaLifeEvents = {
  events: string;
};

// 潜在意識ストレージの最大トークン数（例: 3000トークン = 約1500文字程度、会話の内容や圧縮率によって変動）
export const MAX_STORAGE_TOKENS = 3000;

// タイムスタンプ付きプロンプトのインターフェース定義
export type TimestampedPrompt = {
  prompt: string;
  timestamp: string;
}

// 圧縮された潜在意識プロンプトを保存するストレージ
export let storedSubconcious: TimestampedPrompt[] = [];

let previousAnimation = "";

// VRMアニメーションイベントを処理する
async function handleVRMAnimationEvent(viewer: Viewer, amicaLife: AmicaLife) {
  if (!animationList || animationList.length === 0) {
    amicaLife.eventProcessing = false;
    console.timeEnd("processing_event VRMA");
    return;
  }

  let randomAnimation;
  do {
    randomAnimation = animationList[Math.floor(Math.random() * animationList.length)];
  } while (basename(randomAnimation) === previousAnimation);

  // 次回呼び出し用に現在のアニメーションを前回値として保存
  previousAnimation = basename(randomAnimation);
  // ステージングログ用に除外
  //console.log("アイドルイベント処理中 (アニメーション):", previousAnimation);

  try {
    if (viewer?.model && typeof (viewer.model as any).playAnimation === "function") {
      const animation = await loadVRMAnimation(randomAnimation);
      if (!animation) {
        throw new Error("Loading animation failed");
      }
      // @ts-ignore
      const duration = await viewer.model.playAnimation(animation, previousAnimation);
      requestAnimationFrame(() => { viewer.resetCameraLerp(); });

      // アニメーション再生時間分のタイムアウトを設定
      setTimeout(() => {
        amicaLife.eventProcessing = false;
        console.timeEnd("processing_event VRMA");
      }, duration * 1000);
    } else {
      console.debug("Skip VRMA event because viewer model is unavailable.");
      amicaLife.eventProcessing = false;
      console.timeEnd("processing_event VRMA");
    }
  } catch (error) {
    console.error("Error loading animation:", error);
    amicaLife.eventProcessing = false;
    console.timeEnd("processing_event VRMA");
  }
}

// テキストベースのアイドルイベントを処理する
async function handleTextEvent(chat: Chat, amicaLife: AmicaLife) {
  // アイドルテキストプロンプトをランダムに選択する
  const randomIndex = Math.floor(
    Math.random() * basedPrompt.idleTextPrompt.length,
  );
  const randomTextPrompt = basedPrompt.idleTextPrompt[randomIndex];
  // ステージングログ用に除外
  //console.log("アイドルイベント処理中 (テキスト):", randomTextPrompt);
  try {
    await chat.receiveMessageFromUser?.(randomTextPrompt, true);
    amicaLife.eventProcessing = false;
    console.timeEnd(`processing_event IdleTextPrompts`);
  } catch (error) {
    console.error(
      "Error occurred while sending a message through chat instance:",
      error,
    );
  }
}

// スリープイベントを処理する
export async function handleSleepEvent(chat: Chat, amicaLife: AmicaLife) {
  console.log("Sleeping...");
  amicaLife.pause();
  amicaLife.isSleep = true;
  try {
    const viewer = chat.viewer;
    if (viewer?.model && typeof (viewer.model as any).playEmotion === "function") {
      // @ts-ignore
      await viewer.model.playEmotion("Sleep");
    } else {
      console.debug("Skip sleep emotion because viewer model is unavailable.");
    }
    amicaLife.eventProcessing = false;
    console.timeEnd("processing_event Sleep");
  } catch (error) {
    console.error("Error playing emotion sleep:", error);
    amicaLife.eventProcessing = false;
    console.timeEnd("processing_event Sleep");
  }
}

// 潜在意識イベントを処理する
export async function handleSubconsciousEvent(
  chat: Chat,
  amicaLife: AmicaLife,
) {
  // ステージングログ用に除外
  //console.log("アイドルイベント処理中:", "Subconscious");

  const convo = chat.messageList;
  const convoLog = convo
    .map((message) => {
      return `${message.role === "user" ? "User" : "Assistant"}: ${
        message.content
      }`;
    })
    .join("\n");

  try {
    // ステップ1: 潜在意識の自己日記をシミュレートする
    const subconciousWordSalad = await askLLM(
      // "Please reflect on the conversation and let your thoughts flow freely, as if writing a personal diary with events that have occurred:",
        "この会話を振り返って、個人的な日記を書くように自由に思考を流してください。会話の内容をもとに、あなたの心の中で起こっていることや感じていることを、第三者の視点で表現してください:",
      `${convoLog}`,
      null,
    );
    // ステージングログ用に除外
    //console.log("ステップ1の結果: ", subconciousWordSalad);

    // ステップ2: 潜在意識日記から感情を分析する
    const secondStepPrompt = subconciousWordSalad.startsWith("Error:")
      ? convoLog
      : subconciousWordSalad;
    const decipherEmotion = await askLLM(
      // "Read this mini-diary, I would like you to simulate a human-like subconscious with deep emotions and describe it from a third-person perspective:",
      "このミニ日記を読んでください。人間のような深い感情を持つ潜在意識をシミュレートし、第三者の視点からそれを説明してください:",
      secondStepPrompt,
      null,
    );

    // ステージングログ用に除外
    //console.log("ステップ2の結果: ", decipherEmotion);

    // ステップ3: 最適な感情タグを決定する
    const thirdStepPrompt = decipherEmotion.startsWith("Error:")
      ? convoLog
      : decipherEmotion;
    const emotionDecided = await askLLM(
      //`Based on your mini-diary, respond with dialougue that sounds like a normal person speaking about their mind, experience or feelings. Make sure to incorporate the specified emotion tags in your response. Here is the list of emotion tags that you have to include in the result : ${emotions
      `ミニ日記をもとに、自分の心・経験・気持ちについて普通の人が話すような自然な台詞で答えてください。
必ず以下の感情タグをレスポンスに含めてください：${emotions
      .map((emotion) => `[${emotion}]`)
        .join(", ")}
【言語制約】
- 出力は必ず日本語のみ。
- 中国語（簡体字・繁体字）は出力しない。
- 不自然になった場合は短く言い直す。`,
      thirdStepPrompt,
      chat,
    );

    // ステージングログ用に除外
    // console.log("ステップ3の結果: ", emotionDecided);

    // ステップ4: 潜在意識日記を240文字以内に圧縮する
    const fourthStepPrompt = subconciousWordSalad.startsWith("Error:")
      ? convoLog
      : subconciousWordSalad;
    const compressSubconcious = await askLLM(
      "次の内容を240文字以内に要約してください：",
      fourthStepPrompt,
      null,
    );
    console.log("Stored Memory: ", compressSubconcious);

    // 圧縮した潜在意識にタイムスタンプを付与する
    const timestampedPrompt: TimestampedPrompt = {
      prompt: compressSubconcious,
      timestamp: new Date().toISOString(),
    };

    // 外部API機能
    if (isDev && config("external_api_enabled") === "true") {
      try {
        storedSubconcious = await handleSubconscious(timestampedPrompt);
      } catch (error) {
        console.error("外部APIの処理中にエラーが発生しました:", error);
      }
    // 外部APIが無効または開発環境以外の場合
    } else { 
      storedSubconcious.push(timestampedPrompt);
      let totalStorageTokens = storedSubconcious.reduce(
        (totalTokens, prompt) => totalTokens + prompt.prompt.length,
        0,
      );
      while (totalStorageTokens > MAX_STORAGE_TOKENS) {
        const removed = storedSubconcious.shift();
        totalStorageTokens -= removed!.prompt.length;
      }
    }
    
    console.log("Stored subconcious prompts:", storedSubconcious);
    amicaLife.setSubconciousLogs!(storedSubconcious);

    amicaLife.eventProcessing = false;
    console.timeEnd(`processing_event Subconcious`);
  } catch (error) {
    console.error("Error handling subconscious event:", error);
  }
}

// ニュースイベントを処理する
export async function handleNewsEvent(chat: Chat, amicaLife: AmicaLife) {
  console.log("Function Calling: News");

  try {
    const news = await functionCalling("news");
    if (!news) {
      throw new Error("Loading news failed");
    }
    await chat.receiveMessageFromUser?.(news, true);
    amicaLife.eventProcessing = false;
    console.timeEnd("processing_event News");
  } catch (error) {
    console.error(
      "Error occurred while sending a message through chat instance:",
      error,
    );
  }
}

// アイドルイベントのメインハンドラー
export async function handleIdleEvent(
  event: AmicaLifeEvents,
  amicaLife: AmicaLife,
  chat: Chat,
  viewer: Viewer,
) {
  if (!chat) {
    console.error("チャットインスタンスが利用できません");
    return;
  }

  switch (event.events) {
    case "VRMA":
      await handleVRMAnimationEvent(viewer, amicaLife);
      break;
    case "Subconcious":
      await handleSubconsciousEvent(chat, amicaLife);
      break;
    case "News":
      await handleNewsEvent(chat, amicaLife);
      break;
    case "Sleep":
      await handleSleepEvent(chat, amicaLife);
      break;
    default:
      await handleTextEvent(chat, amicaLife);
      break;
  }
}