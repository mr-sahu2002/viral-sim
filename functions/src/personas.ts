import { generateJson, MODELS } from './gemini.js';
import type { Persona, Platform } from './types.js';
import { PLATFORMS } from './platforms.js';

const IN_TARGET_SHARE = 0.75;
const CHUNK = 20;
const REGIONS = ['North America', 'India', 'Western Europe', 'Latin America', 'Africa', 'East Asia', 'Southeast Asia', 'Middle East', 'Eastern Europe', 'Oceania'];

// Behaviour mix is assigned in code, not by the model, so it stays realistic.
const STYLES: [string, number][] = [
  ['lurker', 0.4],
  ['reactor', 0.3],
  ['commenter', 0.15],
  ['sharer', 0.1],
  ['influencer', 0.05],
];

function pickStyle(): string {
  let r = Math.random();
  for (const [s, w] of STYLES) if ((r -= w) <= 0) return s;
  return 'lurker';
}

function followersFor(style: string): number {
  const base = { lurker: 150, reactor: 400, commenter: 900, sharer: 1500, influencer: 25000 }[style] ?? 300;
  return Math.round(base * Math.exp((Math.random() - 0.5) * 1.6));
}

interface Segment {
  label: string;
  description: string;
  inTarget: boolean;
}

async function planSegments(audience: string, platform: Platform): Promise<Segment[]> {
  const res = await generateJson<{ inTarget: Segment[]; outTarget: Segment[] }>({
    model: MODELS.flash,
    prompt: `Target audience for a ${PLATFORMS[platform].label} post: "${audience}".
Split this audience into 4 distinct sub-segments (different seniority, context, motivations, skepticism levels).
Then list 3 out-of-target groups who would plausibly still see the post on ${PLATFORMS[platform].label} (adjacent professions, general users, people who'd be indifferent or critical).
Keep each description to one sentence.`,
    schema: {
      type: 'object',
      properties: {
        inTarget: { type: 'array', items: segSchema() },
        outTarget: { type: 'array', items: segSchema() },
      },
      required: ['inTarget', 'outTarget'],
    },
  });
  return [
    ...res.inTarget.slice(0, 4).map((s) => ({ ...s, inTarget: true })),
    ...res.outTarget.slice(0, 3).map((s) => ({ ...s, inTarget: false })),
  ];
}

function segSchema() {
  return {
    type: 'object',
    properties: { label: { type: 'string' }, description: { type: 'string' } },
    required: ['label', 'description'],
  };
}

async function generateChunk(seg: Segment, count: number, platform: Platform, audience: string, idx: number) {
  const res = await generateJson<{ personas: Omit<Persona, 'id' | 'style' | 'followers' | 'inTarget'>[] }>({
    model: MODELS.flash,
    temperature: 1.1,
    prompt: `Create ${count} realistic, varied ${PLATFORMS[platform].label} users from this group:
"${seg.label}: ${seg.description}"
(The campaign's target audience is "${audience}"; this group is ${seg.inTarget ? 'IN' : 'OUTSIDE'} the target.)

Make them genuinely different: mixed ages, countries, genders, career stages, and attitudes — include skeptics, busy people, and people with strong opinions, not just enthusiasts.
Most people in this batch are based in ${REGIONS[idx % REGIONS.length]} (a few elsewhere); use full names that fit where they live, and avoid placeholder names like Alex/Sarah/John.
"opinions" = one sentence of their strong views or pet peeves about content on this platform.
"bio" = one sentence. "interests" = 3-5 short tags.`,
    schema: {
      type: 'object',
      properties: {
        personas: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              name: { type: 'string' },
              age: { type: 'integer' },
              role: { type: 'string' },
              bio: { type: 'string' },
              interests: { type: 'array', items: { type: 'string' } },
              opinions: { type: 'string' },
            },
            required: ['name', 'age', 'role', 'bio', 'interests', 'opinions'],
          },
        },
      },
      required: ['personas'],
    },
  });
  return res.personas.slice(0, count).map((p) => ({ ...p, inTarget: seg.inTarget }));
}

export async function generatePopulation(audience: string, platform: Platform, population: number): Promise<Persona[]> {
  const segments = await planSegments(audience, platform);
  const inSegs = segments.filter((s) => s.inTarget);
  const outSegs = segments.filter((s) => !s.inTarget);
  const nIn = Math.round(population * IN_TARGET_SHARE);

  // Split counts across segments, then into chunks of <= CHUNK.
  const jobs: { seg: Segment; count: number }[] = [];
  const spread = (segs: Segment[], total: number) => {
    segs.forEach((seg, i) => {
      let n = Math.floor(total / segs.length) + (i < total % segs.length ? 1 : 0);
      while (n > 0) {
        const c = Math.min(CHUNK, n);
        jobs.push({ seg, count: c });
        n -= c;
      }
    });
  };
  spread(inSegs, nIn);
  spread(outSegs, population - nIn);

  const chunks = await Promise.all(jobs.map((j, i) => generateChunk(j.seg, j.count, platform, audience, i)));

  const seen = new Map<string, number>();
  return chunks.flat().map((p, i) => {
    let name = p.name.trim();
    const n = seen.get(name) ?? 0;
    seen.set(name, n + 1);
    if (n > 0) name = `${name} ${String.fromCharCode(65 + (n % 26))}.`;
    const style = pickStyle();
    return { ...p, name, id: `p${i}`, style, followers: followersFor(style) };
  });
}
