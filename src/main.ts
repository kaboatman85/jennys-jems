import './style.css';
import { Game } from './game.ts';
import type { ObjectiveProgressView } from './game.ts';
import { GemSprites, GEM_DEFS } from './gems.ts';
import { sfx } from './audio.ts';
import { drawBackground } from './bg.ts';
import { allLevelIds, generateLevel } from './levelgen.ts';
import { isUnlocked, loadProgress, recordWin } from './levels-progress.ts';

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

const fmt = (n: number): string => n.toLocaleString('en-US');

type Mode = 'endless' | 'level';
let mode: Mode = 'endless';
let currentLevelId = 1;

const game = new Game(board, new GemSprites(), {
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

function showScreen(which: 'levels' | 'game'): void {
  screenLevels.classList.toggle('hidden', which !== 'levels');
  screenGame.classList.toggle('hidden', which !== 'game');
  footerLevels.classList.toggle('hidden', which !== 'levels');
  footerGame.classList.toggle('hidden', which !== 'game');
  if (which === 'game') relayoutBoard();
}

function renderLevelGrid(): void {
  const progress = loadProgress();
  levelsGrid.replaceChildren();
  for (const id of allLevelIds()) {
    const unlocked = isUnlocked(progress, id);
    const record = progress[id];
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'level-btn' + (unlocked ? '' : ' locked');
    btn.setAttribute('role', 'listitem');
    const num = document.createElement('span');
    num.className = 'num';
    num.textContent = unlocked ? String(id) : '🔒';
    const stars = document.createElement('span');
    stars.className = 'stars';
    const earned = record?.stars ?? 0;
    stars.textContent = unlocked ? '★'.repeat(earned) + '☆'.repeat(3 - earned) : '';
    btn.append(num, stars);
    if (unlocked) {
      btn.addEventListener('click', () => {
        sfx.unlock();
        launchLevel(id);
      });
    } else {
      btn.disabled = true;
    }
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

function renderSoundButton(): void {
  const label = sfx.muted ? '소리: Off' : '소리: On';
  for (const btn of [soundBtn, soundGameBtn]) {
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
renderSoundButton();

window.addEventListener('resize', () => {
  relayoutBg();
  relayoutBoard();
});
new ResizeObserver(() => relayoutBoard()).observe(boardWrap);

relayoutBg();
renderLevelGrid();

// ?debug exposes the game for automated testing, plus level helpers.
if (new URLSearchParams(location.search).has('debug')) {
  (
    window as unknown as {
      __game: Game;
      __launchLevel: (id: number) => void;
      __generateLevel: (id: number) => ReturnType<typeof generateLevel>;
    }
  ).__game = game;
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
