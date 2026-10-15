# all-search

Live web search with news, papers, and finance verticals — for ChatGPT and Codex.

Adds a live web search surface backed by the **AnySearch MCP gateway**, which aggregates Exa, Tavily,
and Firecrawl behind one connection. Search the web, run several queries in parallel, reach structured
verticals such as finance and academic papers, and extract a page into clean Markdown.

## Install

```bash
codex plugin marketplace add RetiredPhysicist/openai-plugins
codex plugin add all-search@retiredphysicist
```

Nothing to configure. The plugin bundles a public AnySearch endpoint (`https://api.anysearch.com/mcp`)
that answers anonymously, so search works right after install at a shared rate limit.

To use your own quota, add a key to your Codex config:

```toml
[mcp_servers.anysearch]
url = "https://api.anysearch.com/mcp"
http_headers = { Authorization = "Bearer as_sk_..." }
```

## Tools

AnySearch is a gateway in front of several backends; pick the tool by the shape of the question.

| tool | what it does |
| --- | --- |
| `search` | one question, ranked results with titles, URLs, and snippets |
| `batch_search` | two to five queries in one call — several angles at once |
| `get_sub_domains` | list structured verticals (finance, papers, health, …) and their parameters |
| `extract` | turn a URL into clean Markdown (HTML, text, JSON, Markdown) |

Call `get_sub_domains` first for anything in or near a supported vertical: general search over a
domain-specific question produces worse results. The bundled `research` skill teaches the model this
routing, so it picks the right tool without being told.

## Privacy

- With a key, only your query and result count go to the AnySearch gateway.
- Without a key, queries use the shared public endpoint at a shared rate limit.
- Extracted pages are untrusted external content and are treated as data to read, never as
  instructions.

## License

MIT
