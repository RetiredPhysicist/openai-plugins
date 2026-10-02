# openai-plugins

Portable [Agent Plugins](https://agent-plugins.org/specification) for ChatGPT and Codex, published by
[RetiredPhysicist](https://github.com/RetiredPhysicist).

| Plugin | What it does |
| --- | --- |
| [all-search](./plugins/all-search) | Live web search, parallel queries, structured verticals, and page extraction via the AnySearch MCP gateway |
| [dejavu-memory](./plugins/dejavu-memory) | Long-term memory on your own DejaVu server |

## Install

Add the marketplace, then install the plugins you want:

```bash
codex plugin marketplace add RetiredPhysicist/openai-plugins
codex plugin marketplace list
```

In the ChatGPT desktop app, open the Plugins Directory, choose the **RetiredPhysicist** marketplace,
and install from there.

## Configuration

### all-search

Works without credentials. AnySearch serves anonymous requests at a lower rate limit.

To use your own quota, set an API key in the MCP server headers:

```json
{
  "mcpServers": {
    "anysearch": {
      "type": "streamable-http",
      "url": "https://api.anysearch.com/mcp",
      "headers": { "Authorization": "Bearer as_sk_..." }
    }
  }
}
```

### dejavu-memory

DejaVu is self-hosted, so the shipped `mcp.json` carries placeholder values. Point it at your own
deployment before the plugin can reach memory:

```json
{
  "mcpServers": {
    "dejavu": {
      "type": "streamable-http",
      "url": "https://your-dejavu.example.com/mcp",
      "headers": {
        "CF-Access-Client-Id": "your-access-client-id",
        "CF-Access-Client-Secret": "your-access-client-secret"
      }
    }
  }
}
```

Deploy a server first: [DejaVu](https://github.com/RetiredPhysicist/DejaVu). The header pair is only
needed when the deployment sits behind Cloudflare Access; a server without Access needs just `url`.

Portable `mcp.json` does not expand environment variables, so these values are literal. Keep local
edits out of version control.

## Layout

Each plugin follows the v1.0.0 package model: a root `plugin.json` manifest, skills under `skills/`,
an `mcp.json` for remote MCP servers, and OpenAI-specific metadata under `extensions.com.openai`.

```text
openai-plugins/
├── .agents/plugins/marketplace.json
└── plugins/
    ├── all-search/
    │   ├── plugin.json
    │   ├── mcp.json
    │   └── skills/research/SKILL.md
    └── dejavu-memory/
        ├── plugin.json
        ├── mcp.json
        └── skills/remember/SKILL.md
```

## License

MIT
