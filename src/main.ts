import './style.css';
import { Game } from './game.ts';
import { GemSprites } from './gems.ts';
import { sfx } from './audio.ts';
import { drawBackground } from './bg.ts';

const el = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;

const board = el<HTMLCanvasElement>('board');
const boardWrap = document.querySelector<HTMLElement>('.board-wrap')!;
const bg = el<HTMLCanvasElement>('bg');
const scoreEl = el<HTMLElement>('score');
const bestEl = el<HTMLElement>('best');
const toast = el<HTMLElement>('toast');
const newGameBtn = el<HTMLButtonElement>('new-game');
const soundBtn = el<HTMLButtonElement>('sound');

const fmt = (n: number): string => n.toLocaleString('en-US');

const game = new Game(board, new GemSprites(), {
  onScore(score, best) {
    scoreEl.textContent = fmt(score);
    bestEl.textContent = fmt(best);
  },
  onToast(text) {
    toast.textContent = text;
    toast.classList.remove('show');
    void toast.offsetWidth; // restart the CSS animation
    toast.classList.add('show');
  },
});

function relayout(): void {
  drawBackground(bg);
  game.layout(boardWrap.clientWidth, boardWrap.clientHeight);
}

let started = false;
new ResizeObserver(() => {
  if (boardWrap.clientWidth === 0 || boardWrap.clientHeight === 0) return;
  relayout();
  if (!started) {
    started = true;
    void game.newGame();
  }
}).observe(boardWrap);

newGameBtn.addEventListener('click', () => {
  sfx.unlock();
  void game.newGame();
});

function renderSoundButton(): void {
  soundBtn.textContent = sfx.muted ? '소리: Off' : '소리: On';
  soundBtn.setAttribute('aria-pressed', String(!sfx.muted));
  soundBtn.classList.toggle('off', sfx.muted);
}
soundBtn.addEventListener('click', () => {
  sfx.setMuted(!sfx.muted);
  if (!sfx.muted) {
    sfx.unlock();
    sfx.play('swap');
  }
  renderSoundButton();
});
renderSoundButton();

// ?debug exposes the game for automated testing.
if (new URLSearchParams(location.search).has('debug')) {
  (window as unknown as { __game: Game }).__game = game;
}
