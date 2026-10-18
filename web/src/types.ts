// Mirrors functions/src/types.ts — keep in sync.
export type Platform = 'linkedin' | 'x' | 'instagram';
export type Action = 'ignore' | 'like' | 'comment' | 'share';
export type ExposureVia = 'seed' | 'share' | 'algo';

export interface Persona {
  id: string;
  name: string;
  age: number;
  role: string;
  bio: string;
  interests: string[];
  opinions: string;
  /** lurker | reactor | commenter | sharer | influencer */
  style: string;
  followers: number;
  inTarget: boolean;
}

export interface SimInput {
  platform: Platform;
  text: string;
  image?: { mimeType: string; data: string }; // base64
  audience: string;
  population: number;
  seeds: number;
  maxRounds?: number;
  /** Reuse a previous run's population so A/B comparisons are fair. */
  personas?: Persona[];
  edges?: [string, string][];
}

export interface PostAnalysis {
  topic: string;
  hook: string;
  tone: string;
  cta: string;
  format: string;
  imageDescription: string;
  strengths: string[];
  weaknesses: string[];
}

export interface Exposure {
  id: string;
  via: ExposureVia;
  from?: string;
}

export interface Reaction {
  id: string;
  action: Action;
  p: { like: number; comment: number; share: number };
  reason: string;
  comment?: string;
  round: number;
}

export interface Metrics {
  population: number;
  reached: number;
  reachedInTarget: number;
  reachedOutTarget: number;
  likes: number;
  comments: number;
  shares: number;
  ignores: number;
  engagementRate: number; // engaged / reached
  inTargetEngagementRate: number;
  rounds: number;
}

export interface Verdict {
  viralityScore: number;
  summary: string;
  whatWorked: string[];
  whatHurt: string[];
  fixes: { area: string; issue: string; suggestion: string; impact: 'high' | 'medium' | 'low' }[];
  rewrittenPost: string;
  imageAdvice: string;
}

export type SimEvent =
  | { type: 'status'; message: string }
  | { type: 'analysis'; analysis: PostAnalysis }
  | { type: 'population'; personas: Persona[]; edges: [string, string][] }
  | { type: 'round'; round: number; exposures: Exposure[]; reactions: Reaction[] }
  | { type: 'metrics'; metrics: Metrics }
  | { type: 'verdict'; verdict: Verdict }
  | { type: 'done' }
  | { type: 'error'; message: string };

/** Where engine events go: SSE locally, Firestore when deployed. */
export type EventSink = (e: SimEvent) => void | Promise<void>;
