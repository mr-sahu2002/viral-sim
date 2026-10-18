import { generateJson, MODELS } from './gemini.js';
import { adjacency, buildGraph } from './graph.js';
import { generatePopulation } from './personas.js';
import { PLATFORMS } from './platforms.js';
import type { Action, EventSink, Exposure, Metrics, Persona, PostAnalysis, Reaction, SimInput, Verdict } from './types.js';

const BATCH = 10;
const MOODS = ['rushed, thumb-scrolling between meetings', 'bored, casually scrolling', 'focused, reading carefully', 'tired, late-night scrolling', 'skeptical, in a critical mood'];

// How much each behaviour style amplifies the model's probabilities.
const STYLE_MULT: Record<string, { like: number; comment: number; share: number }> = {
  lurker: { like: 0.5, comment: 0.15, share: 0.15 },
  reactor: { like: 1.1, comment: 0.5, share: 0.5 },
  commenter: { like: 1, comment: 1.4, share: 0.7 },
  sharer: { like: 1, comment: 0.8, share: 1.6 },
  influencer: { like: 0.9, comment: 1, share: 1.3 },
};

const pick = <T,>(arr: T[]) => arr[Math.floor(Math.random() * arr.length)];
const clamp = (x: number) => Math.max(0, Math.min(1, x));

export async function analyzePost(input: SimInput): Promise<PostAnalysis> {
  return generateJson<PostAnalysis>({
    model: MODELS.flash,
    image: input.image,
    temperature: 0.4,
    prompt: `Analyse this ${PLATFORMS[input.platform].label} post${input.image ? ' (image attached)' : ' (no image)'} intended for: "${input.audience}".
${PLATFORMS[input.platform].norms}

POST TEXT:
"""${input.text}"""

Be candid and specific. imageDescription = "none" if there is no image.`,
    schema: {
      type: 'object',
      properties: {
        topic: { type: 'string' },
        hook: { type: 'string', description: 'The opening line / visual hook and how strong it is' },
        tone: { type: 'string' },
        cta: { type: 'string', description: 'Call to action, or "none"' },
        format: { type: 'string', description: 'Length, structure, hashtags, emoji usage' },
        imageDescription: { type: 'string' },
        strengths: { type: 'array', items: { type: 'string' } },
        weaknesses: { type: 'array', items: { type: 'string' } },
      },
      required: ['topic', 'hook', 'tone', 'cta', 'format', 'imageDescription', 'strengths', 'weaknesses'],
    },
  });
}

interface RawReaction {
  id: string;
  p_like: number;
  p_comment: number;
  p_share: number;
  reason: string;
  comment: string;
}

async function reactBatch(input: SimInput, batch: { persona: Persona; exp: Exposure; fromName?: string }[], round: number): Promise<Reaction[]> {
  const plat = PLATFORMS[input.platform];
  const people = batch
    .map(({ persona: p, exp, fromName }) => {
      const how = exp.via === 'share' ? `${fromName} reshared it` : exp.via === 'algo' && fromName ? `the feed showed it because ${fromName} engaged` : exp.via === 'algo' ? 'the algorithm recommended it (stranger\'s post)' : 'it appeared in their feed from the author';
      return `- id=${p.id} | ${p.name}, ${p.age}, ${p.role}. ${p.bio} Interests: ${p.interests.join(', ')}. Views: ${p.opinions} Behaviour: ${p.style}. Right now: ${pick(MOODS)}. Saw it because ${how}.`;
    })
    .join('\n');

  const res = await generateJson<{ reactions: RawReaction[] }>({
    model: MODELS.flash,
    image: input.image,
    temperature: 1,
    system: `You simulate how real social media users react to a post in their feed. Be realistic, not polite: most people scroll past most posts. ${plat.norms}`,
    prompt: `POST on ${plat.label}${input.image ? ' (image attached)' : ''}:
"""${input.text}"""

For EACH person below, think as them and estimate, given the post appears in their feed:
- p_like, p_comment, p_share: independent probabilities 0-1 that they would do each.
  Calibrate to reality: an average post gets p_like ~0.03-0.08 from a relevant viewer, p_comment ~0.01, p_share ~0.005. Only an exceptional, highly relevant post for that specific person goes above 0.3. Irrelevant posts should be near 0.
- reason: one first-person sentence in their voice explaining why they'd engage or scroll past (mention the specific thing that grabbed or lost them).
- comment: what they'd write if they commented (short, in their voice), else "".

PEOPLE:
${people}`,
    schema: {
      type: 'object',
      properties: {
        reactions: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              p_like: { type: 'number' },
              p_comment: { type: 'number' },
              p_share: { type: 'number' },
              reason: { type: 'string' },
              comment: { type: 'string' },
            },
            required: ['id', 'p_like', 'p_comment', 'p_share', 'reason', 'comment'],
          },
        },
      },
      required: ['reactions'],
    },
  });

  const byId = new Map(res.reactions.map((r) => [r.id, r]));
  return batch.map(({ persona, exp }) => {
    const r = byId.get(persona.id);
    if (!r) return { id: persona.id, action: 'ignore' as Action, p: { like: 0, comment: 0, share: 0 }, reason: 'Scrolled past without a second look.', round };
    const m = STYLE_MULT[persona.style] ?? STYLE_MULT.reactor;
    const trust = exp.via === 'share' ? 1.2 : 1; // a friend's reshare earns a little more attention
    const p = {
      like: clamp(r.p_like * plat.actionScale.like * m.like * trust),
      comment: clamp(r.p_comment * plat.actionScale.comment * m.comment * trust),
      share: clamp(r.p_share * plat.actionScale.share * m.share * trust),
    };
    // Record the strongest action that fires.
    const action: Action = Math.random() < p.share ? 'share' : Math.random() < p.comment ? 'comment' : Math.random() < p.like ? 'like' : 'ignore';
    return { id: persona.id, action, p, reason: r.reason, comment: action === 'comment' || action === 'share' ? r.comment || undefined : undefined, round };
  });
}

