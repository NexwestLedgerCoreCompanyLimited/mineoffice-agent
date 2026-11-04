# Security Policy

MineOffice holds AI keys and server logins, runs AI-written changes through Git, and can open a status page to the network, so we take security reports seriously.

## Reporting a vulnerability

Please **do not open a public issue**. Use GitHub's private reporting instead:
**Security → Report a vulnerability** on this repository.

Include the affected version, your OS, and steps to reproduce. We aim to reply within 7 days.

## Scope

Issues we especially want to hear about:

- API keys or server passwords written to disk unencrypted, sent to an MCP server or shown in logs.
- AI output escaping the project folder, writing into `.git`, or running on your machine.
- The control port or the status page answering someone who should not reach it.
- A way around tool permissions or the review before merge.

## Supported versions

Only the latest release receives security fixes during early development.
