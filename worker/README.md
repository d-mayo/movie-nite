# The movie-nite Worker

A small Cloudflare Worker that holds the group's TMDB read token and relays the app's three TMDB calls (`/tmdb/search`, `/tmdb/movie/<id>` and `/tmdb/discover`). `/tmdb/discover` relays TMDB's discover endpoint with only these query parameters, each at most once and non-empty: `with_genres` and `with_keywords` (1 to 20 numeric ids joined by `,` or `|`), `with_original_language` (two lowercase letters), `primary_release_date.gte` and `primary_release_date.lte` (a real `YYYY-MM-DD` date), `vote_average.gte` and `vote_average.lte` (0 to 10, at most two decimals), `vote_count.gte` (a whole number to 999999) and `page` (1 to 500); the Worker adds `include_adult=false` and `include_video=false` itself, and any other, repeated, empty or malformed parameter is a `400` naming it with no TMDB call. It answers like the search relay: `200` with TMDB's JSON cached for an hour, `502` when TMDB refuses or can't be reached. It also has `/lb/probe`, which checks whether Letterboxd lets Cloudflare through, and `/lb/<user>`, which checks whether a Letterboxd profile exists: `200 {"username": ...}` when it does, `404` "No such profile" when Letterboxd says it doesn't, and `502` when Letterboxd can't be checked (a bot challenge included). `/lb/<user>/watchlist?page=<n>` (n from 1 to 99, default 1) reads one page of a public watchlist: `200 {"slugs": [...], "hasNext": ...}` cached for an hour, `404` "Watchlist is private" (Letterboxd answers a private watchlist with the same 403 "classified" page it uses for a block, so a 403 that is not a bot challenge reads as private) or "No such watchlist", and `502` otherwise. `/lb/<user>/list/<slug>?page=<n>` (a slug of lowercase letters, digits and hyphens, at most 200 characters; n from 1 to 999, default 1) reads one page of a public list the same way: `200 {"slugs": [...], "hasNext": ..., "lastPage": ...}` cached for an hour (`lastPage` is the highest page number in the page's pagination, or 1 when it has none, and a page past the end gives no slugs and still the last page), `404` "List is private" or "No such list", `502` otherwise. `/lb/film/<slug>` reads a film's TMDB id from its Letterboxd page: `200 {"slug": ..., "tmdbId": <number or null>}` cached for a week (null for an entry that is not a movie), `404` "No such film", `502` otherwise. `/lb/film-by-tmdb/<id>` (an id of 1 to 10 digits, else `400`) turns a TMDB id into the film's Letterboxd slug through Letterboxd's own `/tmdb/<id>/` address, fetched without following the redirect: `200 {"tmdbId": <number>, "slug": ...}` cached for a week when it redirects to `/film/<slug>/`, `404` "No such film" when Letterboxd answers its "TMDB Import Result" page (an id it has no film for; not cached, since the visit may start an import), `502` otherwise. The saved Letterboxd pages the tests read are in `worker/fixtures/`. It answers only the live site and local or LAN dev pages, and limits each IP to 120 TMDB and 300 Letterboxd requests a minute.

## One-time setup (you do this, not Claude)

Never paste a token or an ID into a chat. You type each one only into the page or command named below.

### A. Cloudflare account

1. Go to <https://dash.cloudflare.com/sign-up> and create a free account with your email and a password.
2. Open the verification email Cloudflare sends and click its link.
3. Sign in at <https://dash.cloudflare.com>. If it asks you to add a domain or pick a plan, skip it: you need neither.
4. In the left menu, click **Workers & Pages** (under Compute).
5. Scroll to the right-hand column of the Workers & Pages page (headed Account details). It shows your **workers.dev subdomain**; if it offers to set one, choose a name there. Ignore the **Create application** button: the Worker is created by Wrangler and CI, not from the dashboard.
6. Write the subdomain down. The Worker will live at `https://movie-nite.<subdomain>.workers.dev`. Tell Claude the subdomain only.

### B. The deploy credentials, for GitHub

7. Still in the dashboard, open **Workers & Pages**. The **Account ID** is shown in the right-hand column. Click its copy button.
8. Open the movie-nite repository on GitHub, then **Settings → Secrets and variables → Actions → New repository secret**.
9. Name it `CLOUDFLARE_ACCOUNT_ID`, paste the Account ID as the value, and click **Add secret**.
10. Back in Cloudflare, click your profile icon (top right) → **My Profile → API Tokens → Create Token**.
11. Next to the **Edit Cloudflare Workers** template, click **Use template**.
12. Under **Account Resources**, choose your account. Under **Zone Resources**, choose **All zones** if it asks (you have none).
13. Click **Continue to summary**, then **Create Token**.
14. Click **Copy**. Cloudflare shows the token only once.
15. In GitHub, add another repository secret (as in step 8) named `CLOUDFLARE_API_TOKEN`, paste the token as the value, and click **Add secret**.

### C. The TMDB token, for the Worker

16. Sign in at <https://www.themoviedb.org>, open **Settings → API**, and find **API Read Access Token** (the long one, not the short API Key). Click to copy it.
17. In a terminal in the movie-nite folder, run `npx wrangler login`. A browser opens: click **Allow**.
18. Run `npx wrangler secret put TMDB_TOKEN --config worker/wrangler.toml`.
19. When Wrangler asks for the value, paste the TMDB token and press Enter. If it offers to create the Worker `movie-nite`, answer `y`.

### D. For running locally

20. Create the file `worker/.dev.vars` (git ignores it) with one line: `TMDB_TOKEN=<the same token>`.

## Running locally

Run `npm run dev:worker` in one terminal and `npm run dev` in another. The app finds the Worker at port 8787 on the page's own host.

For a phone, run `npm run dev:lan` instead, and allow Node through Windows Firewall for port 8787 as well as the dev server's port. The phone then reaches the Worker at the same LAN address as the page.

## Changing the token later

Run the command from step 18 again and paste the new token. Nothing needs redeploying.

## Checking the Letterboxd probe

After the first deploy, run (replacing `<subdomain>`):

```bash
curl -H "Origin: https://d-mayo.github.io" https://movie-nite.<subdomain>.workers.dev/lb/probe
```

It answers `{"ok":true,"status":200,"challenged":false}` when Letterboxd lets Cloudflare through. `"challenged":true` means it served a bot check.

## Deploys

CI deploys the Worker on every push to `main`, before the site, using the two GitHub secrets from section B.
