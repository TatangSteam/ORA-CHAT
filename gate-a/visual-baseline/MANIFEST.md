# Visual Baseline Manifest

Capture date: **6 Agustus 2026**  
Browser: **Google Chrome headless**  
Runtime: Vite control panel lama + HTTP adapter terhadap fixture MSW lama  
Data classification: **Synthetic fixture only**

## Capture matrix

| File | Route | Viewport | SHA-256 |
|---|---|---:|---|
| `desktop-login.png` | `/login` | 1440x1200 | `1522fdd99eb7d493d92f9e1f3d838f78f8d8c47c1d150ec55f2ca198060ca5d5` |
| `desktop-overview.png` | `/overview` | 1440x1200 | `2b1b5e8f4bdc5047c0c1595932336711ba8c17f71c6bdad8f6ffa881851d7d3b` |
| `desktop-inbox.png` | `/inbox` | 1440x1200 | `a7581dddf3a61cb9b7823c263bf6f20a90660b415ff2702f232d139b7e3cfbab` |
| `desktop-inbox-follow-ups.png` | `/inbox/follow-ups` | 1440x1200 | `cc61eb7d5d67f1e40420bcfe3a1dc0a00899c9ecb8f1f7a40e92696efb70354a` |
| `desktop-contacts.png` | `/contacts` | 1440x1200 | `a34d04381e1b43b96a08390a754c7ef1eeb1b77d20d9460a9522717980310687` |
| `desktop-compose.png` | `/messages/compose` | 1440x1200 | `75bfca0b81662968266557e9e418f748e92f8956e862a07139ab4d3e46adb62c` |
| `desktop-outbox.png` | `/messages/outbox` | 1440x1200 | `e25a4ede10737383367b59d71bcea16df58604df86a755059ed1103e91c325d5` |
| `desktop-session.png` | `/operations/session` | 1440x1200 | `9b50a8b9ba8e70d3e54b54592cea65e95d5432c1b80121f2fe2cc0d902175c27` |
| `desktop-safety.png` | `/operations/safety` | 1440x1200 | `d71f68e2f070ff70d988bb04f74d27034e0408c2265c6e08d2b2d58706cb5099` |
| `desktop-chatbot-rules.png` | `/chatbot/rules` | 1440x1200 | `b6ec67c24bc5ab6f801f745b45c94ed97f2acf630d55fbd421f88a8d6db29ccc` |
| `desktop-ai-overview.png` | `/ai-chatbot/overview` | 1440x1200 | `f52019ea27dada539c131df190fc9ca0b268a23a5bf0c427cda439217f5f20b5` |
| `desktop-ai-knowledge.png` | `/ai-chatbot/knowledge` | 1440x1200 | `07f6b9f8f80899fdb6fb2f3105b2dc45eaaa24ce8aae62f1b8a1640d9998f22f` |
| `desktop-ai-documents.png` | `/ai-chatbot/knowledge/documents` | 1440x1200 | `9a423899873406c2e318a45efdef32e1abf6650c1627d06f9c00f61e5127f23c` |
| `desktop-ai-playground.png` | `/ai-chatbot/playground` | 1440x1200 | `d9b6cb8ca4ea907695c52e0190e0f8f602f526db0a576aff0fb55395a3f8e448` |
| `desktop-ai-settings.png` | `/ai-chatbot/settings` | 1440x1200 | `fcc770a03ee814e17833b281c98e6bfa0f07ee3838a5e3d0aaff32aadae390e8` |
| `desktop-ai-instructions.png` | `/ai-chatbot/instructions` | 1440x1200 | `79491efce61f4034ccb68281a25c24e97d47d68188c95a4d96ca8583ebea5a79` |
| `desktop-ai-conversations.png` | `/ai-chatbot/conversations` | 1440x1200 | `f001008b09b1a8bf87bc5a53f65d2a4c62584257e756763dd59d810e880bb5af` |
| `desktop-ai-unanswered.png` | `/ai-chatbot/unanswered` | 1440x1200 | `f7b6ee5ad1ae44bd25b371b23ac04aae749a35368f6564dd621c4f79442145e1` |
| `desktop-ai-handoffs.png` | `/ai-chatbot/handoffs` | 1440x1200 | `d5c2cd194c7d086e443448b0e6d72f4936024b410af6b389feca9f9fe8af902e` |
| `desktop-ai-analytics.png` | `/ai-chatbot/analytics` | 1440x1200 | `48b3f7cc62c4323aae2398bac81329e757cd7ddbb8076a2efb628bdccd077323` |
| `mobile-login.png` | `/login` | 390x844 | `9f55ac405a7e72bfa21ded1872f39b749cd9db38b0775b127369da506d4fab65` |
| `mobile-overview.png` | `/overview` | 390x844 | `546f847a02ad7f4e41f02e564c9861d6245291ab49016d3a1721087dc794d7fe` |
| `mobile-inbox.png` | `/inbox` | 390x844 | `d1c8873c9e0799b8a5e1b96bb9c6cf664ffbd5fa692ab40279e3e8b8adc1c165` |
| `mobile-session.png` | `/operations/session` | 390x844 | `e4e5551d07daf4b9591ef900d4ebd682929612b0237bbf6ecc644f9789db03bf` |
| `mobile-safety.png` | `/operations/safety` | 390x844 | `b007002561be656ea50de6e07c6eec18ae5aeec88d951ccd87e87663c2fd4832` |
| `mobile-ai-settings.png` | `/ai-chatbot/settings` | 390x844 | `175c7f525b80e61be573c5e0edf01c6717e625a40592b62392de7df59476ac7f` |
| `mobile-ai-knowledge.png` | `/ai-chatbot/knowledge` | 390x844 | `bf992861f87c69201f82c76cb146fceff6743a2340ca71ee32cbaf5d488dc984` |

## Limitation

- Screenshot menunjukkan visual dan state fixture, bukan bukti integrasi backend production.
- Backend legacy tidak dapat dijalankan karena source package `baileys-antiban` hilang.
- Interaction state seperti mobile menu terbuka, dialog destructive, QR countdown, dan message detail tertentu memerlukan baseline tambahan saat fitur terkait mulai diport.
- Screenshot menggunakan viewport, bukan emulasi device/OS tertentu.
- Pixel difference dipakai sebagai sinyal review. Accessibility, text wrapping, responsive correctness, dan requirement baru tetap lebih penting daripada persamaan pixel mutlak.

