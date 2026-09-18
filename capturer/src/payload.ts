import { CapturePayload } from './types.js';

interface PayloadParts {
  content: string;
  contextText: string;
  url: string;
  anchor: string;
  note?: string;
  screenshot?: string | null;
  tags?: string[];
}

export const buildPayload = (parts: PayloadParts): CapturePayload => ({
  content: parts.content,
  contextText: parts.contextText,
  note: parts.note ?? '',
  source: { type: 'web', url: parts.url, anchor: parts.anchor },
  screenshot: parts.screenshot ?? null,
  tags: parts.tags ?? [],
  capturedAt: new Date().toISOString()
});
