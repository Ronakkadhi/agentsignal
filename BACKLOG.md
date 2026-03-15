# AgentSignal — Backlog & Skipped Items

> Running doc of ideas parked for later. Pull from here when ready to ship next version.

## Skipped from P1
| Item | Why Skipped | Revisit When |
|---|---|---|
| SSE Streaming `/stream` | Polling with `?after=` + ETag is sufficient for now | Users ask for real-time push |
| Python SDK (`pip install agentsignal`) | API is one curl — no abstraction needed yet | Auth/pagination gets complex |
| JS SDK (`npm i agentsignal`) | Same as above | Same as above |
| More sources (GitHub Trending, Product Hunt, npm, WHO, Fear & Greed) | P0 feed quality first, then quantity | After P0 ships |

## Skipped from P2
| Item | Why Skipped | Revisit When |
|---|---|---|
| API keys + usage tracking | Free tier first, track usage later | Need monetization or abuse prevention |
| Custom sources (runtime) | PRs to repo is the right model for now | Community demands self-serve |
| Dashboard UI | Not core — agents don't need a GUI | Marketing/demo needs arise |
| Alerting (Slack/Discord/email) | Webhooks cover push use case | Consumer-facing demand |

## Future Ideas (Not Yet Scoped)
- AI-powered signal clustering ("these 5 signals are about the same event")
- Trend detection ("AI regulation" is spiking across 4 sources)
- Agent-to-agent signal sharing (publish your agent's signals back to the feed)
- Geographic filtering (signals near lat/lng)
- Sentiment scoring per signal (bullish/bearish/neutral)
- Signal confidence scoring (how reliable is this source for this topic?)
- Multi-language support (translate non-English signals)
- OpenAI/Anthropic/Google status page monitoring (meta: AI infra signals)
- Crypto whale alerts (large wallet movements)
- Twitter/X integration (when API becomes affordable)
