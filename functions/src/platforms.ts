import type { Platform } from './types.js';

/**
 * Rough feed-algorithm model per platform.
 * - networkShow: chance a connection sees the post because this agent liked/commented on it.
 * - exploreBoost: extra non-connected agents the algorithm pushes it to, per engaged agent.
 * - actionScale: dampens model-reported probabilities toward real-world base rates.
 */
export const PLATFORMS: Record<
  Platform,
  {
    label: string;
    networkShow: { like: number; comment: number };
    exploreBoost: number;
    actionScale: { like: number; comment: number; share: number };
    norms: string;
  }
> = {
  linkedin: {
    label: 'LinkedIn',
    networkShow: { like: 0.22, comment: 0.45 },
    exploreBoost: 0.4,
    actionScale: { like: 0.8, comment: 0.6, share: 0.5 },
    norms:
      'LinkedIn: professional feed. Comments and dwell time are rewarded heavily; reactions from your network surface posts to you. Engagement bait, external links and walls of text get penalised. Typical engagement rate 2-5%.',
  },
  x: {
    label: 'X',
    networkShow: { like: 0.1, comment: 0.2 },
    exploreBoost: 0.8,
    actionScale: { like: 0.75, comment: 0.5, share: 0.6 },
    norms:
      'X (Twitter): fast-scrolling, opinionated, short attention. Reposts and replies drive reach; the For You feed pushes high-velocity posts to strangers. Hot takes and specific numbers work; long or vague posts get skipped. Typical engagement rate 0.5-3%.',
  },
  instagram: {
    label: 'Instagram',
    networkShow: { like: 0.08, comment: 0.15 },
    exploreBoost: 0.9,
    actionScale: { like: 0.85, comment: 0.5, share: 0.55 },
    norms:
      'Instagram: visual-first. The image decides whether people stop scrolling; captions are secondary. Shares to stories/DMs and saves drive Explore reach. Text-only or low-quality visuals perform poorly. Typical engagement rate 1-4%.',
  },
};
