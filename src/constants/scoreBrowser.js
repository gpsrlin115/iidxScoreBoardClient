// Enable only after the server search, sort and series contract is deployed.
export const SCORE_BROWSER_V2_ENABLED = import.meta.env.VITE_ENABLE_SCORE_BROWSER_V2 === '1';
export const SCORE_BROWSER_MOCK = import.meta.env.DEV && import.meta.env.VITE_SCORE_BROWSER_MOCK === '1';
