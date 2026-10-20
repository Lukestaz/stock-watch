# Stock Watch database configuration

Database name: `stock-watch`
Database ID supplied by the owner: `4cb54afc-8f2d-4f62-8b6b-7d59f343b938`
Intended Worker binding: `DB`
Configuration: `worker/wrangler.d1.jsonc`

This is database-management configuration, not a deployable application configuration. It has no Worker entry point and is not referenced by either deployment workflow. The supplied database/account association and remote schema have not been independently verified.

There are now four SQL migrations in `worker/migrations`: three for accounts/identity and 0004 for the reconstructed price cache. Before applying them, inspect the remote database and pending migration list, confirm account/token access, and approve the remote write separately. This commit does not apply migrations, grant token permissions, install a live binding, deploy a Worker, or enable accounts or price caching.

When deployment is prepared, carry this same DB binding into the relevant Worker-specific deployment configuration. Do not edit `worker/wrangler.jsonc` or deploy either Worker merely to record these settings. See PRICE_CACHE.md for the staged cache contract and rollout requirements.
