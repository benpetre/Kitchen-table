# Kitchen Table

A family games app for iPhone: seven quick games, new every morning, one try each
per day, with a family leaderboard.

| Game | What it is |
| --- | --- |
| Long Shot | Five "name a ..." prompts. The less obvious your answer, the more it scores. |
| Hunch | Six guesses at a five-letter word. |
| Pocket Cross | A 5x5 crossword against the clock. |
| Common Ground | Sort sixteen tiles into four groups of four. |
| Word Trails | Trace themed words through a letter grid until every letter is used. |
| Outline | Name the country from its shape; each guess tells you how far and which way. |
| Brickfall | Falling bricks. The date decides the piece order, so everyone gets the same run. |

Every game is worth up to 100 points. Results and history are kept on the phone
(`AsyncStorage`); each finished game is also sent to the family board.

## Layout

- `App.tsx`, `src/` - the Expo (React Native) app. `src/logic` holds the rules and
  scoring for each game (covered by `__tests__`), `src/games` the screens.
- `supabase/functions/games-api` - the whole backend: the join / daily / submit /
  board / notes API, and the daily puzzle generator.
- `supabase/migrations` - the `games` schema and the daily cron job.
- `scripts/build-data.mjs` - rebuilds the bundled word list, the country outlines and
  the generator's word and country lists from SCOWL, Natural Earth and mledoze/countries.

`src/types.ts` is the contract with the function (`supabase/functions/games-api/types.ts`
is a copy). Change both together.

## How the daily puzzles are made

Once a day (a cron job at 09:00 UTC, or the first time someone opens the app) the
function asks Claude for that day's puzzles, steered by the notes on the app's Family
tab (who is playing, what you are watching, what is coming up) plus the date. Code,
not the model, builds the parts that must be exactly right: the crossword grid is
filled from a common-word list and the Word Trails board is packed so every letter is
used once.

The backend runs on the Supabase project `qenbkrxjsxbsetfeffza` (shared with Summit),
in its own `games` schema that only the function can reach. It needs the
`ANTHROPIC_API_KEY` secret, which that project already has. To redeploy after a change:

```bash
supabase functions deploy games-api --project-ref qenbkrxjsxbsetfeffza --no-verify-jwt
```

## Run it

```bash
npm install
npx expo start          # press i for the iOS simulator, w for a browser
npx tsc --noEmit && npx jest
node --experimental-strip-types supabase/functions/games-api/algo.test.ts
```

## Put it on the family's phones (one-time setup, on a Mac)

```bash
npx eas-cli init                                              # creates the EAS project; commit the app.json change
npx eas-cli build --platform ios --profile production --auto-submit
```

The first build is interactive: it registers the bundle id `com.benpetre.kitchentable`,
creates the provisioning profile and the App Store Connect app. Then in App Store
Connect add the family as TestFlight testers, and add an `EXPO_TOKEN` secret to this
repository. After that, pushes to `main` build and submit on their own
(`.github/workflows/testflight.yml`).

Each person opens the app, picks a name and avatar, and types the family code.
The code is shown on the Family tab of anyone already in.
