(() => {
'use strict';

const COLS = 44, ROWS = 26, SUB = 4, PX = 2, CS = SUB * PX;
const HUD_ROWS = 10, HUD_H = HUD_ROWS * PX;
const W = COLS * CS, H = ROWS * CS + HUD_H;

const BG = '#a7b856';
const INK = '#2e3a15';
const FAINT = 'rgba(46,58,21,0.07)';

const SPEED_START = 420, SPEED_STEP = 16, SPEED_MIN = 240;
const APPLES_PER_LEVEL = 5;
const BONUS_TTL = 12000;

const DIRV = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
const REVERSE = { up: 'down', down: 'up', left: 'right', right: 'left' };
const EYES = {
  up: [[1, 0], [2, 0]],
  down: [[1, 3], [2, 3]],
  left: [[0, 1], [0, 2]],
  right: [[3, 1], [3, 2]]
};

const SPR = {
  ring: ['1111', '1001', '1001', '1111'],
  dot: ['0000', '0110', '0110', '0000'],
  brick: ['1111', '1101', '1111', '1011'],
  apple: ['0110', '1111', '1111', '0110'],
  appleB: ['0110', '1001', '1001', '0110']
};

const FONT = {
  '0': '111101101101111', '1': '010110010010111', '2': '111001111100111',
  '3': '111001111001111', '4': '101101111001001', '5': '111100111001111',
  '6': '111100111101111', '7': '111001010010010', '8': '111101111101111',
  '9': '111101111001111',
  A: '111101111101101', B: '110101110101110', C: '111100100100111',
  D: '110101101101110', E: '111100111100111', F: '111100111100100',
  G: '111100101101111', H: '101101111101101', I: '111010010010111',
  J: '011001001101111', K: '101101110101101', L: '100100100100111',
  M: '101111111101101', N: '110101101101101', O: '111101101101111',
  P: '111101111100100', R: '111101110101101', S: '111100111001111',
  T: '111010010010010', U: '101101101101111', V: '101101101101010',
  W: '101101111111101', Y: '101101111010010',
  '!': '010010010000010', '-': '000000111000000',
  '.': '000000000000010', ' ': '000000000000000'
};

const cvs = document.getElementById('lcd');
cvs.width = W;
cvs.height = H;
const ctx = cvs.getContext('2d');

const off = document.createElement('canvas');
off.width = W; off.height = H;
{
  const o = off.getContext('2d');
  o.fillStyle = BG;
  o.fillRect(0, 0, W, H);
  o.fillStyle = FAINT;
  for (let y = 0; y < H / PX; y++)
    for (let x = 0; x < W / PX; x++)
      o.fillRect(x * PX, y * PX, PX - 1, PX - 1);
}

const textW = (s, sc) => s.length * 4 * sc - sc;
const pad = (n, l) => String(n).padStart(l, '0');

function drawText(str, sx, sy, sc, color) {
  ctx.fillStyle = color;
  let x = sx;
  for (const ch of str) {
    const g = FONT[ch] || FONT[' '];
    for (let i = 0; i < 15; i++) {
      if (g[i] === '1') {
        ctx.fillRect((x + (i % 3) * sc) * PX, (sy + ((i / 3) | 0) * sc) * PX, PX * sc, PX * sc);
      }
    }
    x += 4 * sc;
  }
}

function drawPat(pat, cx, cy, color) {
  ctx.fillStyle = color;
  const ox = cx * SUB, oy = cy * SUB;
  for (let r = 0; r < 4; r++)
    for (let c = 0; c < 4; c++)
      if (pat[r][c] === '1') ctx.fillRect((ox + c) * PX, (oy + r) * PX, PX, PX);
}

function hlineW(a, x0, x1, y) { for (let x = x0; x <= x1; x++) a.push([x, y]); }
function vlineW(a, x, y0, y1) { for (let y = y0; y <= y1; y++) a.push([x, y]); }
function blockW(a, x0, y0, x1, y1) { for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) a.push([x, y]); }
function outlineW(a, x0, y0, x1, y1) {
  hlineW(a, x0, x1, y0); hlineW(a, x0, x1, y1);
  vlineW(a, x0, y0, y1); vlineW(a, x1, y0, y1);
}

const LAYOUTS = [
  { wrap: true, build: () => [] },
  {
    wrap: false,
    build: () => {
      const a = [];
      for (const x of [12, 31]) for (let y = 2; y <= 23; y++) if (y !== 7 && y !== 18) a.push([x, y]);
      return a;
    }
  },
  {
    wrap: false,
    build: () => {
      const a = [];
      outlineW(a, 9, 4, 34, 21);
      return a.filter(([x, y]) => !((y === 4 || y === 21) && (x === 21 || x === 22)));
    }
  },
  {
    wrap: true,
    build: () => {
      const a = [];
      blockW(a, 3, 2, 9, 8); blockW(a, 34, 2, 40, 8);
      blockW(a, 3, 17, 9, 23); blockW(a, 34, 17, 40, 23);
      return a;
    }
  },
  {
    wrap: false,
    build: () => {
      const a = [];
      for (const y of [7, 18]) { hlineW(a, 0, 15, y); hlineW(a, 28, 43, y); }
      return a;
    }
  },
  {
    wrap: false,
    build: () => {
      const a = [];
      for (const x of [21, 22]) { vlineW(a, x, 2, 10); vlineW(a, x, 15, 23); }
      hlineW(a, 7, 17, 12); hlineW(a, 26, 36, 12);
      return a;
    }
  }
];

const game = {
  status: 'boot',
  human: false,
  level: 1,
  score: 0,
  apples: 0,
  hi: parseInt(localStorage.getItem('jev-snake-hi') || '0', 10) || 0,
  speed: SPEED_START,
  wrap: true,
  walls: new Set(),
  wallsSig: '',
  snake: [],
  dir: 'right',
  turnBuf: null,
  apple: null,
  bonus: null,
  deaths: 0,
  deathCause: '',
  moveSource: 'jev',
  deadTimer: 0,
  acc: 0,
  frame: 0,
  lastFailure: null
};

const kk = (x, y) => x + ',' + y;

function rebuildWalls(level) {
  const def = LAYOUTS[(level - 1) % LAYOUTS.length];
  game.wrap = def.wrap;
  const occupied = new Set(game.snake.map(p => kk(p.x, p.y)));
  const walls = new Set();
  for (const [x, y] of def.build()) {
    const k = kk(x, y);
    if (!occupied.has(k)) walls.add(k);
  }
  game.walls = walls;
  game.wallsSig = [...walls].sort().join(';');
}

function freeCell(test) {
  for (let i = 0; i < 500; i++) {
    const x = (Math.random() * COLS) | 0, y = (Math.random() * ROWS) | 0;
    if (test(x, y)) return { x, y };
  }
  return null;
}

function spawnApple() {
  game.apple = freeCell((x, y) =>
    !game.walls.has(kk(x, y)) &&
    !game.snake.some(p => p.x === x && p.y === y) &&
    !(game.bonus && game.bonus.cells.some(([bx, by]) => bx === x && by === y))
  );
}

const bonusValue = () => 20 + game.level * 5;
const appleValue = () => 4 + game.level * 2;

function spawnBonus() {
  const p = freeCell((x, y) => {
    if (x + 1 >= COLS || y + 1 >= ROWS) return false;
    for (let dx = 0; dx <= 1; dx++)
      for (let dy = 0; dy <= 1; dy++) {
        if (game.walls.has(kk(x + dx, y + dy))) return false;
        if (game.snake.some(s => s.x === x + dx && s.y === y + dy)) return false;
      }
    if (game.apple && x <= game.apple.x && game.apple.x <= x + 1 && y <= game.apple.y && game.apple.y <= y + 1) return false;
    return true;
  });
  if (!p) return;
  game.bonus = {
    x: p.x, y: p.y, ttl: BONUS_TTL,
    cells: [[p.x, p.y], [p.x + 1, p.y], [p.x, p.y + 1], [p.x + 1, p.y + 1]]
  };
  brain.log('bonus bug appeared — worth ' + bonusValue() + ' before it escapes', '');
}

function stateKey(len, food) {
  const f = food === undefined ? game.apple : food;
  return 'w' + game.wallsSig + '|l' + game.level + '|n' + (len == null ? game.snake.length : len) +
    '|f' + (f ? kk(f.x, f.y) : '-');
}

function makeNav(bodyArr) {
  const len = bodyArr.length;
  const bodyIdx = new Map();
  for (let i = 0; i < len; i++) bodyIdx.set(kk(bodyArr[i][0], bodyArr[i][1]), i);
  const head = bodyArr[0];
  const startK = kk(head[0], head[1]);

  function passable(x, y, t) {
    if (game.walls.has(kk(x, y))) return false;
    const i = bodyIdx.get(kk(x, y));
    return i === undefined || (i + t) > len - 1;
  }

  function neighbors(x, y) {
    const out = [];
    for (const d of ['up', 'down', 'left', 'right']) {
      const dx = DIRV[d][0], dy = DIRV[d][1];
      let nx = x + dx, ny = y + dy;
      if (game.wrap) { nx = (nx + COLS) % COLS; ny = (ny + ROWS) % ROWS; }
      else if (nx < 0 || ny < 0 || nx >= COLS || ny >= ROWS) continue;
      out.push([nx, ny]);
    }
    return out;
  }

  function freeSides(x, y) {
    let n = 0;
    for (const [nx, ny] of neighbors(x, y)) {
      const k = kk(nx, ny);
      if (!game.walls.has(k) && !bodyIdx.has(k)) n++;
    }
    return n;
  }

  function openArea(sx, sy) {
    const seen = new Set([kk(sx, sy)]);
    const q = [[sx, sy]];
    let count = 1;
    while (q.length) {
      const [x, y] = q.pop();
      for (const [nx, ny] of neighbors(x, y)) {
        const k = kk(nx, ny);
        if (seen.has(k) || game.walls.has(k) || bodyIdx.has(k)) continue;
        seen.add(k);
        count++;
        if (count > 500) return count;
        q.push([nx, ny]);
      }
    }
    return count;
  }

  function search(targets, penalty, exclude) {
    const dist = new Map([[startK, 0]]);
    const depth = new Map([[startK, 0]]);
    const prev = new Map();
    const pq = [[0, head[0], head[1]]];
    while (pq.length) {
      let mi = 0;
      for (let i = 1; i < pq.length; i++) if (pq[i][0] < pq[mi][0]) mi = i;
      const [cost, x, y] = pq.splice(mi, 1)[0];
      const ck = kk(x, y);
      if (cost > dist.get(ck)) continue;
      if (targets.has(ck)) {
        const cells = [];
        let k = ck;
        while (k !== startK) {
          const parts = k.split(',');
          cells.unshift([+parts[0], +parts[1]]);
          k = prev.get(k);
        }
        return cells;
      }
      const t = depth.get(ck);
      for (const [nx, ny] of neighbors(x, y)) {
        const nk = kk(nx, ny);
        if (dist.has(nk)) continue;
        if (exclude && exclude.has(nk)) continue;
        if (!passable(nx, ny, t + 1)) continue;
        const c = cost + 1 + (penalty ? penalty(nx, ny) : 0);
        if (!dist.has(nk) || c < dist.get(nk)) {
          dist.set(nk, c);
          depth.set(nk, t + 1);
          prev.set(nk, ck);
          pq.push([c, nx, ny]);
        }
      }
    }
    return null;
  }

  function wander(maxSteps) {
    const visited = new Set([startK]);
    const cells = [];
    let x = head[0], y = head[1];
    for (let t = 1; t <= maxSteps; t++) {
      let best = null, bestScore = -1;
      for (const [nx, ny] of neighbors(x, y)) {
        const k = kk(nx, ny);
        if (visited.has(k) || !passable(nx, ny, t)) continue;
        const score = openArea(nx, ny) + freeSides(nx, ny) * 2;
        if (score > bestScore) { bestScore = score; best = [nx, ny]; }
      }
      if (!best) break;
      visited.add(kk(best[0], best[1]));
      cells.push(best);
      x = best[0]; y = best[1];
    }
    return cells.length ? cells : null;
  }

  return { neighbors, freeSides, openArea, search, wander, len, head, startK };
}

function simulateWalk(bodyArr, cells, growEnds) {
  const sim = bodyArr.map(p => [p[0], p[1]]);
  for (const [cx, cy] of cells) {
    sim.unshift([cx, cy]);
    const eatingHere = game.apple && cx === game.apple.x && cy === game.apple.y;
    if (!(eatingHere && growEnds)) sim.pop();
  }
  return sim;
}

function buildPathCandidates(bodyArr, baseDir) {
  const body = bodyArr || game.snake.map(p => [p.x, p.y]);
  const nav = makeNav(body);
  const head = body[0];

  function cap(cells, n) { return cells.length > n ? cells.slice(0, n) : cells; }

  function describe(cells, label, note, navCtx) {
    const ctx = navCtx || nav;
    let minSides = 4;
    for (const [x, y] of cells) minSides = Math.min(minSides, ctx.freeSides(x, y));
    const area = ctx.openArea(cells[cells.length - 1][0], cells[cells.length - 1][1]);
    return label + ': ' + cells.length + ' steps, ' + note + '; tightest cell has ' + minSides + ' free sides; open space at the end ~' + area + ' cells';
  }

  function cellsToTokens(cells) {
    const toks = [];
    let px = head[0], py = head[1], d = baseDir || game.dir;
    for (const [cx, cy] of cells) {
      let dx = cx - px, dy = cy - py;
      if (game.wrap) {
        if (dx > 1) dx = -1; else if (dx < -1) dx = 1;
        if (dy > 1) dy = -1; else if (dy < -1) dy = 1;
      }
      const nd = dx === 1 ? 'right' : dx === -1 ? 'left' : dy === 1 ? 'down' : 'up';
      toks.push(nd === d ? 'stay' : nd);
      d = nd;
      px = cx; py = cy;
    }
    return toks.join(',');
  }

  const options = {};
  const names = {};
  const seen = new Set();

  function offer(cells, label, note, navCtx) {
    if (!cells || !cells.length) return;
    cells = cap(cells, 64);
    const toks = cellsToTokens(cells);
    if (seen.has(toks) || Object.keys(options).length >= 8) return;
    seen.add(toks);
    options[toks] = describe(cells, label, note, navCtx);
    names[toks] = label;
  }

  const appleSet = game.apple ? new Set([kk(game.apple.x, game.apple.y)]) : null;
  const bonusSet = game.bonus ? new Set(game.bonus.cells.map(c => kk(c[0], c[1]))) : null;
  const tailSet = new Set([kk(body[body.length - 1][0], body[body.length - 1][1])]);

  function withAppleStall(route, label, note) {
    if (!route) return;
    const sim = simulateWalk(body, route, true);
    const nav2 = makeNav(sim);
    const tailK = kk(sim[sim.length - 1][0], sim[sim.length - 1][1]);
    let stall = nav2.search(new Set([tailK]), null, null);
    if (!stall || stall.length < 2) stall = nav2.wander(10);
    offer(route.concat(stall ? cap(stall, 10) : []), label, note + ', then stalls safely', nav2);
  }

  const shortest = appleSet ? nav.search(appleSet, null, null) : null;
  withAppleStall(shortest, 'fastest to the apple', 'eats the apple');

  if (shortest && shortest.length > 2) {
    const mid = shortest[(shortest.length / 2) | 0];
    withAppleStall(nav.search(appleSet, null, new Set([kk(mid[0], mid[1])])), 'alternate route', 'eats the apple via a different corridor');
  }

  withAppleStall(appleSet ? nav.search(appleSet, (x, y) => 4 - nav.freeSides(x, y), null) : null, 'safest to the apple', 'eats the apple, clearance-weighted');
  withAppleStall(appleSet ? nav.search(appleSet, (x, y) => (4 - nav.freeSides(x, y)) * 3, null) : null, 'extra cautious', 'eats the apple, avoids tight squeezes even if longer');

  const bonusRoute = bonusSet ? nav.search(bonusSet, null, null) : null;
  if (bonusRoute) {
    const sim = simulateWalk(body, bonusRoute, false);
    const nav2 = makeNav(sim);
    let cont = appleSet ? nav2.search(appleSet, null, null) : null;
    if (!cont) cont = nav2.wander(10);
    offer(bonusRoute.concat(cont ? cap(cont, 24) : []), 'bonus detour', 'eats the bonus bug, then heads for the apple', nav2);
  }

  if (!shortest) {
    offer(nav.search(tailSet, null, null), 'tail stall', 'chases the tail until the apple opens up');
    offer(nav.wander(20), 'wander', 'moves through the most open space');
  } else {
    offer(nav.search(tailSet, null, null), 'tail stall', 'safe waiting route along the tail');
  }

  return { options, names };
}

function simulatePending(pending) {
  let snake = game.snake.map(p => ({ x: p.x, y: p.y }));
  let dir = game.dir;
  let fatal = false, fatalAt = -1, ate = false;

  for (let i = 0; i < pending.length; i++) {
    const d = pending[i];
    if (REVERSE[dir] === d) { fatal = true; fatalAt = i; break; }
    const [dx, dy] = DIRV[d];
    let hx = snake[0].x + dx, hy = snake[0].y + dy;
    if (!game.wrap && (hx < 0 || hy < 0 || hx >= COLS || hy >= ROWS)) { fatal = true; fatalAt = i; break; }
    hx = (hx + COLS) % COLS; hy = (hy + ROWS) % ROWS;
    if (game.walls.has(kk(hx, hy))) { fatal = true; fatalAt = i; break; }
    const eating = game.apple && hx === game.apple.x && hy === game.apple.y;
    const n = eating ? snake.length : snake.length - 1;
    let hit = false;
    for (let j = 0; j < n; j++)
      if (snake[j].x === hx && snake[j].y === hy) { hit = true; break; }
    if (hit) { fatal = true; fatalAt = i; break; }
    snake.unshift({ x: hx, y: hy });
    if (!eating) snake.pop();
    dir = d;
    if (eating) { ate = true; break; }
  }

  return { snake, dir, fatal, fatalAt, ate };
}

function snapshotForBrain(pending) {
  const sim = simulatePending(pending);
  const snake = sim.snake;
  const grid = [];
  for (let y = 0; y < ROWS; y++) {
    let row = '';
    for (let x = 0; x < COLS; x++) {
      let ch = '.';
      if (game.walls.has(kk(x, y))) ch = '#';
      if (game.bonus) {
        const bi = game.bonus.cells.findIndex(([bx, by]) => bx === x && by === y);
        if (bi === 0) ch = 'K'; else if (bi > 0) ch = 'k';
      }
      if (game.apple && game.apple.x === x && game.apple.y === y) ch = 'F';
      const si = snake.findIndex(p => p.x === x && p.y === y);
      if (si === 0) ch = 'H';
      else if (si === snake.length - 1) ch = 'T';
      else if (si > 0) ch = 'O';
      row += ch;
    }
    grid.push(row);
  }

  const body = snake.map(p => [p.x, p.y]);
  const state = {
    board: { w: COLS, h: ROWS, wrap: game.wrap },
    grid,
    snake: { head: body[0], body, dir: sim.dir, len: body.length },
    apple: game.apple ? [game.apple.x, game.apple.y] : null,
    bonus: game.bonus ? { cells: game.bonus.cells, ttl_ms: Math.max(0, Math.round(game.bonus.ttl)) } : null,
    score: game.score,
    level: game.level,
    speed_ms: Math.round(game.speed),
    apples_to_next: APPLES_PER_LEVEL - (game.apples % APPLES_PER_LEVEL),
    last_failure: game.lastFailure ? { dir: game.lastFailure.dir, reason: game.lastFailure.reason } : null
  };

  return {
    fatal: sim.fatal,
    fatalAt: sim.fatalAt,
    ate: sim.ate,
    key: stateKey(body.length, sim.ate ? null : game.apple),
    state
  };
}

function planFail(d, reason) {
  game.lastFailure = { dir: d, reason };
  brain.voidPlans('Jev plan invalid at next step (' + reason + ': ' + d + ') — re-asking…', 'warn');
  game.status = 'wait';
  brain.kick();
}

function die(cause) {
  game.status = 'dead';
  game.deadTimer = 0;
  game.deathCause = cause;
  game.deaths++;
  if (game.score > game.hi) {
    game.hi = game.score;
    localStorage.setItem('jev-snake-hi', String(game.hi));
  }
  brain.log('the snake died: ' + cause + ' — last move by ' + game.moveSource, 'bad');
}

function move(d, src) {
  game.moveSource = src;
  const [dx, dy] = DIRV[d];
  game.dir = d;
  let hx = game.snake[0].x + dx, hy = game.snake[0].y + dy;
  if (!game.wrap && (hx < 0 || hy < 0 || hx >= COLS || hy >= ROWS)) { die('hit the border'); return; }
  hx = (hx + COLS) % COLS; hy = (hy + ROWS) % ROWS;
  if (game.walls.has(kk(hx, hy))) { die('hit a wall'); return; }
  const eating = game.apple && hx === game.apple.x && hy === game.apple.y;
  const n = eating ? game.snake.length : game.snake.length - 1;
  for (let j = 0; j < n; j++)
    if (game.snake[j].x === hx && game.snake[j].y === hy) { die('ran into its own body'); return; }
  game.snake.unshift({ x: hx, y: hy });
  if (!eating) game.snake.pop();

  if (eating) {
    game.score += appleValue();
    game.apples++;
    if (game.score > game.hi) game.hi = game.score;
    let leveled = false;
    if (game.apples % APPLES_PER_LEVEL === 0) {
      game.level++;
      game.speed = Math.max(SPEED_MIN, SPEED_START - SPEED_STEP * (game.level - 1));
      rebuildWalls(game.level);
      brain.log('LEVEL ' + game.level + ' — speed now ' + game.speed + 'ms/tick', '');
      if (!game.bonus) spawnBonus();
      leveled = true;
    }
    spawnApple();
    game.lastFailure = null;
    if (leveled) brain.onBoardChange('level ' + game.level + ' — new maze, fresh route requested');
    else brain.onAppleEaten();
  }

  if (game.bonus && game.bonus.cells.some(([bx, by]) => bx === hx && by === hy)) {
    game.score += bonusValue();
    if (game.score > game.hi) game.hi = game.score;
    brain.log('bonus bug eaten — +' + bonusValue(), '');
    game.bonus = null;
  }
}

function tick() {
  if (game.status !== 'run') return;
  if (game.human) {
    if (game.turnBuf) {
      if (REVERSE[game.dir] !== game.turnBuf) game.dir = game.turnBuf;
      game.turnBuf = null;
    }
    move(game.dir, 'human');
    return;
  }

  const d = brain.pull();
  if (!d) {
    game.status = 'wait';
    brain.kick();
    return;
  }
  if (REVERSE[game.dir] === d) { planFail(d, 'reversal'); return; }
  const [dx, dy] = DIRV[d];
  const rx = game.snake[0].x + dx, ry = game.snake[0].y + dy;
  if (!game.wrap && (rx < 0 || ry < 0 || rx >= COLS || ry >= ROWS)) { planFail(d, 'border'); return; }
  const hx = (rx + COLS) % COLS, hy = (ry + ROWS) % ROWS;
  if (game.walls.has(kk(hx, hy))) { planFail(d, 'wall'); return; }
  const eating = game.apple && hx === game.apple.x && hy === game.apple.y;
  const n = eating ? game.snake.length : game.snake.length - 1;
  for (let j = 0; j < n; j++)
    if (game.snake[j].x === hx && game.snake[j].y === hy) { planFail(d, 'own body'); return; }

  move(d, 'jev');
  game.lastFailure = null;
}

function resetGame() {
  game.level = 1; game.score = 0; game.apples = 0;
  game.speed = SPEED_START;
  game.dir = 'right';
  game.snake = [{ x: 21, y: 12 }, { x: 20, y: 12 }, { x: 19, y: 12 }, { x: 18, y: 12 }];
  game.turnBuf = null;
  game.bonus = null;
  game.apple = null;
  game.acc = 0; game.deadTimer = 0;
  game.lastFailure = null;
  game.human = false;
  document.getElementById('btnJev').disabled = true;
  document.getElementById('btnPause').textContent = 'Pause';
  rebuildWalls(1);
  spawnApple();
  game.status = 'boot';
  brain.reset();
  brain.log('new game — asking jev-1.13 for the first plan…');
  brain.kick();
}

function update(dt) {
  game.frame++;
  if (game.status === 'run') {
    if (game.bonus) {
      game.bonus.ttl -= dt;
      if (game.bonus.ttl <= 0) { game.bonus = null; brain.log('the bonus bug escaped', 'warn'); }
    }
    game.acc += dt;
    let guard = 0;
    while (game.acc >= game.speed && game.status === 'run' && guard < 10) {
      game.acc -= game.speed;
      tick();
      guard++;
    }
  } else if (game.status === 'boot' || game.status === 'wait') {
    brain.pump();
    if (brain.nextPath && !game.human) {
      game.status = 'run';
      game.acc = game.speed;
    }
  } else if (game.status === 'dead') {
    game.deadTimer += dt;
    if (game.deadTimer >= 3500) resetGame();
  }
}

function drawSnake() {
  const len = game.snake.length;
  for (let i = len - 1; i >= 0; i--) {
    const p = game.snake[i];
    if (i === 0) {
      drawPat(SPR.ring, p.x, p.y, INK);
      for (const [ex, ey] of EYES[game.dir]) {
        ctx.fillStyle = BG;
        ctx.fillRect((p.x * SUB + ex) * PX, (p.y * SUB + ey) * PX, PX, PX);
      }
    } else if (i === len - 1) {
      drawPat(SPR.dot, p.x, p.y, INK);
    } else {
      drawPat(i % 2 ? SPR.dot : SPR.ring, p.x, p.y, INK);
    }
  }
}

function drawBonus() {
  const b = game.bonus;
  if (!b) return;
  const ox = b.x * SUB, oy = b.y * SUB;
  ctx.fillStyle = INK;
  for (let c = 0; c < 8; c++) {
    ctx.fillRect((ox + c) * PX, (oy + 1) * PX, PX, PX);
    ctx.fillRect((ox + c) * PX, (oy + 6) * PX, PX, PX);
  }
  for (let r = 2; r <= 5; r++) {
    ctx.fillRect((ox + 0) * PX, (oy + r) * PX, PX, PX);
    ctx.fillRect((ox + 7) * PX, (oy + r) * PX, PX, PX);
  }
  for (const [cx, cy] of [[3, 3], [4, 3], [3, 4], [4, 4]])
    ctx.fillRect((ox + cx) * PX, (oy + cy) * PX, PX, PX);
  ctx.fillRect((ox + 2) * PX, (oy + 0) * PX, PX, PX);
  ctx.fillRect((ox + 5) * PX, (oy + 0) * PX, PX, PX);
  const legs = ((game.frame / 24) | 0) % 2 ? [1, 4, 6] : [2, 3, 5];
  for (const c of legs) ctx.fillRect((ox + c) * PX, (oy + 7) * PX, PX, PX);
  ctx.fillStyle = BG;
  ctx.fillRect(ox * PX, oy * PX, 8 * PX, PX);
  const frac = Math.max(0, Math.min(1, b.ttl / BONUS_TTL));
  if (frac > 0.02) {
    ctx.fillStyle = INK;
    ctx.fillRect(ox * PX, oy * PX, Math.max(1, Math.round(8 * PX * frac)), PX);
  }
}

function drawHUD() {
  drawText(pad(game.score, 4), 1, 2, 1, INK);
  const mid = game.human ? 'HUMAN' : 'LV' + pad(game.level, 2);
  drawText(mid, Math.round((COLS * SUB - textW(mid, 1)) / 2), 2, 1, INK);
  const r = 'HI' + pad(game.hi, 4);
  drawText(r, COLS * SUB - textW(r, 1) - 1, 2, 1, INK);
}

function overlay(lines, alpha) {
  ctx.fillStyle = 'rgba(167,184,86,' + (alpha == null ? 0.72 : alpha) + ')';
  ctx.fillRect(0, 0, W, ROWS * CS);
  let y = 5;
  for (const [txt, sc] of lines) {
    drawText(txt, Math.round((COLS * SUB - textW(txt, sc)) / 2), y, sc, INK);
    y += 5 * sc + 3;
  }
}

function render() {
  ctx.drawImage(off, 0, 0);
  drawHUD();

  ctx.save();
  ctx.translate(0, HUD_H);

  for (const k of game.walls) {
    const [x, y] = k.split(',').map(Number);
    drawPat(SPR.brick, x, y, INK);
  }

  if (game.apple) drawPat((((game.frame / 20) | 0) % 2) ? SPR.apple : SPR.appleB, game.apple.x, game.apple.y, INK);
  drawBonus();
  drawSnake();

  if (game.status === 'paused') {
    overlay([['PAUSED', 2], ['SPACE TO RESUME', 1]], 0.7);
  } else if (game.status === 'dead') {
    overlay([
      ['GAME OVER', 2],
      ['SCORE ' + game.score + '  HI ' + game.hi, 1],
      ['CAUSE: ' + (game.deathCause || '?').toUpperCase(), 1],
      ['RESTART IN ' + Math.max(0, Math.ceil((3500 - game.deadTimer) / 1000)), 1]
    ], 0.78);
  }

  ctx.restore();
}

const $ = id => document.getElementById(id);
const statusEl = $('status');
const statusLabel = statusEl.querySelector('.label');
const logEl = $('log');
const barsEl = $('bars');

brain.onLog = () => {
  logEl.innerHTML = '';
  for (const e of brain.logBuf) {
    const line = document.createElement('div');
    if (e.cls) line.className = e.cls;
    const t = new Date();
    line.textContent = pad(t.getHours(), 2) + ':' + pad(t.getMinutes(), 2) + ':' + pad(t.getSeconds(), 2) + '  ' + e.msg;
    logEl.appendChild(line);
  }
  logEl.scrollTop = logEl.scrollHeight;
};

let lastSync = 0;
function syncUI(ts) {
  if (ts - lastSync < 150) return;
  lastSync = ts;
  const s = brain.stats;
  $('stCalls').textContent = s.calls;
  $('stLat').textContent = s.calls ? Math.round(s.latSum / s.calls) + 'ms' : '–';
  $('stTok').textContent = s.tokens;
  $('stQueue').textContent = (brain.nextPath ? brain.nextPath.length : 0) + '+' + brain.queue.length;
  $('stScore').textContent = game.score;
  $('stLevel').textContent = game.level;
  $('stDeaths').textContent = game.deaths;
  $('stHi').textContent = game.hi;

  let cls = '', label = '';
  if (game.status === 'dead') { cls = 'dead'; label = 'game over — restarting'; }
  else if (game.status === 'paused') { label = 'paused'; }
  else if (game.human) { cls = 'human'; label = 'human control'; }
  else if (game.status === 'boot' || game.status === 'wait') { cls = 'wait'; label = brain.err ? 'api error — retrying' : 'waiting for jev…'; }
  else { cls = 'live'; label = 'live — jev is driving'; }
  statusEl.className = 'status ' + cls;
  statusLabel.textContent = label;

  const bars = brain.lastBars;
  const names = brain.lastNames || {};
  if (bars) {
    const entries = Object.entries(bars).sort((a, b) => b[1] - a[1]);
    barsEl.innerHTML = '';
    for (const [pathKey, p] of entries.slice(0, 5)) {
      const label = (names[pathKey] || pathKey.slice(0, 16)).split(' ')[0];
      const pct = Math.round(p * 100);
      const row = document.createElement('div');
      row.className = 'bar';
      row.innerHTML =
        '<span class="k" style="letter-spacing:0;font-size:10px">' + label + '</span>' +
        '<span class="t"><span class="f" style="width:' + pct + '%"></span></span>' +
        '<span class="p">' + pct + '%</span>';
      barsEl.appendChild(row);
    }
  }
}

function takeover(d) {
  if (game.status === 'dead' || game.status === 'boot') return;
  if (!game.human) {
    game.human = true;
    $('btnJev').disabled = false;
    brain.voidPlans('human took over — plans discarded', 'warn');
    if (game.status === 'wait') game.status = 'run';
    brain.log('human took control (arrows / WASD)');
  }
  if (REVERSE[game.dir] !== d && d !== game.dir) game.turnBuf = d;
}

function backToJev() {
  if (!game.human) return;
  game.human = false;
  $('btnJev').disabled = true;
  game.lastFailure = null;
  brain.reset();
  game.status = 'wait';
  brain.log('control returned to Jev');
  brain.kick();
}

function togglePause() {
  if (game.status === 'run' || game.status === 'wait') {
    game.status = 'paused';
    $('btnPause').textContent = 'Resume';
  } else if (game.status === 'paused') {
    game.status = (game.human || brain.queue.length || brain.nextPath) ? 'run' : 'wait';
    $('btnPause').textContent = 'Pause';
    if (game.status === 'wait') brain.kick();
  }
}

window.addEventListener('keydown', e => {
  if (e.key === ' ') { e.preventDefault(); togglePause(); return; }
  if (e.key === 'Enter') { resetGame(); return; }
  if (e.key === 'j' || e.key === 'J') { backToJev(); return; }
  const m = {
    ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right',
    w: 'up', s: 'down', a: 'left', d: 'right',
    W: 'up', S: 'down', A: 'left', D: 'right'
  }[e.key];
  if (m) { e.preventDefault(); takeover(m); }
});

document.querySelector('.keys').addEventListener('click', e => {
  const act = e.target && e.target.dataset && e.target.dataset.act;
  if (act === 'pause') togglePause();
  else if (act === 'restart') resetGame();
  else if (act === 'jev') backToJev();
});

let lastTs = 0;
function loop(ts) {
  const dt = Math.min(50, lastTs ? ts - lastTs : 16);
  lastTs = ts;
  try {
    update(dt);
    render();
    syncUI(ts);
  } catch (e) {
    if (window.__errs && window.__errs.length < 10) window.__errs.push('loop: ' + e.message + ' @ ' + e.lineNumber);
    console.error(e);
  }
  requestAnimationFrame(loop);
}

window.game = game;
game.snapshotForBrain = snapshotForBrain;
game.stateKey = stateKey;
game.buildPathCandidates = buildPathCandidates;
game.die = die;

resetGame();
requestAnimationFrame(loop);
})();
