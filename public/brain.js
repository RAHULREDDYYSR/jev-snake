const brain = (() => {
  const FIRE_AT = 6;
  const MODEL = 'jev-1.13';
  const DIRS = new Set(['up', 'down', 'left', 'right', 'stay']);

  const st = {
    queue: [],
    nextPath: null,
    inFlight: false,
    controller: null,
    retryTimer: null,
    attempts: 0,
    err: false,
    gen: 0,
    lastFailure: null,
    lastBars: null,
    lastNames: null,
    noRoute: 0,
    stats: { calls: 0, tokens: 0, latSum: 0, plans: 0, voids: 0, bad: 0, moves: 0 }
  };

  const logBuf = [];
  let onLog = null;

  function log(msg, cls) {
    logBuf.push({ msg, cls: cls || '' });
    if (logBuf.length > 60) logBuf.shift();
    if (onLog) onLog();
  }

  function buildQuestion(options) {
    return {
      type: 'choice',
      instructions:
        'Pick the best complete route for the Snake II snake described in `state`. ' +
        'Each option IS one full route, written as comma-separated steps, one step per cell the head will enter, in order. ' +
        'A step token is the direction the head moves that step; "stay" means keep the previous step direction and go straight. ' +
        '`grid` rows are top to bottom (y=0 is the first row, x grows right): H = head, O = body, T = tail, F = apple, K/k = bonus bug, # = wall, . = empty. ' +
        'Rules: stepping into a wall, into the border (when board.wrap is false), or into any body cell kills the snake instantly; eating the apple grows the snake by 1; the bonus bug is extra points and expires after bonus.ttl_ms. ' +
        'Goal: eat the apple (or the bonus bug) as soon as possible without ever entering a fatal cell. Prefer shorter routes unless the alternative is clearly safer (more open space around the head). If no offered route safely reaches the apple, pick the best survival route. ' +
        'Answer with exactly one option.',
      criteria: options
    };
  }

  async function fire() {
    if (st.inFlight || st.nextPath) return;
    const g = window.game;
    if (!g || g.human) return;
    if (!(g.status === 'boot' || g.status === 'wait' || g.status === 'run')) return;

    clearTimeout(st.retryTimer);
    st.inFlight = true;
    st.err = false;
    const gen = st.gen;

    let pending = st.queue.slice();
    let snap = g.snapshotForBrain(pending);
    if (snap.fatal) {
      pending = pending.slice(0, Math.max(0, snap.fatalAt));
      st.queue = pending.slice();
      snap = g.snapshotForBrain(pending);
    }
    const keyAt = snap.key;

    const cands = g.buildPathCandidates(snap.state.snake.body, snap.state.snake.dir);
    if (!cands.options || !Object.keys(cands.options).length) {
      st.inFlight = false;
      st.noRoute++;
      if (st.noRoute >= 6 && window.game) {
        window.game.die('trapped — no legal route exists');
        return;
      }
      log('no legal route exists — snake is boxed in, re-checking…', 'warn');
      st.retryTimer = setTimeout(fire, 1500);
      return;
    }
    st.noRoute = 0;
    st.lastNames = cands.names;

    const t0 = performance.now();
    st.controller = new AbortController();
    const timer = setTimeout(() => { if (st.controller) st.controller.abort(); }, 20000);

    try {
      const res = await fetch('/api/decide', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: MODEL,
          state: snap.state,
          questions: { path: buildQuestion(cands.options) }
        }),
        signal: st.controller.signal
      });
      clearTimeout(timer);
      const json = await res.json().catch(() => ({}));
      if (gen !== st.gen) return;
      st.inFlight = false;
      st.controller = null;

      if (!res.ok) {
        const msg = typeof json.error === 'string' ? json.error : (json.error && json.error.message) || ('http ' + res.status);
        const e = new Error(msg);
        e.retryAfter = json.retry_after || 0;
        e.quota = res.status === 429;
        throw e;
      }

      const answer = (json.answers && json.answers.path) || {};
      const choice = typeof answer.choice === 'string' ? answer.choice : '';
      const steps = parsePath(choice, snap.state.snake.dir);

      const ms = Math.round(performance.now() - t0);
      const tok = (json.usage && json.usage.input_tokens) || 0;
      st.stats.calls++;
      st.stats.tokens += tok;
      st.stats.latSum += ms;

      if (!steps) {
        st.stats.bad++;
        log('model returned no usable route — re-asking…', 'warn');
        fire();
        return;
      }

      const cur = window.game;
      if (cur && !cur.human && (cur.status === 'run' || cur.status === 'wait' || cur.status === 'boot')) {
        if (cur.stateKey() !== keyAt) {
          st.stats.voids++;
          log('route stale (board changed mid-call) — re-asking…', 'warn');
          fire();
          return;
        }
        st.nextPath = steps;
        st.stats.plans++;
        st.attempts = 0;
        st.lastFailure = null;
        if (answer.probabilities) st.lastBars = answer.probabilities;
        const name = (st.lastNames && st.lastNames[choice]) || 'route';
        const conf = answer.confidence == null ? '?' : answer.confidence.toFixed(2);
        log('#' + st.stats.plans + '  ' + (ms / 1000).toFixed(2) + 's  ' + tok + 'tok  [' + name + '] ' +
          steps.slice(0, 6).join(',') + (steps.length > 6 ? ' …' : '') + '  (' + steps.length + ' steps, conf ' + conf + ')');
      }
    } catch (e) {
      clearTimeout(timer);
      if (gen !== st.gen) return;
      st.inFlight = false;
      st.controller = null;
      st.err = true;
      st.attempts++;
      let d = Math.min(5000, 1200 * st.attempts);
      if (e.retryAfter && e.retryAfter > 0) d = Math.min(30000, e.retryAfter * 1000);
      const why = e.name === 'AbortError' ? 'timeout' : e.quota ? 'quota/rate limit' : e.message;
      log('decide failed (' + why + ') — retry in ' + (Math.round(d / 100) / 10) + 's', 'bad');
      st.retryTimer = setTimeout(fire, d);
    }
  }

  function parsePath(str, baseDir) {
    const toks = str.split(',').map(s => s.trim().toLowerCase());
    if (!toks.length) return null;
    const steps = [];
    let cur = baseDir;
    for (const t of toks) {
      if (t === 'stay') steps.push(cur);
      else if (DIRS.has(t)) { steps.push(t); cur = t; }
      else return null;
    }
    return steps;
  }

  function pump() {
    if (st.inFlight || st.nextPath) return;
    const g = window.game;
    if (!g || g.human) return;
    if (!(g.status === 'boot' || g.status === 'wait' || g.status === 'run')) return;
    if (st.queue.length <= FIRE_AT) fire();
  }

  function pull() {
    if (!st.queue.length && st.nextPath) {
      st.queue = st.nextPath;
      st.nextPath = null;
    }
    if (!st.queue.length) return null;
    const d = st.queue.shift();
    st.stats.moves++;
    return d;
  }

  function onAppleEaten() {
    st.gen++;
    clearTimeout(st.retryTimer);
    if (st.controller) { try { st.controller.abort(); } catch (_) {} st.controller = null; }
    st.inFlight = false;
    st.nextPath = null;
    fire();
  }

  function onBoardChange(reason) {
    st.gen++;
    clearTimeout(st.retryTimer);
    st.queue = [];
    st.nextPath = null;
    if (st.controller) { try { st.controller.abort(); } catch (_) {} st.controller = null; }
    st.inFlight = false;
    if (reason) log(reason, '');
    fire();
  }

  function voidPlans(reason, cls) {
    st.queue = [];
    st.nextPath = null;
    if (reason) log(reason, cls);
  }

  function reset() {
    st.gen++;
    clearTimeout(st.retryTimer);
    st.queue = [];
    st.nextPath = null;
    if (st.controller) { try { st.controller.abort(); } catch (_) {} st.controller = null; }
    st.lastFailure = null;
    st.err = false;
    st.attempts = 0;
    st.noRoute = 0;
  }

  function kick() { clearTimeout(st.retryTimer); pump(); }

  return {
    FIRE_AT,
    get queue() { return st.queue; },
    get nextPath() { return st.nextPath; },
    get stats() { return st.stats; },
    get err() { return st.err; },
    get lastBars() { return st.lastBars; },
    get lastNames() { return st.lastNames; },
    logBuf,
    set onLog(fn) { onLog = fn; },
    fire, pump, pull, reset, voidPlans, kick, log,
    onAppleEaten, onBoardChange,
    setLastFailure(f) { st.lastFailure = f; }
  };
})();
