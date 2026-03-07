---
title: mnemonic — Docker and Ollama compose setup
tags:
  - docker
  - compose
  - ollama
  - deployment
createdAt: '2026-03-07T17:59:46.933Z'
updatedAt: '2026-03-07T18:37:14.203Z'
project: https-github-com-danielmarbach-mnemonic
projectName: mnemonic
relatedTo:
  - id: mnemonic-project-overview-and-purpose-763b7a51
    type: related-to
---
**`compose.yaml`** runs three services:

- `ollama` — `ollama/ollama` image with named volume `ollama-data` (models persist across restarts)
- `ollama-init` — `curlimages/curl` that POSTs to `http://ollama:11434/api/pull` to download `nomic-embed-text` with retry logic; exits after success
- `mnemonic` — built from `Dockerfile`; `depends_on: ollama-init: condition: service_completed_successfully`

**Vault:** bind-mounted from host (`${VAULT_PATH:-~/mnemonic-vault}:/vault`). Notes and git repo stay on the host machine.

**Git credentials:** `~/.gitconfig` and `~/.ssh` mounted read-only so push/pull work inside the container.

**`OLLAMA_URL`** is hardcoded to `http://ollama:11434` (the service name) — no host-gateway needed.

**MCP client config for Docker:**

```json
{
  "command": "docker",
  "args": ["compose", "-f", "/path/to/mnemonic/compose.yaml", "run", "--rm", "mnemonic"]
}
```

Ollama container must be running before MCP client invokes mnemonic: `docker compose up ollama -d`
