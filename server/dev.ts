// Local API server for `npm run dev`; Vite proxies /api here. On Vercel, api/index.ts serves the same app.
try {
  process.loadEnvFile('.env.local');
} catch {
  // No .env.local: DATABASE_URL must come from the environment.
}

export {};

const { app } = await import('./app.js');
const PORT = Number(process.env.PORT ?? 3000);

app.listen(PORT, () => {
  console.log(`Min Voice API on http://localhost:${PORT} (open the Vite URL)`);
});
