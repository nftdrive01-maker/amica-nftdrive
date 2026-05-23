import { Screenplay, textsToScreenplay } from "@/features/chat/messages";

export type ProcessResponseRetVal = {
  sentences: string[];
  aiTextLog: string;
  receivedMessage: string;
  tag: string;
  isThinking: boolean;
  rolePlay: string;
  shouldBreak: boolean;
}

function normalizeSpacedUrls(input: string): string {
  if (!input) {
    return input;
  }

  // Example: "https:// www.r akuyo.ed.jp/infolist/" -> "https://www.rakuyo.ed.jp/infolist/"
  const protocolUrlPattern = /(https?:\/\/(?:\s*[A-Za-z0-9\-._~:/?#\[\]@!$&'()*+,;=%])+)/g;
  const wwwUrlPattern = /(www\.(?:\s*[A-Za-z0-9\-._~:/?#\[\]@!$&'()*+,;=%])+)/g;

  return input
    .replace(protocolUrlPattern, (match) => match.replace(/\s+/g, ""))
    .replace(wwwUrlPattern, (match) => match.replace(/\s+/g, ""));
}

function isIncompleteUrlFragment(sentence: string): boolean {
  const trimmed = sentence.trim();
  if (!trimmed) {
    return false;
  }

  const withoutBullet = trimmed.replace(/^(?:[-*・]\s*)/, "");

  // Wait until the model has produced a complete URL with a host and at least one dot.
  if (/^(?:https?:\/\/|www\.)/i.test(withoutBullet)) {
    const compact = withoutBullet.replace(/\s+/g, "");

    // OAuth URLs can arrive as split chunks like "https://accounts.google" then ".com/oauth2/...".
    // Keep buffering until ".google.com/..." is complete so the UI can render one clickable URL.
    if (/^https?:\/\/accounts\.google(?:$|[/?#])/i.test(compact) && !/^https?:\/\/accounts\.google\.com\//i.test(compact)) {
      return true;
    }

    if (!/^(?:https?:\/\/|www\.)[A-Za-z0-9\-_.]+\.[A-Za-z]{2,}(?:\/.*)?$/i.test(compact)) {
      return true;
    }
  }

  // Citation lines like "- https://" or "- www.r" should stay buffered until complete.
  if (/^(?:[-*・]\s*)?(?:https?:\/\/|www\.)/i.test(trimmed)) {
    const compact = trimmed.replace(/\s+/g, "");
    if (!/\.[A-Za-z]{2,}/.test(compact)) {
      return true;
    }
  }

  return false;
}

// this function is used to process the response from the AI
// it will call callback once it has a full "sentence" to speak
// it returns updated variables for the next iteration
// this is intended to be used in a loop
export function processResponse({
  sentences,
  aiTextLog,
  receivedMessage,
  tag,
  isThinking,
  rolePlay,
  callback,
}: {
  sentences: string[],
  aiTextLog: string,
  receivedMessage: string,
  tag: string,
  isThinking: boolean,
  rolePlay: string,
  callback: (aiTalks: Screenplay[]) => boolean,
}): ProcessResponseRetVal {
  let shouldBreak = false;

  // Keep source URLs intact even when the model inserts spaces between URL tokens.
  receivedMessage = normalizeSpacedUrls(receivedMessage);

  const extractUrlLine = (input: string): { sentence: string; rest: string } | null => {
    const urlLineMatch = input.match(/^(?:\s*[-*・]\s*)?(?:https?:\/\/|www\.)[^\n]*(?:\n|$)/i);
    if (!urlLineMatch || !urlLineMatch[0]) {
      return null;
    }

    const sentence = urlLineMatch[0];
    const rest = input.slice(sentence.length).trimStart();
    return { sentence, rest };
  };

  const thinkTagMatch = receivedMessage.match(/<\/?think>/);
  if (thinkTagMatch && thinkTagMatch[0]) {
    if (thinkTagMatch[0] === "</think>") {
      isThinking = false;
    } else  {
      isThinking = true;
    }
    receivedMessage = receivedMessage.slice(thinkTagMatch[0].length);
  }

  // Detection of tag part of reply content
  const tagMatch = receivedMessage.match(/^\[(.*?)\]/);
  if (tagMatch && tagMatch[0]) {
    tag = tagMatch[0];
    receivedMessage = receivedMessage.slice(tag.length);
  }

  // Detection of role play part of reply content e.g. *smiling nervously*
  const rolePlayMatch = receivedMessage.match(/\*(.*?)\*/);
  if (rolePlayMatch && rolePlayMatch[0]) {
    rolePlay = rolePlayMatch[0];
    receivedMessage = receivedMessage.replace(rolePlay, '');
  }

  // URL行は分割せず先に処理する（https://www.example.com が分解されるのを防止）
  const extractedUrlLine = extractUrlLine(receivedMessage);

  // Cut out and process the response sentence by sentence
  const sentenceMatch = extractedUrlLine
    ? [extractedUrlLine.sentence]
    : receivedMessage.match(/^(.+[\。\!\！\?\？\n]|.{24,}[、,])/);
  if (sentenceMatch && sentenceMatch[0]) {
    const sentence = sentenceMatch[0];

    if (isIncompleteUrlFragment(sentence)) {
      return {
        sentences,
        aiTextLog,
        receivedMessage,
        tag,
        isThinking,
        rolePlay,
        shouldBreak,
      };
    }

    sentences.push(sentence);
    receivedMessage = extractedUrlLine
      ? extractedUrlLine.rest
      : receivedMessage.slice(sentence.length).trimStart();

    // Skip if the string is unnecessary/impossible to utter.
    if (
      !sentence.replace(
        /^[\s\[\(\{「［（【『〈《〔｛«‹〘〚〛〙›»〕》〉』】）］」\}\)\]]+$/g,
        "",
      )
    ) {
      // continue
      return {
        sentences,
        aiTextLog,
        receivedMessage,
        tag,
        isThinking,
        rolePlay,
        shouldBreak,
      }
    }

    const aiText = `${tag} ${sentence}`;
    const aiTalks = textsToScreenplay([aiText]);
    aiTextLog += aiText;

    shouldBreak = callback(aiTalks);
  }

  return {
    sentences,
    aiTextLog,
    receivedMessage,
    tag,
    isThinking,
    rolePlay,
    shouldBreak,
  }
}
