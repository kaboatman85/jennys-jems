import './style.css';
import { Game } from './game.ts';
import type { ObjectiveProgressView } from './game.ts';
import { GemSprites, GEM_DEFS } from './gems.ts';
import { sfx } from './audio.ts';
import { drawBackground } from './bg.ts';
import { allLevelIds, generateLevel } from './levelgen.ts';
import { loadProgress, recordWin } from './levels-progress.ts';
import { BlockGame, drawBlock } from './blocks-game.ts';
import { allBlockLevelIds, generateBlockLevel } from './blocks-levels.ts';
import { isBlockLevelWon, loadBlockProgress, recordBlockWin } from './blocks-progress.ts';

const el = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;

const board = el<HTMLCanvasElement>('board');
const boardWrap = document.querySelector<HTMLElement>('.board-wrap')!;
const bg = el<HTMLCanvasElement>('bg');
const scoreEl = el<HTMLElement>('score');
const bestEl = el<HTMLElement>('best');
const bestKrEl = el<HTMLElement>('pill-best-kr');
const bestEnEl = el<HTMLElement>('pill-best-en');
const toast = el<HTMLElement>('toast');
const objectivesBar = el<HTMLElement>('objectives-bar');
const newGameBtn = el<HTMLButtonElement>('new-game');
const backBtn = el<HTMLButtonElement>('back-btn');
const endlessBtn = el<HTMLButtonElement>('endless-btn');
const soundBtn = el<HTMLButtonElement>('sound');
const soundGameBtn = el<HTMLButtonElement>('sound-game');
const screenLevels = el<HTMLElement>('screen-levels');
const screenGame = el<HTMLElement>('screen-game');
const footerLevels = el<HTMLElement>('footer-levels');
const footerGame = el<HTMLElement>('footer-game');
const levelsGrid = el<HTMLElement>('levels-grid');
const levelEndOverlay = el<HTMLElement>('level-end-overlay');
const levelEndTitle = el<HTMLElement>('level-end-title');
const levelEndStars = el<HTMLElement>('level-end-stars');
const levelEndDetail = el<HTMLElement>('level-end-detail');
const overlayMenuBtn = el<HTMLButtonElement>('overlay-menu-btn');
const overlayRetryBtn = el<HTMLButtonElement>('overlay-retry-btn');
const overlayNextBtn = el<HTMLButtonElement>('overlay-next-btn');
const screenHome = el<HTMLElement>('screen-home');
const homeGemsBtn = el<HTMLButtonElement>('home-gems-btn');
const homeBlocksBtn = el<HTMLButtonElement>('home-blocks-btn');
const gemsHomeBtn = el<HTMLButtonElement>('gems-home-btn');
const screenBlocks = el<HTMLElement>('screen-blocks');
const footerBlocks = el<HTMLElement>('footer-blocks');
const blocksWrap = el<HTMLElement>('blocks-wrap');
const blocksCanvas = el<HTMLCanvasElement>('blocks-canvas');
const blocksFrame = el<HTMLElement>('blocks-frame');
const blocksToast = el<HTMLElement>('blocks-toast');
// The three HUD pills read differently per mode: endless = Score/Stage/Best, level = Level/Jewels/Score.
const blocksValA = el<HTMLElement>('blocks-score');
const blocksValB = el<HTMLElement>('blocks-stage');
const blocksValC = el<HTMLElement>('blocks-best');
const blocksLabels = [
  [el<HTMLElement>('blocks-score-kr'), el<HTMLElement>('blocks-score-en')],
  [el<HTMLElement>('blocks-stage-kr'), el<HTMLElement>('blocks-stage-en')],
  [el<HTMLElement>('blocks-best-kr'), el<HTMLElement>('blocks-best-en')],
] as const;
const screenBlocksMenu = el<HTMLElement>('screen-blocks-menu');
const blocksLevelsGrid = el<HTMLElement>('blocks-levels-grid');
const blocksMenuHomeBtn = el<HTMLButtonElement>('blocks-menu-home-btn');
const blocksMenuEndlessBtn = el<HTMLButtonElement>('blocks-menu-endless-btn');
const blocksEndNextBtn = el<HTMLButtonElement>('blocks-end-next-btn');
const blocksBackBtn = el<HTMLButtonElement>('blocks-back-btn');
const blocksNewBtn = el<HTMLButtonElement>('blocks-new-btn');
const soundBlocksBtn = el<HTMLButtonElement>('sound-blocks');
const blocksEndOverlay = el<HTMLElement>('blocks-end-overlay');
const blocksEndTitle = el<HTMLElement>('blocks-end-title');
const blocksEndDetail = el<HTMLElement>('blocks-end-detail');
const blocksEndMenuBtn = el<HTMLButtonElement>('blocks-end-menu-btn');
const blocksEndAgainBtn = el<HTMLButtonElement>('blocks-end-again-btn');

