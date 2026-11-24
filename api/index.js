// Vercel Function: every /api/* request is rewritten here (see vercel.json).
// `npm run build` bundles server/app.ts into build/server/app.js before functions are packaged.
export { app as default } from '../build/server/app.js';
