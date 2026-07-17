# TimeWatcher

TimeWatcher is a local-first watch search demo. It combines a static Astro/React interface, a bundled watch catalog and image set, quantized search embeddings, and a Cloudflare Pages Function-compatible search API. The complete application runs on your computer; a Cloudflare account is **not required**.

## Run it locally

Requirements:

- Node.js 22 or newer
- npm

Install dependencies:

```bash
npm install
```

For the complete local app—including `/api/search`—run:

```bash
npm run dev:worker
```

Open `http://localhost:8788`. This command builds the Astro site and serves both `dist/` and the Pages Functions in `functions/` with Wrangler's local runtime. It does not deploy anything and does not require a Cloudflare login, account ID, or API token.

To work only on the interface with Astro's faster development server, run:

```bash
npm run dev
```

Open `http://localhost:4321`. This mode does not serve the Pages Function. Searches therefore fall back to the browser-side catalog matcher; use `npm run dev:worker` when testing the actual API and streamed results.

### Local API health check

With `npm run dev:worker` running in another terminal:

```bash
curl http://127.0.0.1:8788/api/search
```

The response reports the number of watches and embeddings, the embedding provider, dimensions, and whether the bundled catalog is internally valid.

## Real-photo catalog

The committed app catalog contains **395 unique watch references across 13 brands**. Every searchable record has:

- a real manufacturer product photo cached locally as an 800×800 transparent AVIF;
- the complete specification set published by the source, preserved verbatim in `sourceSpecifications`;
- normalized comparison/search fields where a published value exists;
- a catalog page, manufacturer link when available, image-source URL, retrieval time, and image hash.

Unpublished values remain `null`/`unknown` and render as `—`; the importer never estimates case dimensions, release years, or pre-owned prices. Five imported references whose source reused another reference's identical product photo are excluded from the searchable catalog. The strict gate requires at least 300 unique watches and rejects placeholders, illustrations, duplicate photos/references, implausible values, uncited populated fields, and altered image files.

The photo assets are cached for this local reference demo. Before publishing or using them commercially, obtain the necessary image/data permissions from their respective rights holders.

To refresh the public source snapshot and rebuild the local search data:

```bash
npm run catalog:import -- --limit 400 --max-pages 20 --concurrency 8
npm run catalog:compile
npm run catalog:prune-images -- --apply
npm run catalog:validate
npm run catalog:embeddings -- --local
```

The importer samples pages across the source's full watch catalog rather than taking only the first pages, which avoids creating a Rolex-only or single-brand index. `data/imported-watches.json` contains normalized app records, `data/imported-watches.provenance.json` preserves import metadata, and `data/catalog-provenance.json` is the field-level validation sidecar.

## Secrets and API keys

The committed catalog uses OpenAI embeddings, so `openai.api_key` is required for the actual `/api/search` path in this checkout. `anthropic.api_key` enables the intended Claude rerank; without it, the API returns constrained and diversified embedding-recall matches. For a completely keyless variant, rebuild the catalog with `npm run catalog:embeddings -- --local`; that replaces the committed OpenAI manifest with the deterministic local-hash fallback.

`secrets.yaml` is a file in the repository root—not a folder. Both it and the generated `.dev.vars` file are gitignored.

| Setting | Needed to start locally? | What enables it |
| --- | --- | --- |
| `anthropic.api_key` | No | Claude reranks the embedding shortlist into the final four results with query-specific reasons. It is also required by the optional batch description generator. Without it, the API uses recall-only mode. |
| `openai.api_key` | **Yes for the committed catalog** | OpenAI embeds each query with the same model used for the bundled catalog vectors. It is not needed after rebuilding with `--local`. |
| Cloudflare account/token | No | Deployment only. It is not used by local development or by `npm run secrets:sync`. |

### Create `secrets.yaml`

Copy the safe template and edit the copy:

```bash
cp secrets.example.yaml secrets.yaml
```

The file has this shape:

