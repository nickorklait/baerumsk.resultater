# Bærum SK Fotball – resultater for Bærum Sportsklubb

A copy of the Haslum project (`fotball-resultater`) for Bærum SK (club 89 on fotball.no). Only
`config/club.json`, `src/cli/brand.tsx` (profile texts) and the workflow names differ. Fixes are made in the
Haslum project and copied here with `npm run synk-fotball` in `oppsett`.

---

# Haslum IL – automatiske SoMe-innlegg (POC)

Proof of concept: every week, collect Haslum IL's football results and upcoming matches from fotball.no and turn them into ready-to-post graphics (feed 1080×1350 and story 1080×1920) in the club's colours, with sponsor logos and a short Norwegian caption. A volunteer opens the gallery on a phone, copies the caption, saves the image and posts. Nothing is auto-posted.

## Quick start

Requires Node.js 22+ (developed on Node 24, Windows). Copy `.env.example` to `.env` for optional keys.

```powershell
npm install
npm run fetch                              # poll the feeds (rate-limited, cached)
npm run generate -- --week 2026-10-18      # build all posts for that weekend
npm run serve                              # gallery on http://localhost:8080
```

Without `--week`, `generate` picks the most recent weekend that has results. Add `--offline` to skip the feed check.

| Command | What it does |
|---|---|
| `npm run fetch` | Fetches the club feed and configured league feeds, unless the last snapshot is younger than 4 hours. `-- --force` overrides. |
| `npm run generate` | Renders all posts for a week into `output/<sunday>/`, writes captions, a zip and the gallery pages. |
| `npm run serve` | Serves `output/` on all interfaces (port 8080, `-- --port 9000` to change). |
| `npm run publish` | Publishes due posts to Instagram (dry run unless `publish.enabled`). `-- --dry-run`, `--now`, `--only <key>`. |
| `npm run autopilot` | fetch → generate → publish; this is what the scheduled task runs. |
| `npm test` | Parser, table calculation, caption fact-check and week logic tests. |
| `npm run typecheck` | TypeScript check. |

## Posts generated per week

