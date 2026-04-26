import { config } from '@/utils/config';
import { normalizeTtsPronunciation } from '@/lib/ttsPronunciation';

export async function coquiLocal(
  message: string,
  domainId?: string,
) {
  let voiceId = config("coquiLocal_voiceid");

  if (isNaN(Number(voiceId))) {
    console.warn(`Invalid voice ID "${voiceId}" detected. Defaulting to "0".`);
    voiceId = "0";
  }
  if (!voiceId) {
    throw new Error("Invalid TTS Voice Id");
  }

  try {


    // 発音矯正辞書を Ark-i API から取得して適用（失敗時はフォールバック辞書）
    const spokenText = await normalizeTtsPronunciation(message, domainId);

    // ★修正：message ではなく spokenText をエンコードして送る
    const encodedText = encodeURIComponent(spokenText);

    // 1. 日本語テキストを安全なURL形式に変換（エンコードエラーを回避！）
    // const encodedText = encodeURIComponent(message);
    const baseUrl = config("coquiLocal_url"); // 設定画面で入力したURL (例: http://127.0.0.1:5001)





    // 2. Style-Bert-VITS2 のGET API仕様に合わせてURLを組み立てる
    // ※ 自治体窓口用に感情は「Neutral」で固定しています
    const targetUrl = `${baseUrl}/voice?text=${encodedText}&model_id=${voiceId}&speaker_id=0&style=Neutral`;

    const res = await fetch(targetUrl, {
      method: 'GET',
      headers: {
        'Accept': 'audio/wav', // 音声データを受け取る設定
      }
    });

    if (!res.ok) {
      throw new Error(`TTS Server responded with status: ${res.status}`);
    }

    const data = await res.arrayBuffer();
    return { audio: data };

  } catch (error) {
    console.error('Error in Style-Bert-VITS2 TTS:', error);
    throw error;
  }
}

export async function coquiLocalVoiceIdList() {
  try {
    const baseUrl = config("coquiLocal_url");

    // Style-Bert-VITS2 からモデル一覧のJSONを取得する
    const response = await fetch(`${baseUrl}/models/info`, {
      method: 'GET',
      headers: {
        'Accept': "application/json",
      }
    });

    if (!response.ok) {
      throw new Error("Failed to fetch models");
    }

    const json = await response.json();

    // JSONのキー("0", "1", "2"...)を抽出してプルダウンリスト化する
    const selectedValues = Object.keys(json);

    return { list: selectedValues };

  } catch (error) {
    console.error('Error fetching voice list:', error);
    // 取得に失敗した場合は、手動で設定できるようダミーの数値を返す
    return { list: ["0", "1", "2", "3", "4", "5"] };
  }
}