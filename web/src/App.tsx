import { useEffect, useMemo, useRef, useState } from 'react';
import { simulate } from './api';
import InputPanel, { type FormState } from './components/InputPanel';
import SpreadView from './components/SpreadView';
import VerdictView from './components/VerdictView';
import type { Exposure, Metrics, Persona, PostAnalysis, Reaction, Verdict } from './types';

export interface RunState {
  personas: Persona[];
  edges: [string, string][];
  rounds: { exposures: Exposure[]; reactions: Reaction[] }[];
  analysis?: PostAnalysis;
  metrics?: Metrics;
  verdict?: Verdict;
}

const EMPTY: RunState = { personas: [], edges: [], rounds: [] };

export default function App() {
  const [form, setForm] = useState<FormState>({
    platform: 'linkedin',
    text: '',
    image: undefined,
    audience: 'Solo founders and small teams running tech businesses',
    population: 100,
    seeds: 6,
  });
  const [run, setRun] = useState<RunState>(EMPTY);
  const [previous, setPrevious] = useState<{ metrics: Metrics; score: number } | null>(null);
  const [running, setRunning] = useState(false);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const abort = useRef<AbortController | null>(null);

  useEffect(() => () => abort.current?.abort(), []);

  async function start(opts: { reusePopulation?: boolean; textOverride?: string } = {}) {
    if (!form.text.trim() && !form.image) return setError('Add post text or an image first.');
    const reuse = opts.reusePopulation && run.personas.length > 0;
    if (reuse && run.metrics && run.verdict) setPrevious({ metrics: run.metrics, score: run.verdict.viralityScore });
    else if (!reuse) setPrevious(null);

    const text = opts.textOverride ?? form.text;
    if (opts.textOverride) setForm((f) => ({ ...f, text }));

    abort.current?.abort();
    abort.current = new AbortController();
    setError('');
    setRunning(true);
    setRun(reuse ? { ...EMPTY, personas: run.personas, edges: run.edges } : EMPTY);

    try {
      await simulate(
        {
          platform: form.platform,
          text,
          image: form.image ? { mimeType: form.image.mimeType, data: form.image.data } : undefined,
          audience: form.audience,
          population: form.population,
          seeds: form.seeds,
          ...(reuse ? { personas: run.personas, edges: run.edges } : {}),
        },
        (e) => {
          switch (e.type) {
            case 'status':
              return setStatus(e.message);
            case 'analysis':
              return setRun((r) => ({ ...r, analysis: e.analysis }));
            case 'population':
              return setRun((r) => ({ ...r, personas: e.personas, edges: e.edges }));
            case 'round':
              return setRun((r) => ({ ...r, rounds: [...r.rounds, { exposures: e.exposures, reactions: e.reactions }] }));
            case 'metrics':
              return setRun((r) => ({ ...r, metrics: e.metrics }));
            case 'verdict':
              return setRun((r) => ({ ...r, verdict: e.verdict }));
            case 'error':
              return setError(e.message);
            case 'done':
              return setStatus('Done');
          }
        },
        abort.current.signal,
      );
    } catch (err) {
      if ((err as Error).name !== 'AbortError') setError((err as Error).message);
    } finally {
      setRunning(false);
    }
  }

  const hasRun = run.personas.length > 0;
  const platformLabel = useMemo(() => ({ linkedin: 'LinkedIn', x: 'X', instagram: 'Instagram' })[form.platform], [form.platform]);

  return (
    <div className="page">
      <header className="masthead">
        <div>
          <h1>Virality simulator</h1>
          <p className="sub">Test a {platformLabel} post on a synthetic audience before you publish it.</p>
        </div>
        <span className="mono muted">Gemini · Firebase</span>
      </header>

      <section>
        <SectionTitle n="01" title="Post" />
        <InputPanel form={form} setForm={setForm} running={running} status={status} onRun={() => start()} />
        {error && <div className="error">⚠ {error}</div>}
      </section>

      <section>
        <SectionTitle
          n="02"
          title="Spread"
          note="All personas plotted — the algorithm decides who gets shown · red solid = shared directly · grey dashed = shown by algo · grey = never shown"
        />
        <SpreadView run={run} running={running} status={status} />
      </section>

      {hasRun && (
        <section>
          <SectionTitle n="03" title="Verdict" note="Comparative, not predictive" />
          <VerdictView
            run={run}
            previous={previous}
            running={running}
            onRerun={(text) => start({ reusePopulation: true, textOverride: text })}
          />
        </section>
      )}
    </div>
  );
}

function SectionTitle({ n, title, note }: { n: string; title: string; note?: string }) {
  return (
    <div className="section-title">
      <span className="mono">
        <b>{n}</b>&nbsp;&nbsp;{title.toUpperCase()}
      </span>
      {note && <span className="mono muted small">{note}</span>}
    </div>
  );
}