```yaml
anthropic:
  api_key: "sk-ant-api03-..."
  model: "claude-opus-4-8"

openai:
  api_key: "sk-proj-..."
  embedding_model: "text-embedding-3-small"

search:
  cache_ttl_seconds: 3600
```

Delete or leave blank any key you do not use. The model names and cache duration are configuration, not secrets; the shown values are the application defaults.

Create the runtime file consumed by Wrangler:

```bash
npm run secrets:sync
```

This maps the YAML values to `.dev.vars` and writes that file with mode `0600`:

| `secrets.yaml` | `.dev.vars` / Pages Function binding |
| --- | --- |
| `anthropic.api_key` | `ANTHROPIC_API_KEY` |
| `anthropic.model` | `ANTHROPIC_MODEL` |
| `openai.api_key` | `OPENAI_API_KEY` |
| `openai.embedding_model` | `OPENAI_EMBEDDING_MODEL` |
| `search.cache_ttl_seconds` | `SEARCH_CACHE_TTL_SECONDS` |

Restart `npm run dev:worker` after changing `.dev.vars`. To keep the YAML file somewhere else, set `TIMEWATCHER_SECRETS_FILE` for the sync and catalog scripts:

```bash
TIMEWATCHER_SECRETS_FILE=/absolute/path/to/timewatcher-secrets.yaml npm run secrets:sync
```

Never put either provider key in client-side code, commit it, or prefix it with `PUBLIC_`. OpenAI's [authentication guidance](https://developers.openai.com/api/reference/overview/#authentication) specifically requires API keys to remain server-side.

### Anthropic key setup

