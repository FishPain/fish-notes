import { makeApiClient } from './api-client.js'

// The renderer's single engine client. baseUrl + token are injected by the preload
// (window.engine). Kept in its own module so non-React code (the store) can import
// it without pulling in main.tsx / creating an import cycle.
export const api = makeApiClient(window.engine)
