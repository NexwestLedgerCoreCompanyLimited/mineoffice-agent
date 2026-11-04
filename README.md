# MineOffice Agent

An AI team that works in your Minecraft world and in your code. Run it as a desktop app, as a headless Linux service, or as a tool another AI can control over MCP.

[![License: MineOffice Business License](https://img.shields.io/badge/License-MineOffice%20Business-amber.svg)](LICENSE)

> **Status: 0.1.0, early release.** See [What has been tested](#what-has-been-tested) before relying on it. It has not yet been run on a vanilla or Paper server or with a live AI provider.

## What it does

- **A whole software company.** 23 AI characters across product, design, engineering and quality can take a big goal from requirements to finished code, working in parallel.
- **You stay in charge of the result.** You approve the requirements and the design, and review the finished work once. Show the team images of what you like and it follows them.
- **Command Center.** Describe a goal in plain words, check how the Commander split it up, then start it.
- **Agents that think in a loop.** In-game agents look at their situation, take one step, read the result and decide again, so a failure changes the plan instead of ending it.
- **Outside tools.** Connect any MCP server and in-game agents can use its tools, with your approval.
- **Team memory.** Facts, places, notes and working routines are kept per server across restarts.
- **Real roles.** A Builder cannot attack and a Defender cannot mine. The limit is enforced, not just suggested.
- **Code review before merge.** The Coder writes on its own Git branch. You read the real diff, then merge it or send it back.
- **Fast reflexes.** A 20Hz loop handles falls, creepers and low health with no AI call.
- **Control from other AI tools.** Claude Code, Claude Desktop, Cursor and others can drive MineOffice over MCP.
- **A status page to share.** Anyone with the key can watch the team, and it cannot change anything.

## Install

**Headless, on any machine with Node.js 22 or newer:**

```bash
npx mineoffice-agent init
```

```bash
npx mineoffice-agent serve --host localhost:25565 --spawn --commander YourName
```

**Desktop app:** download the installer for Windows, macOS or Linux from the [Releases](../../releases) page. Builds are not code-signed yet, so Windows and macOS will warn you the first time.

**Docker:**

```bash
docker compose -f deploy/docker-compose.yml up -d
```

Copy `deploy/mineoffice.env.example` to `deploy/mineoffice.env` first.

**From source:**

```bash
npm install
```

```bash
npm run dev
```

An AI provider is required: OpenRouter (has free models), Google Gemini, Anthropic Claude, OpenAI, anything that speaks the OpenAI API (LM Studio, Groq and others), or Ollama on your own computer.

## The team

The roles follow how software teams are usually organized: product, design, engineering, and quality.

| Department | Who | Does |
| :--- | :--- | :--- |
| Command | Marlow, Commander | Plans goals and delegates. Never does the work itself |
| In the game | Wren, Builder | Places blocks, builds shelters, crafts |
| | Kit, Miner | Mines, farms, smelts, moves materials |
| | Rowan, Defender | Fights hostile mobs, never players |
| | Tove, Explorer | Scouts and reports what is nearby |
| Product | Sage, Product Manager | Requirements, priorities, what counts as done |
| | Ellis, Business Analyst | Research and recommendations |
| Design | Iris, UX Designer | How it works: journeys, screens, wording |
| | Fern, UI Designer | How it looks, following your images |
| Engineering | Ash, Software Architect | Technical structure |
| | Briar, Tech Lead | Reviews the team's code |
| | Juniper, Full-Stack Developer | Code that crosses areas |
| | Robin and Hollis, Frontend Developers | What people see and use |
| | Reed and Quinn, Backend Developers | Servers, APIs and logic |
| | Linden, Mobile Developer | iOS and Android |
| | Moss, Data Engineer | Databases and migrations |
| | Aspen, AI/ML Engineer | AI features |
| | Flint, DevOps Engineer | Builds, CI and deployment |
| Quality | Onyx, Security Engineer | Finds and fixes security problems |
| | Clover, QA Engineer | Test plans and automated tests |
| | Page, Technical Writer | README and guides |

You can change anyone's role or give them their own AI provider on the Team page. If that provider has no key, the agent uses the team's main one.

On a local server, office staff also join the world as characters and report in chat. They do no physical work there. You can turn this off under **Server → Behaviour**, and they never join public servers, because many extra bots can get accounts banned. With everyone joined, the whole team used about 320 MB on a small flat test world; a real world will use more.

## How the team builds a whole project

Choose **Whole project** in the Command Center and describe what you want. Add images of designs you like if you have them.

1. **Plan.** The Commander splits the goal into tasks and decides which depend on which. You see the plan before anything starts. Small goals get few tasks.
2. **You approve the direction.** Requirements and the UI design always stop and wait for you. Approve, or say what to change and it is redone.
3. **The team builds.** Each task starts as soon as what it needs is done, up to 4 AI calls at once, and each worker reads what teammates finished. Every change is read by the Tech Lead, who can send it back, and joins a shared branch away from your files. If two developers conflict, the later one redoes the work on top of the other's.
4. **You review once.** You see one diff of everything. Merge it, or say what to change and the team takes it as a new task.

A failed task is retried once, then waits for you with the reason. You can stop the team after its current tasks at any time.

**What to expect:**

- **Nobody runs the code.** This is deliberate, for safety. QA writes tests and the Tech Lead reads the code, but neither can run it, so build it and run the tests yourself after merging.
- **Quality depends on your AI model.** Each worker sees up to 12 files and can write about 8,000 tokens per task, so large programs need good planning and a capable model.
- **Every step costs AI usage.** A big project makes many AI calls.
- **Work is not kept across restarts.** Tasks in progress are lost if you close the app. Merged work is safe.
- **`serve` has nobody to ask.** Approvals pass by themselves there, and the final merge still needs the desktop app.

## Reading images

Add images to a goal with **Add images**, or paste them into the goal box. Up to 5 images, 5 MB each, in PNG, JPEG, WebP or GIF.

- The Commander and the roles that can use them, such as the UI Designer and frontend developers, see your images. Roles like backend developers do not, which saves AI usage.
- In-game crew see them too, so you can ask for a build like the one in a picture.
- Developers can open images already in your project, such as mockups.

Your AI model must be able to read images. Many free models cannot, and the task will fail with a message saying so. Choose one that can under AI Settings.

### Giving orders in game

Add player names under **Commanders** on the Server page. Only those players can give orders; chat from anyone else is ignored.

- `!mo build a small house` goes through the Commander, who delegates it.
- Whispering a bot gives that bot a direct order.

On servers without premium login, anyone can join under any name unless an auth plugin prevents it, so a commander's name can be impersonated there.

## How in-game agents work

Each task runs as a loop of up to 25 steps: see the current status and what has happened, choose one tool, read the result, repeat. The task only counts as done when the agent reports the goal was met.

The agent stops by itself if it repeats the same call three times, fails five steps in a row, or replies in a way that cannot be read three times. Every step works over plain text, so free models without native tool calling work too.

| Group | Skills |
| :--- | :--- |
| Gathering | `mine-block`, `collect-drops`, `harvest-crops` |
| Crafting | `craft-recipe`, `smelt-item` |
| Building | `place-block`, `build-shelter-wall`, `build-shelter` |
| Moving | `goto-position`, `follow-player`, `stop-moving` |
| Scouting | `scan-surroundings`, `find-block` |
| Combat | `defend-area` |
| Survival | `eat-food`, `equip-item`, `sleep-in-bed`, `flee-danger` |
| Storage | `chest-list`, `chest-store`, `chest-take`, `give-item` |
| System | `say-chat`, `report-status` |

Every agent also has `remember`, `remember_place`, `go_to_place`, `note_team`, `save_routine` and `run_routine`. A saved routine is a list of existing tool calls, never code, so it cannot give an agent powers its role does not have.

Agents never run JavaScript written by an AI. That would let one crafted prompt take over your computer.

## Giving agents outside tools (MCP client)

Add servers in **AI Settings → Outside tools**, or in `~/.mineoffice/settings.json` for headless use:

```json
{
  "mcpServers": {
    "memory": {
      "type": "local",
      "command": ["npx", "-y", "@modelcontextprotocol/server-memory"],
      "enabled": true,
      "permission": "ask"
    },
    "search": {
      "type": "remote",
      "url": "https://example.com/mcp",
      "headers": { "Authorization": "Bearer YOUR_TOKEN" },
      "enabled": true,
      "permission": "allow"
    }
  }
}
```

Agents see these tools as `mcp__<server>__<tool>`.

| Permission | What happens |
| :--- | :--- |
| `ask` | The agent waits while you see the tool and exactly what it will send. Allow once, allow for this task, or refuse |
| `allow` | Runs without asking |
| `deny` | Never runs |

Under `serve` nobody is at a screen to answer, so `ask` is treated as a refusal. Use `allow` for the tools you trust there.

## Letting another AI control MineOffice (MCP server)

Add this to your AI tool's MCP config:

```json
{
  "mcpServers": {
    "mineoffice": { "command": "npx", "args": ["-y", "mineoffice-agent", "mcp"] }
  }
}
```

If the desktop app or `serve` is already running on the same machine it drives that; otherwise it runs the engine itself. Add `--read-only` for an AI you only trust to look.

| Looks only | Acts |
| :--- | :--- |
| `mineoffice_get_state` | `mineoffice_plan_goal` |
| `mineoffice_get_logs` | `mineoffice_create_task` |
| `mineoffice_list_skills` | `mineoffice_execute_task` |
| `mineoffice_test_server` | `mineoffice_set_role` |
| | `mineoffice_connect_bots`, `mineoffice_disconnect_bots` |
| | `mineoffice_send_chat` |

## Connecting to Minecraft

| | Local server | Public server |
| :--- | :--- | :--- |
| **For** | Your own machine, LAN, your own port | Online servers on a public IP or domain |
| **Joining** | One bot per second | One bot every 6 seconds |
| **Chat** | Up to 4 messages per second per bot | One message per 1.5 seconds; shared chat from the first bot only |
| **Reconnect** | From 5s, up to 10 tries | From 15s, up to 5 tries |
| **Walking** | May dig through blocks | Never digs while pathfinding |

Each bot has its own account setting:

- **Offline**, for servers with `online-mode=false`. Any valid name works.
- **Microsoft**, for premium servers. The app shows a code to enter at Microsoft's sign-in page, and your password never passes through the app. Each bot needs its own account that owns Minecraft: Java Edition.

Use **post-join commands** for steps like `/login <password>` (AuthMe) or `/server survival` (networks).

**Check the rules first.** Many public servers ban bots, and using one can get the account banned. MineOffice paces itself so it does not spam a server, but it does not hide that it is a bot or bypass anti-bot systems.

## Where the AI writes code

Open **AI Settings → Project for code work**. The simplest choice is **Create a new project for me**, which makes a ready-to-use folder in `MineOfficeProjects` in your home folder.

To use a project you already have, choose its folder. Use a folder for one project, not your Desktop, Documents or MineOffice itself. If it does not use Git yet, the app offers to set that up, leaving secret files like `.env` out of the first commit.

If the project has `AGENTS.md`, `CLAUDE.md` or `MINEOFFICE.md`, the Coder follows the rules in it.

## Linux servers

Runs without a screen and without Electron. Needs about 520 MB of disk, because the Minecraft protocol data for every version comes with it.

Settings, Microsoft sign-in tokens, team memory and the audit log live in `~/.mineoffice` (change it with `MINEOFFICE_HOME`). Run `npx mineoffice-agent --help` for every option.

- **As a service:** `deploy/mineoffice.service` is a locked-down systemd unit. Its header lists the install steps.
- **With Docker:** `deploy/docker-compose.yml` runs a read-only container with no capabilities.

## Watching without hosting

A server owner can share a read-only status page, so anyone can see what the AI team is doing.

**Owner:** add `--viewer` to `serve`, or turn on sharing in the desktop app's Watch page, then open port 8787 in the firewall.

```bash
npx mineoffice-agent serve --host localhost:25565 --spawn --viewer
```

```bash
npx mineoffice-agent viewer-key
```

**Viewer**, any one of these:

- Open `http://SERVER_IP:8787` in a browser and enter the key.
- Use the Watch page in the desktop app.
- Run `MINEOFFICE_VIEWER_KEY=... npx mineoffice-agent watch SERVER_IP` in a terminal.

A plain Minecraft server has no idea an AI team exists, so the owner has to run MineOffice for this to work. If nothing answers on port 8787, Watch falls back to the normal Minecraft ping and shows the version and player count.

## Security

| Risk | What MineOffice does |
| :--- | :--- |
| Viewers controlling bots | The status page accepts only `GET` and has no route that can change anything. |
| Leaks through the status page | It is built from an allowlist. API keys, server addresses, account names, chat, logs and failure reasons are never included. Coordinates stay hidden unless `--viewer-coords` is set, because they reveal where bases are. |
| Key guessing and floods | A random key is required by default. 10 wrong keys lock an address out for 5 minutes, and each address is limited to 120 requests a minute. |
| Script injection from task titles | The page uses a strict Content-Security-Policy and only ever inserts text. The terminal viewer strips control codes. |
| Other machines or web pages reaching the control port | It listens on loopback only and needs a token from a file only you can read. Requests with an `Origin` or an unexpected `Host` are refused, which stops DNS rebinding. |
| A confused or hijacked AI | MCP tools cannot read settings or API keys, point bots at another server, approve merges, add skills, or run slash commands. Actions are limited to 30 a minute and recorded in `audit.log`. |
| Outside MCP servers | They ask by default. Your API keys are removed from the environment of programs it starts. They cannot ask to spend your AI credits. Redirects are refused, so a token set for one host cannot reach another. What a tool returns is marked as data for the agent, though no such marking is a guarantee against a model being fooled. |
| AI-written code | It lands on its own Git branch in a checkout outside your project, and reaches your project only when you approve the real diff. Nothing it writes is executed, and your repo's hooks stay off for its commit. It cannot write outside the project, into `.git`, through links, or to files it has not read. Files that run by themselves later, like `package.json`, are flagged for the reviewer. |
| Secrets in your repo | `.env` files, private keys and similar are never listed or sent to an AI provider, and an AI cannot write them. This goes by file name, so a secret in an ordinary file would still be sent. |
| Strangers ordering bots in game | Only listed commanders can give orders, with a cooldown and a cap on open tasks. An AI cannot use skills outside the role, run slash commands, or attack players. |
| Secrets on disk | The desktop app encrypts settings with the OS keychain. On a server the file is readable by its owner only, and keys from the environment are never written to it. `/login` commands are never logged. |
| Running with too much access | `serve` refuses to run as root. The systemd unit and Docker setup drop privileges. |

**Things to keep in mind:**

- Without HTTPS the viewer key travels unencrypted. On the open internet use `--tls-cert` and `--tls-key`, or a reverse proxy.
- A local MCP server is a program running on your computer with your permissions. Only add ones you trust.
- Task titles are visible to viewers, so do not put secrets in a goal.

## What has been tested

`npm test` runs these, unless a row says it was checked by hand. CI runs it on Linux and Windows.

| Tested | How |
| :--- | :--- |
| Agent loop, permissions, memory, routines | Scripted AI replies |
| The whole team: order, handing work on, approvals, Tech Lead review, conflicts, shared branch, final merge | Real Git and scripted AI replies, plus one walkthrough in the real app, by hand |
| Sending images to all five kinds of AI service | The exact requests were checked, using formats from secondary sources. No live service has answered yet |
| Everyone in one world at once | 23 real bots on flying-squid, Minecraft 1.21.4, checked by hand |
| MCP client, local and remote | Real child processes and a real HTTP server |
| Code tasks | Real Git, including hostile AI output |
| CLI, MCP server, status page, security rules | The built CLI, with stand-in Minecraft and AI servers |
| Joining, walking, mining, picking up, placing, building a wall, equipping, chat | A real bot on [flying-squid](https://github.com/PrismarineJS/flying-squid), on Minecraft 1.16.5 and 1.21.4 |
| Noticing, fleeing and hitting a zombie | The same, on 1.16.5 only |

| Not yet tested on a real server | |
| :--- | :--- |
| Crafting, furnaces, chests with items, beds, farming, eating when hungry | The test server does not implement them fully, so only stand-in bots have run these |
| Reflexes (water bucket, shield, totem) | Not exercised at all |
| Vanilla, Paper and large public servers | |
| Live AI providers | All AI replies so far were scripted, so how good a real project turns out is still unknown |
| Mac and Linux desktop builds | Set up in CI, not built yet |
| Microsoft sign-in, all the way through | |
| The native folder picker, Docker, systemd and HTTPS | |

If you try any of these, please report what happened in an issue.

## Languages

MineOffice starts in English, and also comes in Thai. Switch at the bottom of the sidebar. Work logs and some technical errors stay in English.

Other languages are welcome and need no coding. See [Translating](CONTRIBUTING.md#translating).

## Development

```bash
npm test
```

```bash
npm run dist:desktop
```

The first builds and runs every check. The second packages the desktop app for your operating system into `release/`.

| Folder | Holds |
| :--- | :--- |
| `src/main/core/agent` | The agent loop and team memory |
| `src/main/core/mcp` | MCP client, MCP server and its tools |
| `src/main/core/foreman` | The orchestrator: tasks, plans, decisions |
| `src/main/core/skills` | In-game skills |
| `src/main/core/bot`, `reflex` | Bot connections and the reflex loop |
| `src/main/core/git` | Worktrees, diffs and merging |
| `src/main/core/control`, `viewer` | Local control port and the public status page |
| `src/cli` | The headless command line |
| `src/renderer` | The desktop interface |
| `src/shared` | Types, roles and translations |
| `test` | Everything `npm test` runs |

## License

MineOffice uses the [MineOffice Business License](LICENSE). It is free to use, and it is not an open source license.

| You may | You may not |
| :--- | :--- |
| Use it to make money, such as on your own paid server | Sell it, or a changed version of it |
| Charge customers for your own services and for what you make with it | Rent it out, or charge mainly for access to it |
| Change anything, and add to it | Remove or change its name and copyright |
| Share it for free under the same license | Pass off a changed version under another name |

Read [LICENSE](LICENSE) for the exact terms. See [NOTICE.md](NOTICE.md) for the projects this one learned from and the art it includes.
