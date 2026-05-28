import { config } from '@/utils/config';
import { normalizeTtsPronunciation } from '@/lib/ttsPronunciation';

export async function piper(
    message: string,
    domainId?: string,
  ) {
    try {
      const spokenText = await normalizeTtsPronunciation(message, domainId);

      const res = await fetch('/api/piper', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          text: spokenText,
          url: config('piper_url'),
        }),
      });

      if (!res.ok) {
        throw new Error(`Piper proxy error: ${res.status} ${res.statusText}`);
      }

      const data = (await res.arrayBuffer()) as any;
      return { audio: data };
    } catch (error) {

      console.error('Error in piper:', error);
      throw error;
    }
  }