1. **Helgens resultater**: one club summary (all 13+ and senior teams; a carousel if more than 6 results), plus **one post per team**.
2. **Ukens kamper**: the 7 days after the results window, grouped by day (carousel when long).
3. **Kampdag**: for the teams in `posts.matchDayTeams` (Haslum Menn 1; there is no senior women's team).
4. **Tabell**: for each league in `data.tournamentIds`. See "League tables" below.

Every image has the main sponsor, the relevant team sponsors and the match sponsor of the week in the sponsor bar. The story format keeps the top 200 px and bottom 190 px free of Instagram's UI.

## Open the gallery on your phone (Windows, same Wi-Fi)

1. Run `npm run serve`. It prints a line like `On your phone: http://192.168.10.166:8080/`.
2. Open that address in the phone's browser (the phone must be on the same Wi-Fi as the PC).
3. In the gallery: switch **Innlegg/Story**, tap **Kopier tekst**, then press and hold the image and choose **Arkiver bilde / Legg til i Bilder** (iPhone) or **Last ned bilde** (Android). **Last ned alle (.zip)** downloads everything including `tekster.txt`.

If the phone cannot connect:

- The Wi-Fi must be a **Private** network: Settings → Network & internet → Wi-Fi → (your network) → Network profile type: Private.
- The first time Node listens, Windows asks whether to allow it. Tick **Private networks**. If you missed it, run this in an **administrator** PowerShell:
  ```powershell
  New-NetFirewallRule -DisplayName "Haslum POC 8080" -Direction Inbound -LocalPort 8080 -Protocol TCP -Action Allow -Profile Private
  ```
- Company laptops may block inbound connections by policy. Then use a home PC, or share the PC's mobile hotspot.
- Guest Wi-Fi networks often isolate devices from each other.

## Automatic polling (important)

The fotball.no **club feed only contains matches from about 48 hours back**. A result that is not captured within ~2 days is gone. So `npm run fetch` must run a few times a day; every snapshot is kept in `data/snapshots/` and merged. Never delete that folder, and keep it in git.

A Windows scheduled task runs `scripts/fetch.cmd` at 08:00, 14:00 and 20:00 (the PC must be on and logged in). It logs to `data/fetch.log`.

```powershell
# create (already done on the demo PC)
schtasks /Create /TN "Haslum SoMe - hent kamper" /TR "C:\path\to\haslum-poc\scripts\fetch.cmd" /SC DAILY /ST 08:00 /RI 360 /DU 13:00 /F
# run now / remove
schtasks /Run /TN "Haslum SoMe - hent kamper"
schtasks /Delete /TN "Haslum SoMe - hent kamper" /F
```

## Data source and its limits

All access goes through the `MatchDataAdapter` interface (`src/data/adapter.ts`). Switch implementation with `data.adapter` in `config/club.json`:

- `calendarFeed` (now): the official iCal feeds that fotball.no publishes for calendar apps. A clear User-Agent, at most one fetch per 4 hours per feed, everything cached. No HTML scraping and no Excel exports.
- `fotballdata` (later): a placeholder for licensed NFF/Fotballdata data. It throws until implemented.

What the feeds contain (checked on 20 Oct 2026):

| Feed | URL | Content |
|---|---|---|
| Club | `GetCalendarForClub?clubId=92` | All Haslum matches from ~48 h ago and forward. Played matches have the score in `SUMMARY` (`Home - Away 2 - 9`), upcoming ones end with ` -`. No match ids. Date parameters are ignored. |
| League | `GetCalendar?tournamentId=205342` | The whole season with match ids (`URL`), but **no scores at all**. |
| Team | `GetCalendar?teamId=…` | Not used; it needs team ids that the club feed does not expose. |

Parsing notes: home/away are taken from the `DESCRIPTION` line (`KFUM G13-2 - Haslum G13-2`) and only the score from `SUMMARY`, because names can end in numbers (`Frisk Asker G9 2 3 - 1`). Whitespace is normalised (`Holmlia  G15-1`). Feed UIDs change on every request, so matches are keyed by date + home + away.

Results are published by NFF only for age 13+ and senior teams. Children's teams (6–12) are left out of results. `posts.includeChildrenInFixtures` adds them to the fixture list.

### League tables

`src/posts/table.ts` calculates tables (3/1/0 points, then goal difference, then goals scored) and labels them "Beregnet tabell". A table post is only real when **every** played match in the league has a known score. The league feed has no scores, and the club feed only has Haslum's own matches, so for now the table post is rendered with made-up scores and stamped **EKSEMPEL – ikke publiser**. With the Fotballdata adapter, the same code produces real tables.

## Look and configuration

- `config/club.json`: club, hashtags, colours, data adapter, results window (default Friday–Monday), match-day teams.
- Colours are extracted from the logo (`#02793c` green, `#d3342f` red). Set `colors.primary/secondary/accent` to override.
- Opponents have no logos in the feed. They get a neutral badge with initials.
- Sponsors: `sponsors.file` in `config/club.json` picks the sponsor file.
  - `config/sponsors.haslum.json` (default): the **real sponsors** listed on [haslumil.no/sponsorer](https://www.haslumil.no/sponsorer) (read 20 Oct 2026). Riis Bilglass Sandvika is named there as sponsor of Haslum Fotball and is shown on every post. The other eight appear only as logos on that page; their names were inferred from the logo links, and no levels are stated. They rotate, three per post. Real sponsors are shown as plain-text names. To use real logos, put files supplied by the club in `assets/sponsors/` and set `logoFile`. `approvedForPublishing` stays `false` (the gallery then shows a "not cleared with the club" notice) until the club has confirmed which sponsors and logos may be used publicly.
  - `config/sponsors.demo.json`: four fictional sponsors with generated DEMO logos (main, two team sponsors, match sponsor of the week).
- Fonts are bundled in `assets/fonts` (Barlow Condensed ExtraBold, Inter; SIL Open Font License).

## Captions

- Without an API key: template captions in Norwegian (`src/captions/templates.ts`).
- With `ANTHROPIC_API_KEY` set: one Claude API request per week (`claude-opus-5-5`, structured JSON output, server-side fallback on refusal) writes all captions.
  ```powershell
  $env:ANTHROPIC_API_KEY = "sk-ant-..."; npm run generate
  ```
- **Fact-check** (`src/captions/factCheck.ts`): every score, team designation and club name in a caption must come from that post's data, and any unknown capitalised name mid-sentence is rejected (this also stops player names). A rejected Claude caption falls back to the template, and the gallery shows which one was used.
- No player names, ever: the prompt forbids them and the fact-check enforces it.

## Sponsor report

`output/sponsorer.html` (link in the gallery): the number of posts and images each sponsor appeared on, in total and per week. Example posts are not counted.

## Brand profile: club or neutral

`brand.profile` in `config/club.json`:

- `neutral` (current): an independent results account, "Bærum fotball · Resultater & kamper". It uses no club logo (our teams get a "HAS" badge in Haslum green), keeps Haslum's colours, puts "Resultater fra fotball.no · Uoffisiell side" on every image, uses neutral caption wording and the `brand.hashtags`. The sponsor bar shows **empty, highlighted slots** ("DIN SPONSOR HER") from `config/sponsors.placeholder.json`, to show where the club's sponsors would go. The sponsor report counts how many posts those slots appeared on.
- `club`: the club's own account, with the club logo, `club.hashtags` and the club's sponsors (`sponsors.haslum.json` once approved).

Switching later is a config change: set `profile` to `club`, point `sponsors.file` at the approved sponsor file, and rename the Instagram account (followers are kept).

## Publishing to Instagram

`npm run publish` posts whatever is due, according to this plan (`src/publish/plan.ts`):

| What | Feed | Story | When (Oslo time) |
|---|---|---|---|
| **Every result** (13+ and senior) | single image | single | as soon as the result is in the data (first run after it appears); not after 72 h. Only results from `perResult.since` |
| Weekend recap (Fri–Sun) | club summary | summary | Monday 10:00 |
| The coming week's matches (Mon–Sun) | carousel | each image | Monday 12:00 |
| Match day | single image | single | match day, 08:00 (never after kick-off) |
| Table | single image | – | with the fixtures, **only if it is a real table** |

Safeguards:
- Nothing is sent unless `publish.enabled` is `true`. Without it, the command is a dry run that still converts the images to JPEG.
- Example (demo) posts are never published.
- Fictional or not-yet-approved real sponsors block publishing.
- Every publication is logged in `data/published.json`, so nothing is posted twice.
- Publications expire: results after 3 days, match-day posters at kick-off. Switching on late never floods the account with old posts.
- At most 12 publications per run (Instagram allows 100 per 24 h); anything left goes out at the next run.

### One-time setup

1. **Instagram account.** Create it in the app (e.g. `@baerumfotball.resultater`, name "Bærum fotball – resultater"). Switch it to a **professional account** (Settings → Account type and tools → Switch to professional account → Creator or Business, category Sports). Only professional accounts can publish through the API, and they are always public. Bio: "Uoffisiell side. Resultater fra fotball.no. Drevet av …".
2. **Meta developer app.** At [developers.facebook.com](https://developers.facebook.com/apps): create an app with the Instagram use case ("Instagram API with Instagram Login"). Under *API setup with Instagram login*, add the Instagram account (accept the tester invite in Instagram if asked) and **generate an access token**. It has the permissions `instagram_business_basic` and `instagram_business_content_publish`. Copy the token and the Instagram user ID shown next to it. Publishing to your own account works without App Review.
3. **Credentials.** Copy `.env.example` to `.env` and fill in `INSTAGRAM_USER_ID` and `INSTAGRAM_ACCESS_TOKEN`. The token lasts 60 days; `publish` refreshes it weekly and keeps the new one in `data/instagram-token.json` (git-ignored). If you paste a new token into `.env`, it takes over.
4. **Image hosting.** Instagram downloads images from a public URL. By default `publish` opens a temporary [Cloudflare quick tunnel](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/do-more-with-tunnels/trycloudflare/) that serves only the JPEGs being published, and closes it afterwards. Install it once with `winget install --id Cloudflare.cloudflared`. Alternatively, set `publish.imageBaseUrl` to a web host that serves `output/`.
5. **Test.** Run `npm run publish -- --dry-run --now` to see everything that would be posted. Then set `"enabled": true` and run `npm run publish -- --only resultater-feed --now` to post one publication by hand.

### "Publiser nå" button

With `publish.enabled: true`, every planned item in the gallery's **Publiseringsplan** has a **Publiser nå** button that publishes it immediately, ignoring the schedule. Since anyone on the Wi-Fi can open the gallery, the button asks for a 6-digit PIN. `npm run serve` prints the PIN in the terminal when it starts, and it changes on every restart. The phone remembers it. Only one publish runs at a time, and anything already published cannot be published again.

### Autopilot

The scheduled task runs every 3 hours from 08:00 to 23:00 (`npm run autopilot`): fetch (at most every 2.5 h) → generate the latest and the previous week (so a result registered late still gets its post) → publish what is due. The output is logged to `data/autopilot.log`. With `publish.enabled: false` it only keeps the gallery fresh. The PC must be on; moving the job to a small cloud server is the next step for real use.

## Project layout

```
config/            club.json, sponsors.json
data/snapshots/    every fetched feed (the result history; keep it!)
src/data/          iCal parser, match model, team names, adapters
src/posts/         week windows, results, table, post definitions
src/render/        Satori + resvg rendering, colours, components, templates
src/captions/      templates, Claude API, fact-check
src/gallery/       static gallery + sponsor report, zip writer
src/cli/           fetch, generate, serve
test/              node:test suites (+ a real feed fixture)
output/            generated posts and gallery (not in git)
```

## Running in the cloud for free (GitHub Actions)

`.github/workflows/autopilot.yml` runs the autopilot in GitHub Actions, so the PC does not need to be on. It is free: a private repo gets 2,000 Actions minutes a month, and this uses about 700.

- **Schedule:** every hour from 07:37 to 22:37 Oslo time (fotball.no is still fetched at most every 2.5 hours). GitHub starts scheduled runs late or skips some when busy, which is why it runs hourly.
- **State:** each run commits the new feed snapshots, `data/published.json` (prevents double posting) and the encrypted token (`data/instagram-token.enc`) back to the repo. Snapshots are only stored when the feed content changed.
- **Images:** cloudflared runs inside the job, exactly as locally.
- **Gallery:** each run uploads `output/` as the artifact **gallery** (kept 7 days). Download it from the run page.
- **Publish now from your phone:** in the GitHub app, open Actions → Autopilot → *Run workflow*. Leave the field empty for a normal run, or enter one key from the gallery's publishing plan (e.g. `2026-10-25/kamper-feed`).

### Setup

1. Create a **private** repository on github.com (empty, no README) and push this project to it.
2. Repository → Settings → Secrets and variables → Actions → *New repository secret*:
   - `INSTAGRAM_ACCESS_TOKEN`: the same value as in `.env`.
   - `TOKEN_ENCRYPTION_KEY`: the same value as in `.env`. It decrypts `data/instagram-token.enc`.
   - `ANTHROPIC_API_KEY` (optional): captions written by Claude.
3. Actions tab → enable workflows → Autopilot → *Run workflow* once to test.
4. **Switch off the local scheduled task**, otherwise both would publish:
   `schtasks /Change /TN "Haslum SoMe - hent kamper" /DISABLE`.
   After that, run `git pull` before using `npm run publish` locally.

## Dashboard

`output/index.html` is the club's dashboard. It is rebuilt on every run.

- **Status:** autopilot on/paused, last publish, last data fetch, days left on the Instagram token, and any errors.
- **Kommer** (upcoming): every planned post and story with time, image and caption. Buttons: **Publiser nå**, **Hopp over** / **Angre**, **Rediger tekst**.
- **Publisert:** the latest publications with links to Instagram.
- **Data:** results from the last 7 days and matches in the next 7 days.
- **Innstillinger** (settings): post per result on/off, stories on/off, children's teams in the fixtures, posting times, and which teams get match-day posters.
- **Aktivitetslogg:** who changed what.

Everything the club changes is stored in `config/controls.json` (pause, skipped posts, edited captions, settings, log) and applied on top of `config/club.json`.

- **Locally:** `npm run serve` serves the dashboard. Actions are applied immediately and need the PIN shown in the terminal. Publishing from the local dashboard is off unless you start it with `--allow-publish`, because the cloud keeps the real publish log.
- **In the cloud:** a click goes to the Cloudflare function (`cloud/functions/api/action.ts`), which checks the Cloudflare Access login and forwards the action to GitHub. The Autopilot workflow applies it, commits it and redeploys the dashboard after about 2–3 minutes.

### Cloudflare setup (free)

1. **Account:** sign up at [dash.cloudflare.com](https://dash.cloudflare.com/sign-up). The Account ID is shown under *Workers & Pages* in the right-hand column.
2. **API token:** My Profile → API Tokens → *Create Token* → *Create Custom Token*, with permission **Account → Cloudflare Pages → Edit**. Add two GitHub secrets: `CLOUDFLARE_API_TOKEN` (the token) and `CLOUDFLARE_ACCOUNT_ID`.
3. **First deploy:** run the Autopilot workflow on GitHub. It creates the Pages project `fotball-resultater` and deploys. The run log shows the address (normally `https://fotball-resultater.pages.dev`).
4. **Login (Cloudflare Access):** *Zero Trust* → choose a team name (e.g. `baerumfotball`) and the **Free** plan. Then Access → Applications → *Add an application* → *Self-hosted*. Domain: the Pages address. Policy: *Allow*, Include → *Emails*: the people who should have access. Log in with *One-time PIN* (a code by email). Save, then copy the **Application Audience (AUD) Tag**.
5. **GitHub token for the buttons:** github.com → Settings → Developer settings → *Fine-grained tokens* → *Generate new token*. Repository access: only `fotball-resultater`. Permissions: **Contents: Read and write**.
6. **Function settings:** Cloudflare → Workers & Pages → `fotball-resultater` → Settings → *Variables and Secrets* (Production):
   - `ACCESS_TEAM_DOMAIN` = `baerumfotball.cloudflareaccess.com`
   - `ACCESS_AUD` = the AUD tag
   - `GITHUB_REPO` = `nickorklait/fotball-resultater`
   - `GITHUB_TOKEN` (type *Secret*) = the token from step 5
7. **Activate:** run the workflow once more so the settings take effect. Then open the dashboard, enter your email, and log in with the code you receive.

Until step 6 is done, the buttons refuse every action ("ikke ferdig satt opp", not set up yet).

### Dashboard buttons (simplified)

You don't need to enter anything in Cloudflare for the buttons. Add two GitHub secrets, and the workflow copies them, together with the Access team domain and the repo name, to the Pages project on every deploy. This replaces steps 5–7 above.

- `ACCESS_AUD`: the Application Audience (AUD) tag of the Access application *fotball-resultater - Cloudflare Pages*.
- `DASHBOARD_GITHUB_TOKEN`: a fine-grained GitHub token for this repo only, with **Contents: Read and write**.

The Access team domain defaults to `fotball-resultater-pages.cloudflareaccess.com`. To override it, set the Actions variable `ACCESS_TEAM_DOMAIN`.

## Form and streaks

Each result post shows the team's last results as S/U/T chips (oldest first; the newest one has an outline) once a team has at least two known results. When there is a streak, a line is added below them: "Seier i de N siste kampene" (wins) or "Ubeseiret i de N siste kampene" (unbeaten). The wording is "the last N matches", which stays true even though our history only starts at the first stored snapshot. Losing streaks are never mentioned. The caption gets the same line.

## Instagram statistics

`npm run insights` runs after publishing in every autopilot run. It reads the follower count, plus reach, likes, comments, saves and shares per post (stories only within 24 hours, which is Instagram's limit), and stores them in `data/insights.json`. The dashboard shows followers (with the change over 7 days), reach and reactions for the last 7 days, and the most seen posts. The sponsor report adds reach per sponsor.

It needs the permission **instagram_business_manage_insights** on the token:

1. Meta App Dashboard → your app → *Use cases* → the Instagram use case → *Customize* / *Permissions*: add **instagram_business_manage_insights**.
2. Instagram → *API setup with Instagram login* → *Generate token* for the account again, and approve the new permission.
3. Put the new token in the GitHub secret `INSTAGRAM_ACCESS_TOKEN` and in `.env`. A new token replaces the stored one automatically.

Until then, the dashboard shows a note and every run continues normally.