function computeMetrics(personas: Persona[], reactions: Map<string, Reaction>, rounds: number): Metrics {
  const byId = new Map(personas.map((p) => [p.id, p]));
  const all = [...reactions.values()];
  const count = (a: Action) => all.filter((r) => r.action === a).length;
  const inT = all.filter((r) => byId.get(r.id)?.inTarget);
  const engaged = all.filter((r) => r.action !== 'ignore').length;
  const engagedIn = inT.filter((r) => r.action !== 'ignore').length;
  return {
    population: personas.length,
    reached: all.length,
    reachedInTarget: inT.length,
    reachedOutTarget: all.length - inT.length,
    likes: count('like'),
    comments: count('comment'),
    shares: count('share'),
    ignores: count('ignore'),
    engagementRate: all.length ? engaged / all.length : 0,
    inTargetEngagementRate: inT.length ? engagedIn / inT.length : 0,
    rounds,
  };
}

function viralityScore(m: Metrics): number {
  const reach = m.population ? m.reached / m.population : 0;
  const eng = Math.min(1, m.inTargetEngagementRate / 0.35);
  const shareBoost = Math.min(1, m.shares / Math.max(1, m.population * 0.05));
  return Math.round(100 * (0.5 * reach + 0.3 * eng + 0.2 * shareBoost));
}

async function writeVerdict(input: SimInput, analysis: PostAnalysis, personas: Persona[], reactions: Map<string, Reaction>, metrics: Metrics): Promise<Verdict> {
  const byId = new Map(personas.map((p) => [p.id, p]));
  const line = (r: Reaction) => {
    const p = byId.get(r.id)!;
    return `- [${r.action.toUpperCase()}] ${p.role} (${p.inTarget ? 'in-target' : 'out-of-target'}, ${p.style}): "${r.reason}"${r.comment ? ` Comment: "${r.comment}"` : ''}`;
  };
  const all = [...reactions.values()];
  const engaged = all.filter((r) => r.action !== 'ignore').slice(0, 30);
  const ignored = all.filter((r) => r.action === 'ignore').sort(() => Math.random() - 0.5).slice(0, 30);

  const v = await generateJson<Verdict>({
    model: MODELS.pro,
    image: input.image,
    temperature: 0.5,
    prompt: `You are a sharp social media strategist reviewing results of a simulated ${PLATFORMS[input.platform].label} audience test.
Target audience: "${input.audience}"

POST:
"""${input.text}"""

POST ANALYSIS: ${JSON.stringify(analysis)}

RESULTS: ${JSON.stringify(metrics)}

WHAT ENGAGED PEOPLE SAID:
${engaged.map(line).join('\n') || '(nobody engaged)'}

WHAT PEOPLE WHO SCROLLED PAST SAID:
${ignored.map(line).join('\n') || '(none)'}

Write the verdict grounded in these persona reactions (quote patterns, not generic advice).
- fixes: 3-6 concrete, prioritised changes (area like Hook, Length, CTA, Visual, Hashtags, Tone, Targeting).
- rewrittenPost: a full improved version of the post ready to paste, native to ${PLATFORMS[input.platform].label}, applying the fixes and keeping the author's message. Use real line breaks (\\n) between short paragraphs and list items, as people format posts on this platform.
- imageAdvice: what the visual should be (or how to improve the attached one).
- viralityScore: 0-100 (will be recalibrated).`,
    schema: {
      type: 'object',
      properties: {
        viralityScore: { type: 'number' },
        summary: { type: 'string' },
        whatWorked: { type: 'array', items: { type: 'string' } },
        whatHurt: { type: 'array', items: { type: 'string' } },
        fixes: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              area: { type: 'string' },
              issue: { type: 'string' },
              suggestion: { type: 'string' },
              impact: { type: 'string', enum: ['high', 'medium', 'low'] },
            },
            required: ['area', 'issue', 'suggestion', 'impact'],
          },
        },
        rewrittenPost: { type: 'string' },
        imageAdvice: { type: 'string' },
      },
      required: ['viralityScore', 'summary', 'whatWorked', 'whatHurt', 'fixes', 'rewrittenPost', 'imageAdvice'],
    },
  });
  return { ...v, viralityScore: viralityScore(metrics) };
}

