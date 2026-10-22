# 100MON

**A 100-question speed-reading quiz for Fire TV.**
Not really a trivia game — a speed-and-accuracy game that happens to use trivia.

- Each question types out one letter at a time. All four answers are visible from the start.
- The four D-pad directions map directly to the four answers. Pick with the D-pad, confirm with the center button.
- Every week, players worldwide race the same 100 questions (in a shuffled order). Weekly points build to a year-long championship.
- Questions are generated and checked on Amazon Bedrock. Rankings run on a serverless AWS backend.
- One codebase runs on both **Vega OS** and **Fire OS**.

## Repository layout

| Folder | What it is |
|---|---|
| `app/` | **Vega OS app** (React Native for Vega). Screens and game UI live here. |
| `fos/` | **Fire OS app** (`react-native-tvos`). Reuses `app/src`; only remote input and sound are Android-specific. |
| `core/` | Game engine: question flow, shuffling, timing, scoring, run validation. Plain TypeScript, no UI or OS dependency. |
| `backend/` | Ranking server: API Gateway (HTTP API) + Lambda + DynamoDB + EventBridge Scheduler, deployed with AWS SAM. |
| `pipeline/` | Question pipeline: generate → verify with two models from other vendors → fix → re-verify, all on Amazon Bedrock. |
| `data/` | Weekly question sets and period files produced by the pipeline. |
| `web/` | Browser prototype used to check readability on a TV. |
| `design.md`, `vega-port.md` | Design notes (Japanese). Each folder also has a detailed README in Japanese. |

## Quick start

Requirements: **macOS**, **Node.js 20+** (22 recommended).

### 1. Run the tests (any OS)

```sh
npm ci
npm test          # core engine + backend logic tests
```

### 2. Run the Vega OS app in the Vega Virtual Device

One-time setup (about 15 minutes):

```sh
# Prerequisites (Apple Silicon also installs Rosetta 2)
[[ $(arch) == "arm64" ]] && softwareupdate --install-rosetta --agree-to-license
brew update && brew install binutils coreutils gawk findutils grep jq lz4 gnu-sed watchman

# Vega SDK + Vega Virtual Device (close VS Code first; press Enter at each prompt)
curl -fsSL https://sdk-installer.vega.labcollab.net/get_vvm.sh | bash
source ~/vega/env
vega --version    # should print the SDK and CLI versions
```

Run the app (starts the simulator, builds, installs, and launches in one step):

```sh
cd app
npm install
npm run sim                 # first start of the simulator takes 1–3 minutes
npm run sim -- --no-build   # reinstall without rebuilding
npm run sim -- --clean      # rebuild from scratch
```

Use the remote control in the simulator window to play (keyboard arrow keys are not forwarded).
If the simulator stops responding: `vega virtual-device stop`, then `npm run sim` again.

### 3. Run the Fire OS app on a Fire TV device (optional)

Requirements: Android Studio (Android SDK in `~/Library/Android/sdk`), JDK 17 (`brew install openjdk@17`).

On the Fire TV: **Settings → My Fire TV → Developer Options → ADB Debugging → On**.
The device IP is under **About → Network**.

```sh
cd fos
npm install
TV=<your Fire TV IP> npm run tv    # build → connect → install → launch
```

### 4. Browser prototype (optional)

```sh
npm run dev       # http://localhost:5000
```

Arrow keys to choose, Enter or Space to confirm, Esc to quit. Add `?lang=en` for English.
This version uses placeholder questions and does not connect to the ranking server.

## Backend (optional — the apps already point at a deployed API)

Requires the AWS CLI and AWS SAM CLI with credentials for your own AWS account.

```sh
npm run backend:build                 # bundles the Lambda functions into backend/dist
cd backend && sam deploy              # stack and region come from samconfig.toml (us-east-2)
```

API reference, seeding questions, and smoke tests: [`backend/README.md`](backend/README.md) (Japanese).

## Question pipeline (optional)

Requires Python 3, `boto3`, and Amazon Bedrock model access in `us-east-2`.
AWS credentials are read from the standard environment variables (`AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_DEFAULT_REGION`). No keys are stored in this repository.

```sh
python3 pipeline/generate_period.py --period-id 2026-P01 \
  --starts 2026-10-19T00:00:00Z --ends 2026-10-26T00:00:00Z --quarter 1
```

See the header of `pipeline/generate_period.py` for all options (resume, dry run, exhibition sets).

Model IDs are set in `pipeline/config.py`. Every verdict is saved under `pipeline/reports/`.

## Security notes

- The apps hold no AWS keys or SDKs. They only call the public API with `fetch`.
- All timing, answer checking, and scoring are done on the server; the server replays each run from its seed.

## License

[MIT](LICENSE)
