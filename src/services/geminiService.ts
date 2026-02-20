import { GoogleGenAI, Modality, Type } from "@google/genai";

const getAI = () => new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });

export interface Message {
  id: string;
  role: 'user' | 'model';
  content: string;
  timestamp: number;
  type?: 'text' | 'image' | 'analysis';
  imageUrl?: string;
}

export const geminiService = {
  async chat(history: Message[], message: string) {
    const ai = getAI();
    const chat = ai.chats.create({
      model: "gemini-3-flash-preview",
      config: {
        systemInstruction: "You are Keshra AI, a premium, helpful, and sophisticated mobile assistant. Keep responses concise and mobile-friendly.",
      },
    });

    // Convert history to Gemini format
    const contents = history.map(msg => ({
      role: msg.role,
      parts: [{ text: msg.content }]
    }));

    // Note: sendMessageStream is preferred for real-time feel
    return chat.sendMessageStream({ message });
  },

  async generateImage(prompt: string) {
    const ai = getAI();
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash-image',
      contents: {
        parts: [{ text: prompt }],
      },
      config: {
        imageConfig: {
          aspectRatio: "1:1",
        },
      },
    });

    for (const part of response.candidates?.[0]?.content?.parts || []) {
      if (part.inlineData) {
        return `data:image/png;base64,${part.inlineData.data}`;
      }
    }
    throw new Error("No image generated");
  },

  async analyzeData(data: string) {
    const ai = getAI();
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: `Analyze the following data and provide a concise summary with key insights:\n\n${data}`,
      config: {
        systemInstruction: "You are a data analyst. Provide clear, bulleted insights.",
      },
    });
    return response.text;
  },

  async textToSpeech(text: string) {
    const ai = getAI();
    // Clean text: remove markdown artifacts and limit length
    const cleanText = text
      .replace(/[*_#`]/g, '')
      .replace(/\[.*?\]\(.*?\)/g, '') // remove links
      .trim()
      .slice(0, 1000);

    if (!cleanText) return null;

    try {
      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash-preview-tts",
        contents: [{ parts: [{ text: `Say: ${cleanText}` }] }],
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName: 'Kore' },
            },
          },
        },
      });

      const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
      if (base64Audio) {
        const binaryString = atob(base64Audio);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
          bytes[i] = binaryString.charCodeAt(i);
        }

        // WAV Header (44 bytes) for 24000Hz, 16-bit, Mono PCM
        const header = new ArrayBuffer(44);
        const view = new DataView(header);
        
        const writeString = (offset: number, s: string) => {
          for (let i = 0; i < s.length; i++) view.setUint8(offset + i, s.charCodeAt(i));
        };

        writeString(0, 'RIFF');
        view.setUint32(4, 36 + bytes.length, true);
        writeString(8, 'WAVE');
        writeString(12, 'fmt ');
        view.setUint32(16, 16, true);
        view.setUint16(20, 1, true); // PCM format
        view.setUint16(22, 1, true); // Mono
        view.setUint32(24, 24000, true); // Sample Rate
        view.setUint32(28, 24000 * 2, true); // Byte Rate
        view.setUint16(32, 2, true); // Block Align
        view.setUint16(34, 16, true); // Bits per Sample
        writeString(36, 'data');
        view.setUint32(40, bytes.length, true);

        const blob = new Blob([header, bytes], { type: 'audio/wav' });
        return URL.createObjectURL(blob);
      }
    } catch (error) {
      console.error("Gemini TTS API Error:", error);
      throw error;
    }
    return null;
  }
};
