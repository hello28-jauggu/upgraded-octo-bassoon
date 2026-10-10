# Always-on / multi-region deploy

Codespace sleeps. For 24/7 hosts:

1. Deploy same app on Railway / Render / Fly.io / VPS
2. Set env:
   - REGION=us|eu|asia|local
   - REGION_US=https://your-us-host.example
   - REGION_EU=https://your-eu-host.example
   - REGION_ASIA=https://your-asia-host.example
3. Each region is a separate Node process with its own rooms
4. Client /api/regions lists hosts for the region picker

Accounts store in data.json on that host (use shared DB for true global accounts).
