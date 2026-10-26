# Kuakata Multimedia Finance

Fully standalone financial, team, and salary management system for Kuakata Multimedia.

## Architecture

- **Framework**: TanStack Start (Full-stack React with SSR)
- **Bundler & Server**: Vite + Nitro engine
- **Styling**: Tailwind CSS v4
- **Database & Auth**: Supabase PostgreSQL & Auth
- **Hosting Target**: Vercel (or any Node.js / Docker / VPS server)

## Local Development

```bash
# Install dependencies
npm install

# Run development server
npm run dev

# Build for production
npm run build

# Preview production build locally
npm run preview
```

## Database Setup

See `supabase/complete_schema.sql` to initialize your own Supabase database in one click via Supabase SQL Editor.

