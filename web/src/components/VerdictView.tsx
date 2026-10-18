import { useMemo, useState } from 'react';
import type { RunState } from '../App';
import type { Metrics } from '../types';

const pct = (x: number) => `${(x * 100).toFixed(1)}%`;

export default function VerdictView(props: {
  run: RunState;
  previous: { metrics: Metrics; score: number } | null;
  running: boolean;
  onRerun: (text: string) => void;
}) {
  const { run, previous, running, onRerun } = props;
  const { metrics: m, verdict: v, analysis } = run;
  const [copied, setCopied] = useState(false);

  const voices = useMemo(() => {
    const byId = new Map(run.personas.map((p) => [p.id, p]));
    const all = run.rounds.flatMap((r) => r.reactions);
    const engaged = all.filter((r) => r.action !== 'ignore');
    const ignored = all.filter((r) => r.action === 'ignore');
    return { byId, engaged: engaged.slice(0, 6), ignored: ignored.slice(0, 6) };
  }, [run.personas, run.rounds]);

  if (!m) return <div className="card pad mono muted">{running ? 'Waiting for the simulation to finish…' : 'No results yet.'}</div>;

  const tiles: { label: string; value: string; prev?: string }[] = [
    { label: 'Reached', value: `${m.reached}/${m.population}`, prev: previous && `${previous.metrics.reached}` },
    { label: 'Likes', value: `${m.likes}`, prev: previous && `${previous.metrics.likes}` },
    { label: 'Comments', value: `${m.comments}`, prev: previous && `${previous.metrics.comments}` },
    { label: 'Shares', value: `${m.shares}`, prev: previous && `${previous.metrics.shares}` },
    { label: 'Engagement', value: pct(m.engagementRate), prev: previous && pct(previous.metrics.engagementRate) },
    { label: 'In-target eng.', value: pct(m.inTargetEngagementRate), prev: previous && pct(previous.metrics.inTargetEngagementRate) },
  ].map((t) => ({ ...t, prev: t.prev ?? undefined }));

  return (
    <div className="verdict">
      <div className="card score-row">
        <div className="score">
          <div className="mono label">Virality score</div>
          <div className="big">{v ? v.viralityScore : '…'}</div>
          {previous && v && (
            <div className={`mono small ${v.viralityScore >= previous.score ? 'up' : 'down'}`}>
              was {previous.score} ({v.viralityScore >= previous.score ? '+' : ''}
              {v.viralityScore - previous.score})
            </div>
          )}
        </div>
        <div className="tiles">
          {tiles.map((t) => (
            <div key={t.label} className="tile">
              <div className="mono tiny muted">{t.label.toUpperCase()}</div>
              <div className="val">{t.value}</div>
              {t.prev !== undefined && <div className="mono tiny muted">before: {t.prev}</div>}
            </div>
          ))}
        </div>
      </div>

      {!v ? (
        <div className="card pad mono muted">Gemini is writing the verdict…</div>
      ) : (
        <>
          <div className="card pad">
            <p className="summary">{v.summary}</p>
            <div className="two-col">
              <div>
                <div className="mono label good">What worked</div>
                <ul>{v.whatWorked.map((x, i) => <li key={i}>{x}</li>)}</ul>
              </div>
              <div>
                <div className="mono label bad">What hurt</div>
                <ul>{v.whatHurt.map((x, i) => <li key={i}>{x}</li>)}</ul>
              </div>
            </div>
          </div>

          <div className="card pad">
            <div className="mono label">What to fix</div>
            <div className="fixes">
              {v.fixes.map((f, i) => (
                <div key={i} className="fix">
                  <span className={`impact ${f.impact}`}>{f.impact}</span>
                  <div>
                    <b>{f.area}</b> — {f.issue}
                    <div className="small muted">→ {f.suggestion}</div>
                  </div>
                </div>
              ))}
            </div>
            <div className="mono label" style={{ marginTop: 18 }}>Visual</div>
            <p className="small">{v.imageAdvice}</p>
          </div>

          <div className="card pad">
            <div className="row between">
              <div className="mono label">Suggested rewrite</div>
              <div className="row gap">
                <button
                  className="ghost mono"
                  onClick={() => {
                    navigator.clipboard.writeText(v.rewrittenPost);
                    setCopied(true);
                    setTimeout(() => setCopied(false), 1500);
                  }}
                >
                  {copied ? 'COPIED' : 'COPY'}
                </button>
                <button className="primary mono" disabled={running} onClick={() => onRerun(v.rewrittenPost)}>
                  RE-RUN WITH THIS VERSION ↻
                </button>
              </div>
            </div>
            <pre className="rewrite">{v.rewrittenPost}</pre>
            <p className="mono tiny muted">Re-runs on the same personas and network, so the comparison is fair.</p>
          </div>
        </>
      )}

      <div className="card pad">
        <div className="two-col">
          <Voices title="Why people engaged" items={voices.engaged} byId={voices.byId} />
          <Voices title="Why people scrolled past" items={voices.ignored} byId={voices.byId} />
        </div>
      </div>

      {analysis && (
        <details className="card pad">
          <summary className="mono label">Post analysis</summary>
          <dl className="analysis">
            <dt>Topic</dt><dd>{analysis.topic}</dd>
            <dt>Hook</dt><dd>{analysis.hook}</dd>
            <dt>Tone</dt><dd>{analysis.tone}</dd>
            <dt>CTA</dt><dd>{analysis.cta}</dd>
            <dt>Format</dt><dd>{analysis.format}</dd>
            <dt>Image</dt><dd>{analysis.imageDescription}</dd>
          </dl>
        </details>
      )}
    </div>
  );
}

function Voices({ title, items, byId }: { title: string; items: { id: string; action: string; reason: string; comment?: string }[]; byId: Map<string, { name: string; role: string; inTarget: boolean }> }) {
  return (
    <div>
      <div className="mono label">{title}</div>
      {items.length === 0 && <p className="small muted">Nobody.</p>}
      {items.map((r) => {
        const p = byId.get(r.id)!;
        return (
          <div key={r.id} className="voice">
            <div className="mono tiny">
              <i className={`dot ${p.inTarget ? 'in' : 'out'}`} /> {p.name} · {p.role}
            </div>
            <div className="small">“{r.reason}”</div>
            {r.comment && <div className="small comment">💬 {r.comment}</div>}
          </div>
        );
      })}
    </div>
  );
}
