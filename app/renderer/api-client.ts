interface EngineConfig {
  baseUrl: string
  token: string
}

// Single wrapper for all engine calls (never call fetch directly in components).
export const makeApiClient = (cfg: EngineConfig, fetchImpl: typeof fetch = fetch) => {
  const request = async <T>(path: string, init: RequestInit = {}): Promise<T> => {
    const res = await fetchImpl(cfg.baseUrl + path, {
      ...init,
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${cfg.token}`,
        ...(init.headers || {})
      }
    })
    if (!res.ok) throw new Error(`engine ${res.status}`)
    return res.json() as Promise<T>
  }
  return { request }
}