const fmt = (n: number): string => n.toLocaleString('en-US');

type Mode = 'endless' | 'level';
let mode: Mode = 'endless';
let currentLevelId = 1;

const gemSprites = new GemSprites();
const game = new Game(board, gemSprites, {
  onScore(score, best) {
    scoreEl.textContent = fmt(score);
    if (mode === 'endless') bestEl.textContent = fmt(best);
  },
  onToast(text) {
    toast.textContent = text;
    toast.classList.remove('show');
    void toast.offsetWidth; // restart the CSS animation
    toast.classList.add('show');
  },
  onMoves(remaining) {
    if (mode === 'level') bestEl.textContent = fmt(remaining);
  },
  onObjective(progress) {
    renderObjectives(progress);
  },
  onLevelComplete({ score, movesUsed, movesLimit }) {
    const updated = recordWin(currentLevelId, score, movesUsed, movesLimit);
    showLevelEnd(true, updated[currentLevelId]?.stars ?? 0, score, movesUsed, movesLimit);
  },
  onLevelFailed({ score }) {
    showLevelEnd(false, 0, score, null, null);
  },
});

type BlocksMode = 'endless' | 'level';
let blocksMode: BlocksMode = 'endless';
let currentBlockLevel = 1;

const blocks = new BlockGame(blocksCanvas, {
  onScore(score, best) {
    if (blocksMode === 'endless') {
      blocksValA.textContent = fmt(score);
      blocksValC.textContent = fmt(best);
    } else {
      blocksValC.textContent = fmt(score);
    }
  },
  onStage(stage) {
    if (blocksMode === 'endless') blocksValB.textContent = String(stage + 1);
  },
  onJewels(collected, goal) {
    blocksValB.textContent = `${collected}/${goal}`;
  },
  onLevelEnd({ won, score, jewels, goal }) {
    if (won) recordBlockWin(currentBlockLevel, score);
    blocksEndTitle.textContent = won ? '레벨 클리어! Level Clear!' : '다음에 다시! Try Again';
    blocksEndDetail.textContent = `보석 Jewels ${jewels}/${goal} · 점수 Score ${fmt(score)}`;
    blocksEndNextBtn.classList.toggle('hidden', !won || currentBlockLevel >= allBlockLevelIds().length);
    blocksEndOverlay.classList.remove('hidden');
  },
  onToast(text) {
    blocksToast.textContent = text;
    blocksToast.classList.remove('show');
    void blocksToast.offsetWidth; // restart the CSS animation
    blocksToast.classList.add('show');
  },
  onLayout(rect) {
    Object.assign(blocksFrame.style, {
      left: `${rect.x}px`,
      top: `${rect.y}px`,
      width: `${rect.w}px`,
      height: `${rect.h}px`,
    });
  },
  onGameOver({ score, best, newBest }) {
    blocksEndTitle.textContent = newBest ? '새 기록! New Best!' : '게임 오버! Game Over';
    blocksEndDetail.textContent = `점수 Score ${fmt(score)} · 최고 Best ${fmt(best)}`;
    blocksEndNextBtn.classList.add('hidden');
    blocksEndOverlay.classList.remove('hidden');
  },
});

const OBJECTIVE_ICON: Record<ObjectiveProgressView['kind'], string> = {
  score: '',
  clearTiles: '🧊',
  dropItems: '🎁',
  collectColor: '',
};
const OBJECTIVE_LABEL: Record<ObjectiveProgressView['kind'], string> = {
  score: '점수',
  clearTiles: '타일',
  dropItems: '선물',
  collectColor: '모으기',
};

