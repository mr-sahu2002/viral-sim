import { forceCollide, forceLink, forceManyBody, forceSimulation, forceX, forceY, type SimulationNodeDatum } from 'd3-force';
import { useEffect, useMemo, useState } from 'react';
import type { RunState } from '../App';
import type { Exposure, Persona, Reaction } from '../types';

const W = 1000;
const H = 520;
const R = 9;
const GLYPH = { like: '♥', comment: '✎', share: '↗' } as const;

type Node = SimulationNodeDatum & { id: string };

function layout(personas: Persona[], edges: [string, string][]) {
  const nodes: Node[] = personas.map((p) => ({ id: p.id }));
  const sim = forceSimulation(nodes)
    .force('link', forceLink<Node, { source: string; target: string }>(edges.map(([s, t]) => ({ source: s, target: t }))).id((d) => d.id).distance(38).strength(0.25))
    .force('charge', forceManyBody().strength(-60))
    .force('collide', forceCollide(R * 2.2))
    .force('x', forceX(W / 2).strength(0.04))
    .force('y', forceY(H / 2).strength(0.07))
    .stop();
  for (let i = 0; i < 400; i++) sim.tick();
  const xs = nodes.map((n) => n.x!);
  const ys = nodes.map((n) => n.y!);
  const [minX, maxX, minY, maxY] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const pad = 30;
  const sx = (W - 2 * pad) / Math.max(1, maxX - minX);
  const sy = (H - 2 * pad) / Math.max(1, maxY - minY);
  return new Map(nodes.map((n) => [n.id, { x: pad + (n.x! - minX) * sx, y: pad + (n.y! - minY) * sy }]));
}

