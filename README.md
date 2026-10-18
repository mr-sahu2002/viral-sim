# Virality simulator

Test a LinkedIn, X or Instagram post on a synthetic audience of Gemini-powered personas before you publish. Watch it spread round by round, see who liked, commented or shared and why, then get concrete fixes and a rewritten post you can re-test on the same audience.

## Run locally

```bash
npm run install:all   # first time only
npm install           # root (concurrently)
npm run dev           # API on :8787, web on :5173
```

Open http://localhost:5173. The API reads `GOOGLE_API` (or `GEMINI_API_KEY`) from `./.env`.

Optional env overrides: `GEMINI_FLASH_MODEL` (default `gemini-3.5-flash`), `GEMINI_PRO_MODEL` (default `gemini-3.1-pro-preview`), `GEMINI_CONCURRENCY` (default 4).

## How it works

1. **Post analysis** (Gemini Flash, text and image): hook, tone, CTA, format, strengths and weaknesses.
2. **Personas** (Gemini Flash): the audience is split into 4 in-target segments plus 3 out-of-target groups (75/25), then personas are generated per segment in parallel. Behaviour style (lurker, reactor, commenter, sharer, influencer) and follower counts are assigned in code so the mix stays realistic.
3. **Social graph**: a small-world network clustered by segment, with extra links for high-follower hubs.
4. **Rounds**: seed agents see the post. Gemini returns `p_like`, `p_comment`, `p_share`, a first-person reason and comment text for 10 personas per call. The code then scales those by platform and style, and samples the actual action.
   - Share → every connection sees it (red solid line)
   - Like or comment → a connection sees it with a platform-specific probability (grey dashed line)
   - Engagement velocity → the algorithm pushes it to strangers, biased toward the target audience
   - Stops after 5 rounds or when nobody new sees it
5. **Verdict** (Gemini Pro): summary, what worked and what hurt, prioritised fixes, image advice and a full rewrite. The virality score is computed in code from reach, in-target engagement and shares.
6. **Re-run with this version**: sends the same personas and graph back, so before and after numbers are comparable.

Results are comparative, not predictive.

## Layout

```
functions/   Express API, deployable as a Firebase Cloud Function (src/index.ts)
  src/simulate.ts   spread engine and verdict
  src/personas.ts   persona generation
  src/graph.ts      social graph
  src/platforms.ts  per-platform algorithm parameters
  src/gemini.ts     Gemini client: JSON schema output, retry, concurrency cap
web/         React + Vite UI (d3-force layout, SVG)
firebase.json      Hosting (web/dist) + /api/** rewrite to the function
```

## Deploy to Firebase

1. Create a Firebase project on the **Blaze** plan and set its ID in `.firebaserc`.
2. `npx firebase-tools login`
3. `npx firebase-tools functions:secrets:set GEMINI_API_KEY`
4. `npm run deploy`

Hosting rewrites have a short request timeout, so long simulations may be cut off. If that happens, build the web app with `VITE_API_BASE=https://<region>-<project>.cloudfunctions.net/api` so it calls the function directly. The planned upgrade is to stream events through Firestore (`onSnapshot`) instead of SSE. The engine already emits through a pluggable `EventSink`.