export async function runSimulation(input: SimInput, emit: EventSink): Promise<void> {
  const plat = PLATFORMS[input.platform];
  const maxRounds = Math.min(input.maxRounds ?? 5, 8);

  await emit({ type: 'status', message: 'Reading the post…' });
  const reuse = input.personas?.length && input.edges?.length;
  const [analysis, personas] = await Promise.all([
    analyzePost(input),
    reuse ? Promise.resolve(input.personas!) : (emit({ type: 'status', message: `Generating ${input.population} personas…` }), generatePopulation(input.audience, input.platform, input.population)),
  ]);
  const edges = reuse ? input.edges! : buildGraph(personas);
  await emit({ type: 'analysis', analysis });
  await emit({ type: 'population', personas, edges });

  const byId = new Map(personas.map((p) => [p.id, p]));
  const adj = adjacency(edges);
  const exposed = new Set<string>();
  const reactions = new Map<string, Reaction>();

  // Round 1 seeds: mostly in-target, like the author's own early reach.
  const inT = personas.filter((p) => p.inTarget).sort(() => Math.random() - 0.5);
  const outT = personas.filter((p) => !p.inTarget).sort(() => Math.random() - 0.5);
  const nSeeds = Math.min(input.seeds, personas.length);
  const nSeedIn = Math.min(inT.length, Math.round(nSeeds * 0.8));
  let frontier: Exposure[] = [...inT.slice(0, nSeedIn), ...outT.slice(0, nSeeds - nSeedIn)].map((p) => ({ id: p.id, via: 'seed' as const }));

  let round = 0;
  while (frontier.length && round < maxRounds) {
    round++;
    frontier.forEach((e) => exposed.add(e.id));
    await emit({ type: 'status', message: `Round ${round}: ${frontier.length} people see the post…` });

    const items = frontier.map((exp) => ({ persona: byId.get(exp.id)!, exp, fromName: exp.from ? byId.get(exp.from)?.name : undefined }));
    const batches: (typeof items)[] = [];
    for (let i = 0; i < items.length; i += BATCH) batches.push(items.slice(i, i + BATCH));
    const results = (await Promise.all(batches.map((b) => reactBatch(input, b, round)))).flat();
    results.forEach((r) => reactions.set(r.id, r));
    await emit({ type: 'round', round, exposures: frontier, reactions: results });

    // Spread to the next round.
    const next = new Map<string, Exposure>();
    const offer = (id: string, e: Exposure) => {
      if (!exposed.has(id) && !next.has(id)) next.set(id, e);
    };
    let engaged = 0;
    for (const r of results) {
      if (r.action === 'ignore') continue;
      engaged++;
      for (const nb of adj.get(r.id) ?? []) {
        if (r.action === 'share') offer(nb, { id: nb, via: 'share', from: r.id });
        else if (Math.random() < plat.networkShow[r.action]) offer(nb, { id: nb, via: 'algo', from: r.id });
      }
    }
    // Algorithmic explore: velocity earns reach to strangers, biased toward the target audience.
    const exploreCount = Math.round(engaged * plat.exploreBoost * (0.5 + Math.random()));
    const pool = personas.filter((p) => !exposed.has(p.id) && !next.has(p.id));
    for (let i = 0; i < exploreCount && pool.length; i++) {
      const preferIn = Math.random() < 0.7;
      const cands = pool.filter((p) => p.inTarget === preferIn);
      const chosen = pick(cands.length ? cands : pool);
      pool.splice(pool.indexOf(chosen), 1);
      offer(chosen.id, { id: chosen.id, via: 'algo' });
    }
    frontier = [...next.values()];
  }

  const metrics = computeMetrics(personas, reactions, round);
  await emit({ type: 'metrics', metrics });
  await emit({ type: 'status', message: 'Writing the verdict…' });
  const verdict = await writeVerdict(input, analysis, personas, reactions, metrics);
  await emit({ type: 'verdict', verdict });
  await emit({ type: 'done' });
}
