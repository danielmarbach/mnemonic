---
title: MCP stdio communication troubleshooting
tags:
  - dogfooding
  - mcp
  - troubleshooting
  - shell
  - json
lifecycle: permanent
createdAt: '2026-03-07T23:17:24.549Z'
updatedAt: '2026-03-07T23:17:56.240Z'
project: https-github-com-danielmarbach-mnemonic
projectName: mnemonic
relatedTo:
  - id: mnemonic-consolidate-tool-design-b9cbac6a
    type: example-of
memoryVersion: 1
---
When dogfooding mnemonic via direct stdio communication, complex JSON payloads with newlines and special characters can fail silently due to shell escaping issues.

**Problem:** Direct echo of JSON with multiline content can result in truncated responses or failed tool calls without clear error messages.

**Solution:** Write JSON payload to a temporary file first, then pipe the file content to the MCP server.

Example:

```bash
# Write to file first
cat > /tmp/request.json << 'JSON'
{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{...}}
JSON

# Then pipe to MCP
(
  echo '{"jsonrpc":"2.0","id":0,"method":"initialize",...}'
  cat /tmp/request.json
) | ./scripts/mcp-local.sh
```

**Verification:** Always verify the note was created by listing recent memories or checking the vault directory.

**Alternative:** Use the `npm run mcp:local` helper which rebuilds first, but still requires careful JSON formatting for direct stdio communication.
