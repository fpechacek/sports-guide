# Sports Guide

A personal sports TV guide for Frank Pechacek in Merritt Island, Florida. Kickoff times are Eastern. Search by team, league, competition, channel, or streaming service, and filter to your teams.

The site is a static page. The daily refresh is a Node script. Nothing in the refresh calls an AI model, so keeping it running does not add an LLM bill.

Your teams, set in `config/favorites.json`:

- Iowa Hawkeyes football
- Georgia Bulldogs football
- Tottenham Hotspur (men)
- Pittsburgh Steelers
- Florida Panthers (NHL)
- Denver Nuggets

## Run it on your computer

You need Node.js 22 or newer.

```bash
npm install
npm test
npm run fetch
npm run dev
```

Open [http://127.0.0.1:4731](http://127.0.0.1:4731).

`npm run fetch` rewrites `public/schedule.json` from ESPN. It also accepts:

```bash
node scripts/fetch-schedule.mjs --days 14 --out public/schedule.json
```

`--days` is how many dates to include, starting today in Eastern time. The default is 14. The allowed range is 1 to 21.

`npm test` checks Eastern-time conversion and that favorites do not attach to the wrong club (Iowa basketball, Georgia Tech, the Carolina Panthers, Tottenham Women).

`npm run build` writes the static site to `dist/`.

## Favorites

Edit `config/favorites.json`, then run `npm run fetch` again. A team is a favorite only when the sport matches and, if `leagues` is not empty, the league matches, and either the ESPN team id or the exact team name matches.

Leave `leagues` empty to follow that team id across competitions in the same sport. Tottenham is set up that way, so a Champions League night counts and the women's team (a different ESPN id) does not.

Find an id:

```text
https://site.api.espn.com/apis/common/v3/search?query=Team%20Name
```

Use the `id`, `sport`, and `league` from the team result. Iowa football and Iowa basketball share an id, which is why Iowa's `leagues` is only `college-football`.

## Must Watch

`config/must-watch.json` decides which games are pinned, on top of your favorites. It is plain rules: ranked college games, top 10, rivalries, bowls, conference titles, NFL primetime, NBA and NHL national TV, Premier League big-six matches, and Champions League knockouts. Change the file and run `npm run fetch`.

On the phone, every game has a checkbox. Checking adds it. Unchecking hides it, including a game the rules added. Those choices stay in the browser and follow the ESPN event id when the morning file is replaced. Games from past dates are dropped.

A kickoff ESPN still lists as TBD shows as **TBD**, not midnight. Favorite games stay in Must Watch even when no channel is posted yet.

## Add a league

Copy an object in `config/leagues.json`. `sport` and `slug` are the two pieces of ESPN's scoreboard path:

```text
https://site.api.espn.com/apis/site/v2/sports/{sport}/{slug}/scoreboard
```

`label` is the short tag on each card. `competition` is the longer name stored in the JSON. Set `"enabled": false` to skip a league without deleting it. `"mode": "fight-card"` collapses an event to one row (used for UFC).

Channel abbreviations such as `USA Net` are renamed in `config/channel-names.json`.

## Where the listings come from

One source: ESPN's public scoreboard JSON. No API key.

```text
https://site.api.espn.com/apis/site/v2/sports/{sport}/{slug}/scoreboard?dates=YYYYMMDD&limit=1000
```

The script requests each league for each day in the window, keeps US TV and streaming from `geoBroadcasts`, and writes one file. Radio is dropped. A national listing is stored ahead of a local one.

Leagues included: NFL, college football, NBA, WNBA, men's and women's college basketball, NHL, MLB, Premier League, Champions League, Europa League, Conference League, FA Cup, EFL Cup, La Liga, Bundesliga, Serie A, Ligue 1, MLS, NWSL, Liga MX, and UFC.

### Gaps

- ESPN often posts channels for the current matchweek only. A game later in the window can be real and still say "Channel not announced". Your teams stay visible when that happens. The morning refresh picks the channel up once ESPN lists it.
- A TV channel is not copied into a streaming service. Peacock, ESPN+, Paramount+, and the rest appear only when ESPN lists them. A Premier League game on USA Network is not automatically marked as Peacock. Peacock-only games do show up when ESPN lists Peacock.
- Local and regional feeds are kept and labeled `local` in the page. The card shows national listings first and tucks a long local list behind a "+N local" chip. The JSON still has every US feed.
- If ESPN has no US feed, non-US feeds are kept and tagged with their region. Otherwise they are dropped.
- Blackouts and "also in the team app" are only as complete as ESPN's list.
- WNBA and MLB are included. In November they usually have no games. An empty league is not an error.
- Placeholder `TBD at TBD` games are dropped. A UFC event is one row for the card, not every bout.
- Rankings are ESPN's `curatedRank` when it is a real rank. The value 99 means unranked and is omitted.
- This is an unofficial public endpoint. If ESPN changes the shape, `npm test` still passes and `npm run fetch` is what will fail. The script keeps the previous `schedule.json` when a run comes back with zero games.

## JSON for Home Assistant

The page and the file are the same data. After you deploy, the stable URL is:

```text
https://YOUR_USER.github.io/sports-guide/schedule.json
```

`schemaVersion` is `1`. An email or the InfoBox can read `events` without another request. Each event already has Eastern date and time, sport, league, competition, stage (such as `Week 12` or `League phase`), teams (name, rank, record, score, favorite), channels, streaming services, and a `favorite` flag.

`headline` is one line, ready to paste into a message:

```text
Sun, Nov 22 · 1:00 PM ET · Pittsburgh Steelers at Philadelphia Eagles · NFL · Week 11 · CBS
```

Group by `date`, or keep rows where `favorite` is true. This repo does not change ha-infobox.

Team `logo` values are ESPN image URLs, included so a later email can use them. The page itself uses abbreviations, so a logo outage does not break the guide.

## Put it on the internet, for free

Use **GitHub Pages** for the site and **GitHub Actions** for the 4:30 AM Eastern refresh.

That split is deliberate. Cloudflare's free Workers plan allows 50 calls to other sites and 10 milliseconds of CPU per run. A refresh calls ESPN a few hundred times and parses large scoreboards, so the free Worker plan will stop it. GitHub Actions runs normal Node with no such cap. A refresh takes about a minute. A free GitHub account includes enough Actions minutes for a daily job, including on a private repository.

Netlify's free plan is a poor fit for a daily script of this size. The site can stay a plain folder of files, which is what GitHub Pages serves.

This project can keep living in Cursor. GitHub is a second remote you add yourself. The steps below are the part that needs your GitHub login. Nothing here creates an account or deploys for you.

The published site is public even if the GitHub repository is private. There is no password on it.

### Checklist

1. Create a free GitHub account if you don't have one.
2. Create a new repository named `sports-guide`. Public or private both work. Do not add a README, a gitignore, or a license. This project already has them.
3. Leave the default branch as `main`. The workflows are written for `main`.
4. In this project, add GitHub as a second remote. Leave the existing `origin` remote as it is.

   ```bash
   git remote add github https://github.com/YOUR_USER/sports-guide.git
   git push -u github main
   ```

   SSH works too: `git@github.com:YOUR_USER/sports-guide.git`

5. On GitHub, open the repository, then **Settings → Pages → Build and deployment**, and set **Source** to **GitHub Actions**.
6. Open the **Actions** tab. If GitHub asks you to enable Actions for the repository, enable them.
7. If **Deploy site** did not start from the push, open that workflow and use **Run workflow**.
8. When the job is green, **Settings → Pages** shows the site address. For this repository name it is `https://YOUR_USER.github.io/sports-guide/`.
9. The file for Home Assistant is `https://YOUR_USER.github.io/sports-guide/schedule.json`.
10. **Refresh schedule** runs on its own at 8:30 and 9:30 UTC. One of those is 4:30 AM Eastern all year. In winter the other run is 3:30 AM. In summer it is 5:30 AM. You can also start it by hand from the Actions tab with **Run workflow**. GitHub sometimes starts a scheduled job late, which is why there are two. A run with new listings commits `public/schedule.json` as `github-actions[bot]`, and that commit publishes the site.
11. On your phone, open the site in Chrome or Samsung Internet. Use the browser menu and tap **Add to Home screen** or **Install app**. The page has an **Add to home** button with the same steps. It then opens full screen, and the last schedule remains available for a short time offline.

After that, a normal morning is: open the icon, see your teams, scroll the day.

### When you change favorites or code

Edit the config or the page, commit, and `git push github main`. The deploy workflow rebuilds the site. Run **Refresh schedule** once if you changed favorites or leagues and want today's file rebuilt immediately. The next morning run will do it otherwise.

The Actions build sets the site's base path from the repository name. `sports-guide` is served from `/sports-guide/`. A repository named `YOUR_USER.github.io` would be served from `/`. Renaming the repository means pushing again so the workflow rebuilds with the new path.

## Not in this version

A daily email, Beth's picture cards, and a password gate. The schedule file is shaped so an email can be rendered from `headline` and `favorite` later, without another data source.
