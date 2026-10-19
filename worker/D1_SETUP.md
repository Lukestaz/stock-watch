# Stock Watch database configuration

Database name: `stock-watch`
Database ID supplied by the owner: `4cb54afc-8f2d-4f62-8b6b-7d59f343b938`
Intended Worker binding: `DB`
Configuration: `worker/wrangler.d1.jsonc`

This is database-management configuration, not a deployable application configuration. It has no Worker entry point and is not referenced by either deployment workflow. The supplied database/account association and remote schema have not been independently verified.

The existing three SQL migrations in `worker/migrations` remain unchanged. Before applying them, inspect the remote database and pending migration list, confirm account/token access, and approve the remote write separately. This commit does not apply migrations, grant token permissions, install a live binding, deploy a Worker, or enable accounts.

When the app deployment is prepared, carry this same DB binding into the app-specific deployment configuration. Do not add it to `worker/wrangler.jsonc`, which currently targets stock-watch-prices.