export default function SpreadView({ run, running, status }: { run: RunState; running: boolean; status: string }) {
  const pos = useMemo(() => layout(run.personas, run.edges), [run.personas, run.edges]);
  const byId = useMemo(() => new Map(run.personas.map((p) => [p.id, p])), [run.personas]);
  const [replay, setReplay] = useState<number | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [hover, setHover] = useState<string | null>(null);

  const total = run.rounds.length;
  const shown = replay ?? total;

  useEffect(() => {
    if (replay === null) return;
    if (replay >= total) return void setReplay(null);
    const t = setTimeout(() => setReplay(replay + 1), 1000);
    return () => clearTimeout(t);
  }, [replay, total]);

  useEffect(() => setSelected(null), [run.personas]);

  const { exposure, reaction } = useMemo(() => {
    const exposure = new Map<string, Exposure & { round: number }>();
    const reaction = new Map<string, Reaction>();
    run.rounds.slice(0, shown).forEach((r, i) => {
      r.exposures.forEach((e) => exposure.set(e.id, { ...e, round: i + 1 }));
      r.reactions.forEach((x) => reaction.set(x.id, x));
    });
    return { exposure, reaction };
  }, [run.rounds, shown]);

  const counts = useMemo(() => {
    const all = [...reaction.values()];
    return {
      reached: exposure.size,
      likes: all.filter((r) => r.action === 'like').length,
      comments: all.filter((r) => r.action === 'comment').length,
      shares: all.filter((r) => r.action === 'share').length,
    };
  }, [exposure, reaction]);

  const sel = selected ? byId.get(selected) : undefined;
  const selReaction = selected ? reaction.get(selected) : undefined;
  const selExposure = selected ? exposure.get(selected) : undefined;
  const hov = hover ? byId.get(hover) : undefined;

  const progress = total ? shown / total : 0;
  const label = running ? (total ? `streaming round ${total}…` : status || 'starting…') : replay !== null ? `replaying round ${shown}/${total}` : total ? `${total} round${total > 1 ? 's' : ''} complete` : 'idle';

  return (
    <div className="card spread">
      <div className="canvas">
        {run.personas.length === 0 ? (
          <div className="empty mono muted">{running ? status : 'Run a simulation to see how the post spreads through the population.'}</div>
        ) : (
          <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid meet">
            {[...exposure.values()]
              .filter((e) => e.from && pos.has(e.from))
              .map((e) => {
                const a = pos.get(e.from!)!;
                const b = pos.get(e.id)!;
                return (
                  <line
                    key={`${e.from}-${e.id}`}
                    className={`edge ${e.via}`}
                    x1={a.x}
                    y1={a.y}
                    x2={b.x}
                    y2={b.y}
                  />
                );
              })}
            {run.personas.map((p) => {
              const { x, y } = pos.get(p.id)!;
              const ex = exposure.get(p.id);
              const re = reaction.get(p.id);
              const color = !ex ? 'var(--never)' : p.inTarget ? 'var(--in)' : 'var(--out)';
              const engaged = re && re.action !== 'ignore';
              const pending = ex && !re;
              return (
                <g
                  key={p.id}
                  className={`node ${selected === p.id ? 'selected' : ''} ${pending ? 'pending' : ''}`}
                  transform={`translate(${x},${y})`}
                  onClick={() => setSelected(p.id)}
                  onMouseEnter={() => setHover(p.id)}
                  onMouseLeave={() => setHover(null)}
                >
                  {ex?.via === 'seed' && <circle r={R + 4} fill="none" stroke={color} strokeWidth={1.2} strokeDasharray="2 2" />}
                  <circle r={R} fill={ex && !engaged && re ? 'var(--card)' : color} stroke={color} strokeWidth={2} />
                  {engaged && (
                    <text className="glyph" textAnchor="middle" dy="0.35em">
                      {GLYPH[re.action as keyof typeof GLYPH]}
                    </text>
                  )}
                </g>
              );
            })}
            {hov && pos.get(hov.id) && (
              <g transform={`translate(${Math.min(pos.get(hov.id)!.x + 14, W - 220)},${Math.max(pos.get(hov.id)!.y - 34, 4)})`} pointerEvents="none">
                <rect width={210} height={34} rx={3} className="tip-bg" />
                <text x={8} y={14} className="tip-name">
                  {hov.name}
                </text>
                <text x={8} y={27} className="tip-role">
                  {hov.role.slice(0, 34)}
                </text>
              </g>
            )}
          </svg>
        )}

        {run.personas.length > 0 && (
          <div className="counters mono">
            <span>
              <b>{counts.reached}</b>/{run.personas.length} reached
            </span>
            <span>♥ {counts.likes}</span>
            <span>✎ {counts.comments}</span>
            <span>↗ {counts.shares}</span>
          </div>
        )}

        {sel && (
          <aside className="persona-panel">
            <button className="close" onClick={() => setSelected(null)}>
              ×
            </button>
            <div className="mono tiny muted">{sel.inTarget ? 'IN-TARGET' : 'OUT-OF-TARGET'} · {sel.style.toUpperCase()} · {sel.followers.toLocaleString()} followers</div>
            <h3>{sel.name}</h3>
            <div className="small">
              {sel.age} · {sel.role}
            </div>
            <p className="small">{sel.bio}</p>
            <p className="small muted">“{sel.opinions}”</p>
            <div className="tags">
              {sel.interests.map((i) => (
                <span key={i}>{i}</span>
              ))}
            </div>
            <hr />
            {!selExposure ? (
              <p className="mono small muted">Never shown the post.</p>
            ) : !selReaction ? (
              <p className="mono small muted">Seeing it now…</p>
            ) : (
              <>
                <div className="mono small">
                  Round {selExposure.round} · {selExposure.via === 'seed' ? 'seed reach' : selExposure.via === 'share' ? `reshared by ${byId.get(selExposure.from!)?.name}` : selExposure.from ? `shown by algo (via ${byId.get(selExposure.from)?.name})` : 'shown by algo (explore)'}
                </div>
                <div className={`action-badge ${selReaction.action}`}>{selReaction.action === 'ignore' ? 'scrolled past' : selReaction.action}</div>
                <p className="small">“{selReaction.reason}”</p>
                {selReaction.comment && <p className="small comment">💬 {selReaction.comment}</p>}
                <div className="mono tiny muted">
                  p(like) {(selReaction.p.like * 100).toFixed(1)}% · p(comment) {(selReaction.p.comment * 100).toFixed(1)}% · p(share) {(selReaction.p.share * 100).toFixed(1)}%
                </div>
              </>
            )}
          </aside>
        )}
      </div>

      <div className="spread-footer">
        <button className="ghost mono" onClick={() => setReplay(0)} disabled={running || total === 0}>
          REPLAY
        </button>
        <div className="progress">
          <div style={{ width: `${(running ? 1 : progress) * 100}%` }} className={running ? 'indeterminate' : ''} />
        </div>
        <span className="mono small">{label}</span>
        <div className="legend mono tiny">
          <span><i className="dot in" /> in-target</span>
          <span><i className="dot out" /> out-of-target</span>
          <span><i className="dot never" /> never shown</span>
          <span><i className="dot hollow" /> scrolled past</span>
          <span><i className="ln share" /> shared directly</span>
          <span><i className="ln algo" /> shown by algo</span>
          <span>♥ liked</span>
          <span>✎ commented</span>
          <span>↗ shared</span>
        </div>
      </div>
    </div>
  );
}
