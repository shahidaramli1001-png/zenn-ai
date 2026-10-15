<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

# Architecture rules
- Website and public API ship as one TanStack Start Worker; `/v1/*` routes are the public API. Why: a single deploy keeps the contracts in sync.
- All AI calls go through `src/lib/ai/provider.server.ts` (OpenAI-compatible, configured by env). Why: the provider can be swapped in one place.
- Messages, API keys and usage are written only server-side with the admin client; clients only get RLS read access. Why: usage records and quotas can't be forged.
- Quota and rate limiting happen in the `consume_quota` / `hit_rate_limit` SQL functions. Why: the checks are atomic under concurrency.
- The chat view lives in the `/chat` layout and is not remounted per conversation. Why: a stream survives the URL change when a new chat is created.
