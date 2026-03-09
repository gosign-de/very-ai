# very-ai

**Enterprise AI Portal** -- Self-hosted, model-agnostic, SSO-ready.

Chat, Assistants, Agents. One interface for your entire organization.

![very-ai Chat Interface](docs/images/screenshot-chat.png)

[![License: Apache 2.0](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](LICENSE)
[![Docker](https://img.shields.io/badge/Docker-Ready-2496ED?logo=docker&logoColor=white)](#quick-start)
[![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?logo=typescript&logoColor=white)](#tech-stack)

---

## Why very-ai?

Your employees are using ChatGPT with company data right now. You have no audit trail, no access control, no visibility into what's being shared.

very-ai gives them a better tool -- under your control.

### Enterprise Features

| Feature | Description |
|---------|-------------|
| **Azure Entra ID SSO** | Native SSO with automatic group sync and permission sync. Your existing Entra ID groups map directly to very-ai roles and assistant access. |
| **Multi-model routing** | Claude, GPT, Gemini, Llama, DeepSeek, gpt-oss -- one interface, any model. Gemini Vertex AI supported via service account for enterprise deployments. |
| **Group assistants** | Departments create specialized assistants and share them across teams. Access controlled by Entra ID groups -- no manual permission management. |
| **PII controls & re-anonymization** | Per-assistant and per-model PII detection. Anonymize personal data before it reaches the LLM, then re-insert originals into the response. Full GDPR compliance at the architecture level -- not just a warning banner. |
| **n8n workflow trigger** | Trigger n8n workflows directly from the chat. Agents process documents, start automations, and return results -- all within the conversation. |
| **Thinking level support** | Control reasoning depth per model. Use extended thinking for complex analysis, fast mode for simple queries. |
| **Search integration** | Built-in web search and Google Maps search. Agents can research, locate, and verify -- not just generate text. |
| **GDPR-compliant statistics** | Usage analytics without personal tracking. See which models, assistants, and agents are used -- without compromising employee privacy. |
| **Audit trail** | Every interaction logged -- prompt, response, model, timestamp, user role. Exportable for compliance and auditors. |
| **Deploy anywhere** | Docker, Kubernetes, or Supabase/Vercel. Your infrastructure, your rules. |

---

## Quick Start

```bash
git clone https://github.com/gosign-de/very-ai.git
cd very-ai
cp .env.example .env.local
docker compose up
```

Open [http://localhost:3000](http://localhost:3000)

That's it. No external dependencies, no API keys required for the first run (uses mock LLM for demo).

---

## Screenshots

| Chat Interface | Assistant Builder | Admin Panel |
|---|---|---|
| ![Chat](docs/images/screenshot-chat.png) | ![Assistants](docs/images/screenshot-assistants.png) | ![Admin](docs/images/screenshot-admin.png) |

---

## Architecture

```
+---------------------------------------------------------+
|  Frontend (React / Next.js)                             |
|  Chat UI - Assistant Builder - Admin Dashboard          |
+---------------------------------------------------------+
|  API Layer (Node.js / TypeScript)                       |
|  Auth - Routing - Rate Limiting - Audit Logging         |
+---------------------------------------------------------+
|  Model Router                                           |
|  Claude - GPT - Gemini (Vertex AI) - Ollama - Any       |
|  OpenAI-compatible API                                  |
+---------------------------------------------------------+
|  Integration Layer                                      |
|  n8n Workflows - Web Search - Maps - PII Engine         |
+---------------------------------------------------------+
|  Storage                                                |
|  PostgreSQL - Supabase - S3-compatible                  |
+---------------------------------------------------------+
```

## Configuration

All configuration via environment variables. See [`.env.example`](.env.example) for the full list.

Key variables:

```bash
# LLM Providers (add as many as you need)
OPENAI_API_KEY=sk-...                  # OpenAI / GPT
ANTHROPIC_API_KEY=sk-ant-...           # Anthropic / Claude
GOOGLE_GEMINI_API_KEY=...              # Google / Gemini
VERTEX_AI_GEMINI_PROJECT_ID=...        # Gemini via Vertex AI (service account)
VERTEX_AI_GEMINI_LOCATION=europe-west1
NEXT_PUBLIC_OLLAMA_URL=http://...      # Local models via Ollama

# Authentication
AUTH_AZURE_AD_TENANT_ID=...            # Azure Entra ID SSO
AUTH_AZURE_AD_ID=...
AUTH_AZURE_AD_SECRET=...
NEXT_LOGIN_PASSWORD=...                # Bridge password for Entra -> Supabase

# PII Detection
AZURE_PII_ENDPOINT=...                 # Azure Text Analytics
AZURE_PII_API_KEY=...

# Integrations
N8N_CALLBACK_URL=http://...            # n8n instance for workflow triggers
GOOGLE_SEARCH_API_KEY=...              # Web search
MAPS_API_KEY=...                       # Google Maps integration
```

## Comparison

How very-ai compares to other open-source AI interfaces:

| | very-ai | LobeChat | OpenWebUI | LibreChat |
|---|:---:|:---:|:---:|:---:|
| Azure Entra ID SSO + group sync | Yes | No | Partial | Partial |
| Group assistants (shared, access-controlled) | Yes | No | No | No |
| PII controls per assistant & model | Yes | No | No | No |
| PII re-anonymization (anonymize -> LLM -> re-insert) | Yes | No | No | No |
| n8n workflow trigger | Yes | No | No | No |
| Thinking level support | Yes | No | No | No |
| Web search + Maps | Yes | Plugins | Yes | Limited |
| Gemini Vertex AI (service account) | Yes | No | No | No |
| GDPR-compliant statistics | Yes | No | No | No |
| Audit trail (exportable) | Yes | No | Yes | Limited |
| License | Apache 2.0 | Apache 2.0 | MIT | MIT |

For a detailed comparison with enterprise context, see the [Enterprise AI Infrastructure Blueprint 2026](https://gosign.de/de/magazin/enterprise-ki-chat-interface/).

## Tech Stack

- **Frontend:** React, Next.js, Tailwind CSS
- **Backend:** Node.js, TypeScript
- **Database:** PostgreSQL (with pgvector for embeddings)
- **Auth:** NextAuth.js (Azure Entra ID, OAuth) + Supabase GoTrue (email/password)
- **Deployment:** Docker, Docker Compose, Kubernetes-ready

## Contributing

We welcome contributions. See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

1. Fork the repo
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'feat: add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

Please read our [Code of Conduct](CODE_OF_CONDUCT.md) before contributing.

## Security

If you discover a security vulnerability, please report it responsibly. See [SECURITY.md](SECURITY.md) for details.

**Do not open public issues for security vulnerabilities.**

## About

very-ai is built and maintained by [Gosign GmbH](https://gosign.de), Hamburg, Germany.

Originally based on [chatbot-ui](https://github.com/mckaywrigley/chatbot-ui) by McKay Wrigley (MIT). Evolved into an enterprise platform with SSO, group sync, PII re-anonymization, n8n integration, GDPR-compliant statistics, and agent capabilities.

25 years of enterprise software engineering. Over 5,000 projects for Airbus, Volkswagen, Shell, Lufthansa, and others. AI infrastructure since 2024.

**Need enterprise support?** Decision Layer integration, custom AI agents, SAP/DATEV connectors, governance frameworks, works council readiness.

> [Book a call](https://calendar.app.google/NNdvuaxJhZyAMsWHA) | [gosign.de](https://gosign.de) | [very-ai.eu](https://very-ai.eu)

## License

[Apache License 2.0](LICENSE) -- use it, modify it, deploy it. No restrictions.

Based on [chatbot-ui](https://github.com/mckaywrigley/chatbot-ui) (MIT). See [NOTICES](NOTICES) for third-party attributions.

```
Copyright 2024-2026 Gosign GmbH
```
