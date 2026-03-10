---
title: 'MCP stdio protocol: each JSON-RPC message must be one line'
tags:
  - mcp
  - stdio
  - protocol
  - debugging
  - json
lifecycle: permanent
createdAt: '2026-03-10T19:35:45.607Z'
updatedAt: '2026-03-10T19:35:45.607Z'
project: https-github-com-danielmarbach-mnemonic
projectName: mnemonic
memoryVersion: 1
---
When invoking the mnemonic MCP server via stdio (scripts/mcp-local.sh or direct node build/index.js), the server uses newline-delimited JSON. Each JSON-RPC message must be exactly one line.

Writing multiline JSON in a heredoc and piping it directly causes the server to silently discard the tool call — only the initialize response arrives, and the process exits with code 0 giving no error signal.

## Correct pattern

Write the payload as readable multiline JSON to a temp file, then compact with Python before piping:

```bash
cat > /tmp/request.json << 'JSON'
{ "jsonrpc": "2.0", "id": 1, "method": "tools/call", "params": { ... } }
JSON

VAULT="$HOME/mnemonic-vault"
INIT='{jsonrpc:2.0,id:0,method:initialize,params:{protocolVersion:2024-11-05,capabilities:{},clientInfo:{name:claude-code,version:1.0}}}'
TOOL=$(python3 -c "import json; print(json.dumps(json.load(open('/tmp/request.json'))))")
printf '%s
%s
' "$INIT" "$TOOL" | VAULT_PATH="$VAULT" node build/index.js
```

Parsing the response: iterate stdout lines, parse each as JSON, find the object with .