function renderObjectives(progress: ObjectiveProgressView[]): void {
  objectivesBar.replaceChildren();
  for (const o of progress) {
    const chip = document.createElement('div');
    chip.className = 'objective-chip' + (o.current >= o.target ? ' done' : '');
    if (o.kind === 'collectColor' && o.color !== undefined) {
      const swatch = document.createElement('span');
      swatch.className = 'swatch';
      swatch.style.background = GEM_DEFS[o.color]?.base ?? '#ccc';
      chip.appendChild(swatch);
    } else if (OBJECTIVE_ICON[o.kind]) {
      chip.append(`${OBJECTIVE_ICON[o.kind]} `);
    }
    chip.append(`${OBJECTIVE_LABEL[o.kind]} ${Math.min(o.current, o.target)}/${o.target}`);
    objectivesBar.appendChild(chip);
  }
}

function setMode(next: Mode): void {
  mode = next;
  bestKrEl.textContent = mode === 'level' ? '이동' : '최고';
  bestEnEl.textContent = mode === 'level' ? 'Moves' : 'Best';
  newGameBtn.classList.toggle('hidden', mode === 'level');
  objectivesBar.classList.toggle('hidden', mode !== 'level');
  if (mode !== 'level') objectivesBar.replaceChildren();
}

function relayoutBg(): void {
  drawBackground(bg);
}

function relayoutBoard(): void {
  if (screenGame.classList.contains('hidden')) return;
  game.layout(boardWrap.clientWidth, boardWrap.clientHeight);
}

function relayoutBlocks(): void {
  if (screenBlocks.classList.contains('hidden')) return;
  blocks.layout(blocksWrap.clientWidth, blocksWrap.clientHeight);
}

type Screen = 'home' | 'levels' | 'game' | 'blocks' | 'blocks-menu';

function showScreen(which: Screen): void {
  screenHome.classList.toggle('hidden', which !== 'home');
  screenLevels.classList.toggle('hidden', which !== 'levels');
  screenGame.classList.toggle('hidden', which !== 'game');
  screenBlocks.classList.toggle('hidden', which !== 'blocks');
  screenBlocksMenu.classList.toggle('hidden', which !== 'blocks-menu');
  footerLevels.classList.toggle('hidden', which !== 'home' && which !== 'levels' && which !== 'blocks-menu');
  footerGame.classList.toggle('hidden', which !== 'game');
  footerBlocks.classList.toggle('hidden', which !== 'blocks');
  if (which === 'game') relayoutBoard();
  if (which === 'blocks') {
    relayoutBlocks();
    blocks.start();
  } else {
    blocks.stop();
  }
}

function renderLevelGrid(): void {
  const progress = loadProgress();
  levelsGrid.replaceChildren();
  for (const id of allLevelIds()) {
    const record = progress[id];
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'level-btn';
    btn.setAttribute('role', 'listitem');
    const num = document.createElement('span');
    num.className = 'num';
    num.textContent = String(id);
    const stars = document.createElement('span');
    stars.className = 'stars';
    const earned = record?.stars ?? 0;
    stars.textContent = '★'.repeat(earned) + '☆'.repeat(3 - earned);
    btn.append(num, stars);
    btn.addEventListener('click', () => {
      sfx.unlock();
      launchLevel(id);
    });
    levelsGrid.appendChild(btn);
  }
}

function launchLevel(id: number): void {
  currentLevelId = id;
  setMode('level');
  showScreen('game');
  levelEndOverlay.classList.add('hidden');
  void game.startLevel(generateLevel(id));
}

function showLevelEnd(
  won: boolean,
  stars: number,
  score: number,
  movesUsed: number | null,
  movesLimit: number | null,
): void {
  levelEndTitle.textContent = won ? '레벨 클리어! Level Clear!' : '다음에 다시! Try Again';
  levelEndStars.innerHTML = Array.from({ length: 3 }, (_, i) =>
    i < stars ? '★' : '<span class="empty">★</span>',
  ).join('');
  levelEndDetail.textContent =
    movesUsed !== null && movesLimit !== null
      ? `점수 Score ${fmt(score)} · 이동 Moves ${movesUsed}/${movesLimit}`
      : `점수 Score ${fmt(score)}`;
  overlayNextBtn.classList.toggle('hidden', !won || currentLevelId >= allLevelIds().length);
  levelEndOverlay.classList.remove('hidden');
}

