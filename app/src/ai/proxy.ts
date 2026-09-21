import { PROXY } from '../constants.js'

// Single client for the OpenAI-compatible proxy: bearer auth, JSON body, and 429
// backoff honouring Retry-After. Used by embeddings + OCR (the AI-SDK path in
// model.ts handles chat/markdown generation separately).
const MAX_RETRIES = 4
const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

export const proxyPost = async (
  path: string,
  body: unknown,
  opts: { timeoutMs?: number } = {}
): Promise<Response> => {
  const payload = JSON.stringify(body)
  for (let attempt = 0; ; attempt++) {
    const ctrl = opts.timeoutMs ? new AbortController() : undefined
    const timer = ctrl ? setTimeout(() => ctrl.abort(), opts.timeoutMs) : undefined
    let res: Response
    try {
      res = await fetch(`${PROXY.baseUrl}${path}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${PROXY.apiKey}` },
        body: payload,
        signal: ctrl?.signal
      })
    } finally {
      if (timer) clearTimeout(timer)
    }
    if (res.ok) return res
    const text = await res.text()
    if (res.status === 429 && attempt < MAX_RETRIES) {
      const hinted = Number(res.headers.get('retry-after')) || Number(text.match(/retry after (\d+)/i)?.[1])
      await sleep((Number.isFinite(hinted) && hinted > 0 ? hinted : attempt + 1) * 1000)
      continue
    }
    throw new Error(`proxy ${path} ${res.status}: ${text}`)
  }
}
