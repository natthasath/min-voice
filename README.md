# 🎉 Min Voice

A real-time minority-vote party game for phones. Each round offers two choices, and only the players who picked the **less popular** side survive. The majority and anyone who didn't answer are eliminated, round after round, until one survivor is left.

![demo](https://img.shields.io/website?url=https%3A%2F%2Fmin-voice.vercel.app&label=demo)
![version](https://img.shields.io/github/package-json/v/natthasath/min-voice)
![react](https://img.shields.io/github/package-json/dependency-version/natthasath/min-voice/react)
![vite](https://img.shields.io/github/package-json/dependency-version/natthasath/min-voice/dev/vite)
![express](https://img.shields.io/github/package-json/dependency-version/natthasath/min-voice/express)
![last commit](https://img.shields.io/github/last-commit/natthasath/min-voice)

### 💎 Game Rules

- Every round has two choices and a per-question timer (10 seconds by default). Players can change their answer until time runs out.
- The side with fewer votes survives. The majority side and players who didn't answer are eliminated.
- A 50/50 tie, a unanimous vote or no answers at all voids the round: everyone survives and a new round starts.
- Eliminated players keep watching as spectators. Standings rank players by the round they were eliminated, and players eliminated in the same round share a rank.
- The game ends when one player is left, the questions run out, or the admin presses "End game". Everyone still alive then shares the win.
- Players who join mid-game watch as spectators and play in the next game.

### 🧊 Tech Stack

| Layer | Technology |
| --- | --- |
| Frontend | React 19 + Vite 8 + TypeScript |
| API | Express 5, served as a Vercel Function |
| Database | Neon Postgres (`@neondatabase/serverless`) |
| Hosting | Vercel (functions in `sin1`, Singapore) |

```text
api/      Vercel Function: routes every /api/* request to the Express app (bundled from server/ at build time)
server/   app.ts = REST API, game.ts = game rules, store.ts = Postgres reads/writes, db.ts = schema + connection
          dev.ts = local API server for npm run dev
shared/   types shared by client and server
src/      React app (player/ = phone screens, admin/ = admin dashboard)
```

All game state lives in Neon Postgres, with nothing kept in memory, so the API runs safely on many serverless instances. Pages poll the state every second instead of using WebSockets. A question closes on the first poll after its timer runs out.

### ✅ Requirements

- [Node.js](https://nodejs.org/) and npm
- A [Neon](https://neon.tech/) Postgres database (provisioned through the Vercel Marketplace)
- [Vercel CLI](https://vercel.com/docs/cli) to pull environment variables and deploy

---

### 🚀 Installation

```shell
npm install
vercel env pull .env.local
npm run dev        # API on :3000 + Vite on :5173
```

Open [http://localhost:5173](http://localhost:5173). Tables and seed data (6 starter questions, admin password `changeme`) are created automatically on the first API call.

### ⚙️ Configuration

| Variable | Description |
| --- | --- |
| `DATABASE_URL` | Neon connection string. The Vercel Marketplace integration sets it automatically. Locally, it is read from `.env.local`. |
| `PORT` | Local API port for `npm run dev` (default `3000`) |

> [!WARNING]
> If `.env.local` points at the production database, local development runs the same live game that real players see.

### 🔑 Admin Credentials

- The default admin password is **`changeme`**.
- Change it in the admin dashboard → **Settings** (`/admin/settings`). This requires the current password, and the new password must be at least 8 characters.
- The dashboard shows a warning banner while the default password is still in use.
- Changing the password signs out every other logged-in device.
- The password is stored as a scrypt hash with a salt in the `kv` table (key `admin`) on Neon.

> [!WARNING]
> Change the default password before sharing the game link. Anyone who knows `changeme` can control the game.

### 🐳 Deployment

- The Vercel project `min-voice` is connected to the Neon database `min-voice-db` (ap-southeast-1) through the Vercel Marketplace.

```shell
vercel deploy --prod
# or build locally and upload the exact output
vercel build --prod && vercel deploy --prebuilt --prod
```

The custom domain `min-voice.codeinsane.dev` uses Cloudflare DNS:

| Type | Name | Target | Proxy |
| --- | --- | --- | --- |
| CNAME | `min-voice` | `1bda39c8c7c94116.vercel-dns-017.com` | DNS only |

> [!IMPORTANT]
> Turn the Cloudflare proxy off (gray cloud, "DNS only"). Otherwise Vercel cannot verify the domain or issue the HTTPS certificate.

---

### 🏆 Usage

| Role | URL |
| --- | --- |
| Players (phone) | [https://min-voice.codeinsane.dev/](https://min-voice.codeinsane.dev/) |
| Admin dashboard | [https://min-voice.codeinsane.dev/admin](https://min-voice.codeinsane.dev/admin) |

1. The admin signs in, reviews the question bank and shares the player link.
2. Players pick a nickname and a profile color, then wait in the lobby.
3. The admin starts the game and controls each round: close early, extend the timer by 10 seconds, skip the question, go to the next question, or end the game.

### 👉🏼 Try it out

- [https://min-voice.vercel.app](https://min-voice.vercel.app)

### ⚠️ Troubleshooting

**Forgot the admin password.** Run the following in the Neon SQL Editor:

```sql
DELETE FROM kv WHERE key = 'admin';
```

The password resets to `changeme` when a new Vercel instance starts. Redeploy if you need the reset right away.