overlayMenuBtn.addEventListener('click', () => {
  levelEndOverlay.classList.add('hidden');
  renderLevelGrid();
  showScreen('levels');
});
overlayRetryBtn.addEventListener('click', () => {
  launchLevel(currentLevelId);
});
overlayNextBtn.addEventListener('click', () => {
  launchLevel(currentLevelId + 1);
});

backBtn.addEventListener('click', () => {
  renderLevelGrid();
  showScreen('levels');
});

endlessBtn.addEventListener('click', () => {
  sfx.unlock();
  setMode('endless');
  showScreen('game');
  void game.newGame();
});

newGameBtn.addEventListener('click', () => {
  sfx.unlock();
  void game.newGame();
});

function setBlocksMode(next: BlocksMode): void {
  blocksMode = next;
  const labels =
    next === 'level'
      ? [['레벨', 'Level'], ['보석', 'Jewels'], ['점수', 'Score']]
      : [['점수', 'Score'], ['단계', 'Stage'], ['최고', 'Best']];
  labels.forEach(([kr, en], i) => {
    blocksLabels[i]![0].textContent = kr!;
    blocksLabels[i]![1].textContent = en!;
  });
  if (next === 'level') blocksValA.textContent = String(currentBlockLevel);
  blocksNewBtn.innerHTML = next === 'level' ? '다시 <span class="en">Retry</span>' : '새 게임';
}

function startBlocksEndless(): void {
  setBlocksMode('endless');
  blocksEndOverlay.classList.add('hidden');
  blocks.newGame();
  showScreen('blocks');
}

function launchBlockLevel(id: number): void {
  currentBlockLevel = id;
  setBlocksMode('level');
  blocksEndOverlay.classList.add('hidden');
  blocks.startLevel(generateBlockLevel(id));
  showScreen('blocks');
}

function renderBlockLevelGrid(): void {
  const progress = loadBlockProgress();
  blocksLevelsGrid.replaceChildren();
  for (const id of allBlockLevelIds()) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'level-btn';
    btn.setAttribute('role', 'listitem');
    const num = document.createElement('span');
    num.className = 'num';
    num.textContent = String(id);
    const mark = document.createElement('span');
    mark.className = 'stars';
    mark.textContent = isBlockLevelWon(progress, id) ? '✓' : '';
    btn.append(num, mark);
    btn.addEventListener('click', () => {
      sfx.unlock();
      launchBlockLevel(id);
    });
    blocksLevelsGrid.appendChild(btn);
  }
}

function showBlocksMenu(): void {
  blocksEndOverlay.classList.add('hidden');
  renderBlockLevelGrid();
  showScreen('blocks-menu');
}

function restartBlocks(): void {
  sfx.unlock();
  if (blocksMode === 'level') launchBlockLevel(currentBlockLevel);
  else startBlocksEndless();
}

blocksMenuHomeBtn.addEventListener('click', () => showScreen('home'));
blocksMenuEndlessBtn.addEventListener('click', () => {
  sfx.unlock();
  startBlocksEndless();
});
blocksNewBtn.addEventListener('click', restartBlocks);
blocksBackBtn.addEventListener('click', showBlocksMenu);
blocksEndAgainBtn.addEventListener('click', restartBlocks);
blocksEndMenuBtn.addEventListener('click', showBlocksMenu);
blocksEndNextBtn.addEventListener('click', () => {
  sfx.unlock();
  launchBlockLevel(currentBlockLevel + 1);
});

