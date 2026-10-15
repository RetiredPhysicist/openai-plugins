# dejavu-memory

Long-term memory for ChatGPT and Codex backed by your own DejaVu server, with a visual memory graph.

DejaVu Memory gives ChatGPT and Codex a hierarchical, versioned memory tree. Store decisions,
preferences, and reusable judgments once, then recall them with keyword or semantic search. The
workspace includes an interactive graph of the memory tree with hybrid search, a content inspector,
and subtree expansion. Data stays on your own DejaVu server, reached through its MCP endpoint.

<p align="center">
  <img src="./assets/dejavu-memory-graph.webp" width="100%" alt="DejaVu Memory in Codex: the whole memory tree as an interactive graph, with type colours and priority-sized nodes">
</p>

<p align="center">
  <img src="./assets/dejavu-memory-inspector.webp" width="100%" alt="Selecting a node opens the inspector: the memory URI, its type and priority, and the body text, with its subtree highlighted">
</p>

Set your server up first: [DejaVu](https://github.com/RealAlexandreAI/DejaVu).

## Install

```bash
codex plugin marketplace add RetiredPhysicist/openai-plugins
codex plugin add dejavu-memory@retiredphysicist
```

The plugin ships no MCP server of its own — the memory graph is a server-side MCP App served by your
DejaVu worker. Point Codex at your deployment by adding it as `dejavu`:

```toml
[mcp_servers.dejavu]
url = "https://your-dejavu.example.com/mcp"
http_headers = { CF-Access-Client-Id = "your-client-id", CF-Access-Client-Secret = "your-client-secret" }
```

Keep the `dejavu` name. The header pair is only for deployments behind Cloudflare Access; a server
without Access needs just `url`.

## Why this is a manual step

1. Each deployment has its own hostname, and the plugin format has no variable expansion for MCP
   URLs, so a shipped URL cannot be right for everyone.
2. Secrets would have to sit in the plugin package, which is public.
3. ChatGPT cannot send custom API keys or service tokens at all — it only speaks OAuth 2.1. A
   Cloudflare Access service token therefore works in Codex and not in ChatGPT.

Running DejaVu behind OAuth 2.1 instead of Access would make zero-config install possible in both
clients. That is the path to remove this step entirely.

## Workspace

Open **DejaVu Memory** from the sidebar for an interactive graph of the memory tree: search highlights
matching nodes, click a node to read it, double-click to expand its children, drag to rearrange, and
scroll to zoom. The model-facing tools (`read_memory`, `search_memory`, and the rest) are unchanged —
the OpenAI plugin grows on top of the plain MCP server and does not replace it.

## Related

- [DejaVu](https://github.com/RealAlexandreAI/DejaVu) — the Cloudflare MCP memory server this plugin talks to
- [pi-dejavu-memory](https://github.com/RetiredPhysicist/pi-plugins/tree/main/packages/pi-dejavu-memory) — same memory server, tool-only, for Pi
- [dsh-dejavu-memory](https://github.com/RetiredPhysicist/dsh-plugins/tree/main/packages/dsh-dejavu-memory) — same memory server, tool-only, for dsh

## License

MIT
