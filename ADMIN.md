# Admin bans

Set env: `ADMIN_KEY=your-secret`

Ban:
```bash
curl -X POST http://localhost:3000/api/admin/ban \
  -H "Content-Type: application/json" \
  -H "x-admin-key: your-secret" \
  -d '{"key":"playername","reason":"cheating","hours":24}'
```

hours=0 → permanent

Unban:
```bash
curl -X POST http://localhost:3000/api/admin/unban \
  -H "Content-Type: application/json" \
  -H "x-admin-key: your-secret" \
  -d '{"key":"playername"}'
```

List bans:
```bash
curl http://localhost:3000/api/admin/bans -H "x-admin-key: your-secret"
```
