# Gaffer Valorant Draft

## Deploy ke Vercel

1. Push project ke GitHub.
2. Import repository ke Vercel.
3. Tambahkan environment variables di Vercel:
   - SUPABASE_URL
   - SUPABASE_SERVICE_ROLE_KEY
4. Jalankan SQL di [supabase-hall-of-fame.sql](supabase-hall-of-fame.sql) di Supabase SQL Editor.
5. Deploy.

Hall of fame akan otomatis dibaca dan ditulis melalui endpoint `/api/hall-of-fame`.
