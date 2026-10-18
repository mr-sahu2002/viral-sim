import type { Persona } from './types.js';

/**
 * Small-world social graph: a ring lattice ordered by segment (so similar people
 * cluster), random rewiring for weak ties, and extra links for high-follower hubs.
 */
export function buildGraph(personas: Persona[]): [string, string][] {
  const n = personas.length;
  const order = [...personas].sort((a, b) => Number(b.inTarget) - Number(a.inTarget) || a.role.localeCompare(b.role));
  const key = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);
  const edges = new Map<string, [string, string]>();
  const add = (a: string, b: string) => {
    if (a !== b) edges.set(key(a, b), [a, b]);
  };

  const K = 2; // neighbours on each side
  const REWIRE = 0.15;
  for (let i = 0; i < n; i++) {
    for (let k = 1; k <= K; k++) {
      const j = (i + k) % n;
      if (Math.random() < REWIRE) add(order[i].id, order[Math.floor(Math.random() * n)].id);
      else add(order[i].id, order[j].id);
    }
  }

  // Hubs get connections proportional to log(followers).
  for (const p of personas) {
    const extra = Math.max(0, Math.round(Math.log10(p.followers) - 2.5) * 2);
    for (let e = 0; e < extra; e++) add(p.id, personas[Math.floor(Math.random() * n)].id);
  }
  return [...edges.values()];
}

export function adjacency(edges: [string, string][]): Map<string, string[]> {
  const adj = new Map<string, string[]>();
  for (const [a, b] of edges) {
    (adj.get(a) ?? adj.set(a, []).get(a)!).push(b);
    (adj.get(b) ?? adj.set(b, []).get(b)!).push(a);
  }
  return adj;
}
