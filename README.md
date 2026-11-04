# Race Around the Large Data Set

An interactive A Level Mathematics **Large Data Set** classroom board game with teams, dice rolls, station and variable cards, data-cleaning/exam-trap questions, challenge cards and a review mode.

- **New GitHub Pages address (once activated):** https://lds.mrwalkermaths.com/
- **Original Netlify address:** https://ldsgame.netlify.app/
- **Source repository:** https://github.com/chriswalker-afk/ldsgame

## Migration provenance

On 4 November 2026, this repository was populated directly from the **current published Netlify site**, rather than from an older backup. The application consists of four static files:

- `index.html` — the board-game page
- `web/src/styles.css` — its styles
- `web/src/data.js` — the question bank and board content
- `web/src/main.js` — the game engine and interface
- `LDS_Board_game/images/` — all eight original station photographs, dynamically referenced by the board

The import preserved all application files exactly as served. The one change was removing Netlify's hosting-only HTML comment from `index.html`. No user-facing game rules, maths questions, layout, or JavaScript were rewritten.

The site needs no Netlify Functions, APIs, authentication, external CSS assets or other hosting services. All eight station photographs were also downloaded and compared byte-for-byte with their Netlify originals. The imported data and scripts were SHA-256 compared with the live Netlify deployment. The CI parity check repeats this comparison against the old Netlify site after removing its hosting-only comment.

## GitHub Pages activation

1. In [Settings → Pages](https://github.com/chriswalker-afk/ldsgame/settings/pages), select **Deploy from a branch**.
2. Choose **main** and **/(root)**, then save.
3. Enter **`lds.mrwalkermaths.com`** under **Custom domain** and save.
4. Enable **Enforce HTTPS** once GitHub provides the certificate, then verify https://lds.mrwalkermaths.com/ .

Cloudflare DNS has already been configured as a **DNS-only CNAME** from `lds.mrwalkermaths.com` to `chriswalker-afk.github.io`. The `CNAME` file in this repository sets the GitHub Pages branch-publishing custom-domain marker.

Keep Netlify active until GitHub Pages works and the live version is verified. The current game appears to maintain its in-progress state in memory, not persist it in browser local storage; reloading either origin restarts a session.

## Local development and checks

Start a local server from the repository root:

```sh
python3 -m http.server 8765
```

Then open `http://localhost:8765/`.

Run the static JavaScript and board-data checks using:

```sh
node --test tests/site-smoke.mjs
```

The automated checks test the original maths questions, browser gameplay, board images and static assets. A **manual** GitHub Actions workflow, `Compare LDS Game against original Netlify site`, can be run to repeat the exact-source parity comparison while the old Netlify site remains available; regular CI does not depend on that external host.