1. Sign in to the [Claude Console](https://console.anthropic.com/).
2. Open **Settings → API keys**.
3. Create a standard API key, choose an appropriate workspace and expiration, and copy the key when shown.
4. Put it in `anthropic.api_key`, then run `npm run secrets:sync`.

The app expects a standard `sk-ant-api...` key, not an Admin API key. Anthropic documents the current key flow and expiration options in its [authentication guide](https://platform.claude.com/docs/en/manage-claude/authentication).

### OpenAI key setup

1. Sign in to the [OpenAI API platform](https://platform.openai.com/).
2. Select or create the API project that should own this demo's usage and make sure billing/usage access is configured for that project.
3. Open [API keys](https://platform.openai.com/api-keys), create a secret key, and copy it when shown.
4. Put it in `openai.api_key`, then run `npm run secrets:sync`.

The key is used only by server/build code to call the Embeddings API. The default model is `text-embedding-3-small`, with 768 dimensions configured by the application.

### Building embeddings locally

The embedding manifest and the query path must use the same provider/model:

```bash
# Always build the no-key local fallback
npm run catalog:embeddings -- --local

# Fail instead of silently using local-hash when no OpenAI key is available
npm run catalog:embeddings -- --require-openai
```

With an OpenAI key present in `secrets.yaml` or `OPENAI_API_KEY`, the normal `npm run catalog:embeddings` command builds OpenAI embeddings. When that manifest is active, the running search API also needs `OPENAI_API_KEY` so it can embed incoming queries with the same model. Rebuild with `--local` if you want a fully keyless demo again.

## Build and verification

```bash
npm run check
npm test
npm run build
npm run search:smoke -- "understated automatic watch for a wedding under $5,000"
```

`search:smoke` requires both provider keys and exercises the real OpenAI-embedding/Claude-rerank path without printing either secret.

Useful catalog commands:

```bash
npm run catalog:import -- --limit 400 --max-pages 20
npm run catalog:compile
npm run catalog:images
npm run catalog:validate
npm run catalog:embeddings -- --local
```

The optional Anthropic batch description workflow is:

```bash
npm run catalog:descriptions -- submit --force
npm run catalog:descriptions -- status
npm run catalog:descriptions -- collect
```

It requires `ANTHROPIC_API_KEY`; after collection, compile the catalog and rebuild its embeddings.

---

## Optional: deploy to Cloudflare Pages

Everything above works without Cloudflare. This section is only for a future public or remote deployment.

Cloudflare credentials are deployment credentials; do not add them to `secrets.yaml` or `.dev.vars`. The former is read by this project's API-provider scripts, while the latter is injected into the Pages Function at runtime. For local-only use, stop here.

### 1. Create an account and find its ID

1. Create an account at the [Cloudflare dashboard](https://dash.cloudflare.com/sign-up), verify the email address, and sign in.
2. Open **Workers & Pages**.
3. In **Account details**, select the Account ID to copy it. Cloudflare also documents the Account Home menu route in [Find account and zone IDs](https://developers.cloudflare.com/fundamentals/account/find-account-and-zone-ids/).

You do not need to add a domain to use the generated `*.pages.dev` address.

### 2. Choose a Wrangler authentication method

For a one-person, interactive deployment from your own computer, the simplest option is browser login:

```bash
npx wrangler login
```

That route does not require you to manually create an API token.

For CI or an explicit non-interactive token:

1. In the Cloudflare dashboard, open **My Profile → API Tokens** for a user-owned token, or **Manage Account → API Tokens** for an account-owned service token.
2. Select **Create Token → Create Custom Token**.
3. Name it something specific, such as `TimeWatcher Pages deploy`.
4. Add exactly this permission: **Account → Cloudflare Pages → Edit**.
5. Under **Account Resources**, include only the account that will own TimeWatcher.
6. Optionally restrict client IP addresses and add an expiration/TTL.
7. Select **Continue to summary → Create Token** and copy the secret immediately; Cloudflare only displays it once.

These are the minimal Pages deployment permissions described in Cloudflare's [Direct Upload CI guide](https://developers.cloudflare.com/pages/how-to/use-direct-upload-with-continuous-integration/) and [token creation guide](https://developers.cloudflare.com/fundamentals/api/get-started/create-token/).

Expose the two deployment values only in the terminal session or CI secret store:

```bash
export CLOUDFLARE_ACCOUNT_ID="your-32-character-account-id"
export CLOUDFLARE_API_TOKEN="your-cloudflare-api-token"
```

Do not commit these exports to a shell script. You may verify a user token with the one-time command Cloudflare shows on the token creation page.

### 3. Create the Pages project

From the repository root:

```bash
npx wrangler pages project create timewatcher --production-branch main
```

This creates `timewatcher.pages.dev` when that name is available; Cloudflare may append characters when it is not.

If you intend to connect the GitHub repository for automatic dashboard builds instead, choose Cloudflare's Git integration before creating a Direct Upload project. Cloudflare warns that a Direct Upload project cannot later be converted to Git integration; you would need to create a new project.

### 4. Add runtime API secrets to Pages

The local `secrets.yaml` is never uploaded automatically. Add only the provider keys the deployed build needs:

```bash
npx wrangler pages secret put ANTHROPIC_API_KEY --project-name timewatcher
npx wrangler pages secret put OPENAI_API_KEY --project-name timewatcher
```

Each command prompts securely for its value. `ANTHROPIC_API_KEY` is optional if recall-only search is acceptable. `OPENAI_API_KEY` is optional when the deployed embedding manifest uses `local-hash`, but required when it uses `openai`.

The non-secret model names and cache TTL already live in `wrangler.toml`. Dashboard users can manage the same encrypted values under **Workers & Pages → timewatcher → Settings → Variables and Secrets → Add → Encrypt**. See Cloudflare's [Pages bindings and local secrets guide](https://developers.cloudflare.com/pages/functions/bindings/).

### 5. Build and deploy

```bash
npm run build
npx wrangler pages deploy dist --project-name timewatcher
```

Run the deploy command from the repository root. Wrangler detects and uploads the `functions/` directory along with `dist/`; Cloudflare's dashboard drag-and-drop uploader does not compile a Pages `functions/` directory. The resulting site is available at the URL Wrangler prints, normally `https://timewatcher.pages.dev`. See [Cloudflare's Direct Upload guide](https://developers.cloudflare.com/pages/get-started/direct-upload/) and [Pages command reference](https://developers.cloudflare.com/workers/wrangler/commands/pages/).
