export function cleanTranscript(transcript: string) {
  console.log('transcript', transcript);
  let text = transcript.trim();
  text = text.replaceAll(/\[.+\]|{.+}|\(.+\)/gm, '');
  return text.trim();
}

export function cleanFromWakeWord(text: string, wakeWord: string) {
  if (!text.toLowerCase().startsWith(wakeWord.toLowerCase())) {
    return text;
  }

  const wakeWordLength = wakeWord.split(" ").length;
  const textWithoutWakeWord = text.split(" ").slice(wakeWordLength).join(" ");

  return `${("" + textWithoutWakeWord.charAt(0)).toUpperCase()}${textWithoutWakeWord.substring(1)}`;
}

export function cleanFromPunctuation(text: string) {
  return text.toLowerCase().replace(/[^\w\s\']|_/g, "").replace(/\s+/g, " ");
}

export function stripDisplayControlTags(text: string) {
  if (!text) {
    return text;
  }

  return text.replace(
    /(^|[\s\r\n。！？.!?])\[(?:[a-z][a-z\s_-]{0,30})\](?=$|[\s\r\n])/gi,
    "$1"
  );
}