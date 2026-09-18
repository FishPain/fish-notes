import { contextBridge } from 'electron'

// Expose the engine base URL + token to the renderer (read from args main injected).
const arg = (name: string): string => {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`))
  return hit ? hit.split('=')[1] : ''
}

contextBridge.exposeInMainWorld('engine', {
  baseUrl: `http://127.0.0.1:${arg('engine-port') || '7645'}`,
  token: arg('engine-token')
})
