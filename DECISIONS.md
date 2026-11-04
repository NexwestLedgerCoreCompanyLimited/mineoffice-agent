# Decisions

Significant choices, why we made them, and what we turned down. Newest first.

## 2026-11-05 · App updates with electron-updater, and download links that never change

- **Decision:** the same library as NeledPort. Windows and the AppImage update themselves. macOS and .deb show that a new version exists and open the download page. Installer names carry no version, so `releases/latest/download/...` always works, and every release is marked Latest.
- **Why:** an unsigned Mac app cannot replace itself, and a .deb needs root. The main process is ES modules, so the library loads late inside `try`, and a problem with updates cannot stop the app from opening.
- **Turned down:** writing our own updater, because download checks and installer hand-off are easy to get wrong.

## 2026-11-05 · Business Source License 1.1, licensed by the company

- **Decision:** MineOffice uses BSL 1.1, held by NEXWEST LEDGER CORE COMPANY LIMITED. Anyone may use it, change it and earn money with it, but may not sell it. Each version becomes Apache-2.0 four years after release.
- **Why:** it protects the work from being resold while staying free to use, and it has a known, fixed path to a true open source license.
- **Turned down:** MIT, which would allow reselling. A custom license, which reads less clearly and has no path to open source.

## 2026-11-05 · The default OpenRouter model is `openrouter/free`

- **Decision:** the default lets OpenRouter pick a free model, and every service has a free-text model field.
- **Why:** on 2026-11-05 all five free models named in the app had been removed from OpenRouter, so a new user failed on the first goal. Single free models come and go, and any fixed list goes stale.
- **Turned down:** fetching the live list at startup, which adds a network dependency to a settings page.

## 2026-11-05 · Business staff prepare work, and you publish it

- **Decision:** admin, support, social media and content roles write drafts and files. The Graphic Designer draws SVG, and the Video Producer writes scripts and subtitles.
- **Why:** SVG goes through the same Git review as code, and nothing reaches customers without a person. Their prompts say what they cannot do, so they never claim to have posted.
- **Turned down:** built-in social media and image generation accounts, which add keys, cost and a way to post by mistake. An MCP tool can add them when someone wants them.

## 2026-11-05 · Calls to AI services use `fetch`, not each vendor's SDK

- **Decision:** one small provider file speaks to all five services over HTTP.
- **Why:** this keeps the headless package to four dependencies and the request for each service in one place, where a test can check it.
- **Turned down:** five SDKs for one kind of call.