function renderSoundButton(): void {
  const label = sfx.muted ? '소리: Off' : '소리: On';
  for (const btn of [soundBtn, soundGameBtn, soundBlocksBtn]) {
    btn.textContent = label;
    btn.setAttribute('aria-pressed', String(!sfx.muted));
    btn.classList.toggle('off', sfx.muted);
  }
}
function toggleSound(): void {
  sfx.setMuted(!sfx.muted);
  if (!sfx.muted) {
    sfx.unlock();
    sfx.play('swap');
  }
  renderSoundButton();
}
soundBtn.addEventListener('click', toggleSound);
soundGameBtn.addEventListener('click', toggleSound);
soundBlocksBtn.addEventListener('click', toggleSound);
renderSoundButton();

window.addEventListener('resize', () => {
  relayoutBg();
  relayoutBoard();
  relayoutBlocks();
});
new ResizeObserver(() => relayoutBoard()).observe(boardWrap);
new ResizeObserver(() => relayoutBlocks()).observe(blocksWrap);

/** The two cards on the landing page get small pictures drawn from each game's own art. */
function drawHomeIcons(): void {
  const gemsCtx = el<HTMLCanvasElement>('home-gems-icon').getContext('2d')!;
  const gemPx = 112;
  [
    { type: 0, x: 8, y: 44 },
    { type: 3, x: 124, y: 22 },
    { type: 2, x: 240, y: 44 },
  ].forEach(({ type, x, y }) => gemsCtx.drawImage(gemSprites.get(type, gemPx), x, y, gemPx, gemPx));

  const blocksCtx = el<HTMLCanvasElement>('home-blocks-icon').getContext('2d')!;
  const cell = 54;
  const ox = 18;
  const oy = 9;
  const cells: Array<[number, number, number, boolean]> = [
    [0, 0, 4, false],
    [0, 1, 4, false],
    [0, 2, 4, false],
    [1, 0, 4, false],
    [2, 0, 4, false],
    [1, 1, 0, true],
    [0, 4, 1, false],
    [0, 5, 1, false],
    [1, 4, 6, false],
    [1, 5, 6, true],
    [2, 4, 6, false],
    [2, 5, 6, false],
  ];
  for (const [r, c, color, jewel] of cells) drawBlock(blocksCtx, ox + c * cell, oy + r * cell, cell, color, jewel);
}

relayoutBg();
renderLevelGrid();
drawHomeIcons();
homeGemsBtn.addEventListener('click', () => {
  sfx.unlock();
  renderLevelGrid();
  showScreen('levels');
});
homeBlocksBtn.addEventListener('click', () => {
  sfx.unlock();
  showBlocksMenu();
});
gemsHomeBtn.addEventListener('click', () => showScreen('home'));

// ?debug exposes the game for automated testing, plus level helpers.
if (new URLSearchParams(location.search).has('debug')) {
  (
    window as unknown as {
      __game: Game;
      __launchLevel: (id: number) => void;
      __generateLevel: (id: number) => ReturnType<typeof generateLevel>;
    }
  ).__game = game;
  (window as unknown as { __blocks: BlockGame }).__blocks = blocks;
  (window as unknown as { __startBlocks: () => void }).__startBlocks = startBlocksEndless;
  (window as unknown as { __launchBlockLevel: (id: number) => void }).__launchBlockLevel = launchBlockLevel;
  (window as unknown as { __launchLevel: (id: number) => void }).__launchLevel = launchLevel;
  (window as unknown as { __generateLevel: typeof generateLevel }).__generateLevel = generateLevel;
}

// Offline play on the Fire tablet: cache the app shell so it still opens with no signal.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => {
      // Offline caching is a nice-to-have; a registration failure shouldn't block play.
    });
  });
}

// ?level=N launches straight into that level (handy for sharing/testing a spot).
const levelParam = new URLSearchParams(location.search).get('level');
if (levelParam && /^\d+$/.test(levelParam)) {
  const id = Number(levelParam);
  if (id >= 1 && id <= allLevelIds().length) {
    requestAnimationFrame(() => launchLevel(id));
  }
}

// ?blocklevel=N launches straight into that block-puzzle level.
const blockLevelParam = new URLSearchParams(location.search).get('blocklevel');
if (blockLevelParam && /^\d+$/.test(blockLevelParam)) {
  const id = Number(blockLevelParam);
  if (id >= 1 && id <= allBlockLevelIds().length) {
    requestAnimationFrame(() => launchBlockLevel(id));
  }
}
