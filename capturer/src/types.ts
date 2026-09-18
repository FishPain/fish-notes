export interface EngineConfig {
  baseUrl: string;
  token: string;
}

export interface CapturePayload {
  content: string;
  contextText: string;
  note: string;
  source: {
    type: 'web';
    url: string;
    anchor: string;
  };
  screenshot: string | null;
  tags: string[];
  capturedAt: string;
}
