# V2 visual regression manifest

Capture date: **10 Agustus 2026**
Browser: **Google Chrome headless**
Runtime: **Next.js production App Shell + local Compose fixture**
Data classification: **Synthetic local acceptance fixture only**

Baseline Fase 1/2/3 meliputi login, overview, inbox, contacts, compose, outbox, handoffs, chatbot, Integrasi AI, session, dan safety pada viewport `1440x1200` serta `390x844`. Fase 4–6 menambahkan knowledge, AI operations, template, dan compose integration. Test mem-mask count/list/timeline yang berubah karena durable runtime fixture dan membandingkan struktur lain dengan `maxDiffPixelRatio: 0.02` serta threshold `0.2`. Halaman Fase 3 memakai nama `desktop-v2-ai-settings.png` dan `mobile-v2-ai-settings.png` agar baseline legacy `ai-settings` tetap utuh.

Original Gate A hashes dan route legacy tetap tercatat pada `MANIFEST.md`; halaman AI legacy lain yang belum masuk scope Fase 3 tetap memakai file historis. Baseline ported ini menjadi regression reference setelah parity review, bukan pengganti bukti historis capture Gate A.

Verification: `corepack pnpm test:visual` dan `corepack pnpm test:a11y`.
