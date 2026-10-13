"""End-to-end browser playtest for Jenny's Jems (Playwright, headless Chromium).

Usage (from the repo root):
    npm run build
    python3 tools/playtest.py [screenshot-dir]

Starts `vite preview` on :4173, plays ~35 moves through the real UI using the
?debug hooks (window.__game.getHint / isBusy), checks score, invalid swaps,
New Game mid-animation, and a phone-size layout, then prints any console errors.
Needs: pip install playwright && playwright install chromium
"""
import os
import sys, time, subprocess, re
from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, "playtest-shots")
os.makedirs(OUT, exist_ok=True)
URL = "http://localhost:4173/?debug"

server = subprocess.Popen(
    ["npx", "vite", "preview", "--port", "4173", "--strictPort"],
    cwd=ROOT, stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
)
time.sleep(3)

errors = []
def score(page):
    return int(page.inner_text("#score").replace(",", "") or 0)

try:
    with sync_playwright() as p:
        b = p.chromium.launch()
        # Fire HD 10-ish portrait, touch device
        ctx = b.new_context(viewport={"width": 800, "height": 1280}, device_scale_factor=1.5,
                            has_touch=False)
        page = ctx.new_page()
        page.on("console", lambda m: errors.append(f"console.{m.type}: {m.text}") if m.type in ("error", "warning") else None)
        page.on("pageerror", lambda e: errors.append(f"pageerror: {e}"))
        page.goto(URL)
        page.wait_for_timeout(300)
        page.screenshot(path=f"{OUT}/01-dropin.png")
        page.wait_for_timeout(2500)
        page.screenshot(path=f"{OUT}/02-ready.png")

        def play_move():
            for _ in range(40):
                busy = page.evaluate("window.__game.isBusy")
                if not busy:
                    break
                page.wait_for_timeout(100)
            h = page.evaluate("window.__game.getHint()")
            assert h, "no hint"
            page.mouse.move(h["ax"], h["ay"])
            page.mouse.down()
            page.mouse.move((h["ax"] + h["bx"]) / 2, (h["ay"] + h["by"]) / 2, steps=3)
            page.mouse.move(h["bx"], h["by"], steps=3)
            page.mouse.up()

        s0 = score(page)
        play_move()
        page.wait_for_timeout(260)
        page.screenshot(path=f"{OUT}/03-clearing.png")
        page.wait_for_timeout(1800)
        s1 = score(page)
        print("score after first move:", s0, "->", s1)
        assert s1 > s0, "score did not increase after a valid move"
        page.screenshot(path=f"{OUT}/04-after-move.png")

        # Many more moves; board must always settle and stay playable.
        for i in range(30):
            play_move()
            page.wait_for_timeout(300)
        for _ in range(100):
            if not page.evaluate("window.__game.isBusy"):
                break
            page.wait_for_timeout(100)
        s2 = score(page)
        print("score after 31 moves:", s2)
        assert s2 > s1
        page.screenshot(path=f"{OUT}/05-after-31-moves.png")

        # Invalid swap: tap-tap two adjacent gems that don't match -> score unchanged.
        before = score(page)
        # Try several adjacent pairs until one is rejected (score unchanged).
        rejected = False
        box = page.evaluate("(() => { const r = document.getElementById('board').getBoundingClientRect(); return [r.left, r.top, r.width, r.height]; })()")
        left, top, w, h_ = box
        for (c, r) in [(0, 0), (3, 3), (5, 2), (1, 6), (6, 5), (2, 4)]:
            if page.evaluate("window.__game.isBusy"):
                page.wait_for_timeout(1500)
            cw = w / 10.0
            x1 = left + w * 0.5 + (c - 3.5) * (w / 9.6)
            y1 = top + h_ * 0.5 + (r - 3.5) * (h_ / 9.6)
            x2 = x1 + (w / 9.6)
            sb = score(page)
            page.mouse.click(x1, y1)
            page.mouse.click(x2, y1)
            page.wait_for_timeout(1800)
            if score(page) == sb:
                rejected = True
                break
        print("invalid swap rejected without score change:", rejected)

        # New Game mid-animation must not wedge the game.
        play_move()
        page.click("#new-game")
        page.wait_for_timeout(2500)
        assert score(page) == 0, "score not reset by New Game"
        busy = page.evaluate("window.__game.isBusy")
        print("busy after new game settles:", busy)
        assert not busy
        play_move()
        page.wait_for_timeout(1800)
        assert score(page) > 0
        page.screenshot(path=f"{OUT}/06-new-game.png")

        # Phone viewport layout check
        ctx2 = b.new_context(viewport={"width": 390, "height": 780}, device_scale_factor=2)
        pg2 = ctx2.new_page()
        pg2.on("pageerror", lambda e: errors.append(f"pageerror(phone): {e}"))
        pg2.goto(URL)
        pg2.wait_for_timeout(2800)
        pg2.screenshot(path=f"{OUT}/07-phone.png")
        sizes = pg2.evaluate("(() => { const r = document.getElementById('board').getBoundingClientRect(); return [r.width, r.height, innerWidth, innerHeight, document.documentElement.scrollHeight]; })()")
        print("phone board/window/scrollH:", sizes)
        b.close()
finally:
    server.terminate()

print("ERRORS:", errors if errors else "none")
