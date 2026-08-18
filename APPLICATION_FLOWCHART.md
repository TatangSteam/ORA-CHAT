# Flowchart Aplikasi RAHO WhatsApp Chatbot

Dokumen ini menggambarkan alur aplikasi berdasarkan implementasi yang saat ini ada di repository. Diagram menggunakan sintaks [Mermaid](https://mermaid.js.org/) dan dapat dirender langsung oleh GitHub, GitLab, atau editor Markdown yang mendukung Mermaid.

## 1. Ringkasan arsitektur

```mermaid
flowchart LR
    CUSTOMER[Customer WhatsApp]
    ADMIN[Admin / Operator]
    PROVIDER[WhatsApp Network]
    AI[AI Provider<br/>OpenAI / Anthropic / Gemini<br/>OpenAI-compatible / OpenClaw]

    subgraph APP[RAHO Application]
        WEB[Next.js Web<br/>Admin Control Room]
        API[Express API<br/>Auth, RBAC, business rules]
        WA[WhatsApp Service<br/>Baileys adapter]
        WORKER[Worker<br/>Outbox and knowledge jobs]
        QUEUE[BullMQ]
    end

    subgraph DATA[Internal Data Layer]
        DB[(PostgreSQL + pgvector<br/>Durable source of truth)]
        REDIS[(Redis<br/>Queue datastore)]
        MINIO[(MinIO<br/>Object storage)]
    end

    ADMIN -->|HTTP| WEB
    WEB -->|Rewrite /api/admin/v1| API

    CUSTOMER <--> PROVIDER
    PROVIDER <--> WA
    WA -->|Inbound internal API| API
    WORKER -->|Outbound internal API| WA

    API <--> DB
    WA <--> DB
    WORKER <--> DB

    API --> QUEUE
    QUEUE <--> REDIS
    REDIS <--> WORKER

    API <--> MINIO
    WORKER <--> MINIO
    API <--> AI
    WORKER <--> AI
```

Prinsip utamanya:

1. PostgreSQL adalah sumber data utama. Redis tidak menyimpan state bisnis permanen.
2. Pesan keluar selalu dibuat sebagai record durable di PostgreSQL sebelum dimasukkan ke BullMQ.
3. Service WhatsApp menjadi satu-satunya komponen yang berkomunikasi dengan WhatsApp melalui Baileys.
4. Express API memegang business logic, autentikasi, otorisasi, routing chatbot, dan akses AI.
5. Next.js hanya menjadi frontend dan meneruskan request `/api/admin/*` ke Express API.

## 2. Flow utama aplikasi

```mermaid
flowchart TD
    START([Mulai]) --> SOURCE{Sumber aktivitas}

    SOURCE -->|Customer mengirim chat| INBOUND[Flow pesan masuk WhatsApp]
    SOURCE -->|Admin memakai dashboard| ADMIN_FLOW[Flow Admin UI]
    SOURCE -->|Admin mengunggah knowledge| KNOWLEDGE[Flow knowledge dan indexing]

    INBOUND --> SAVE_INBOUND[Simpan contact, conversation,<br/>message, dan event ke PostgreSQL]
    SAVE_INBOUND --> ROUTE{Mode conversation}

    ROUTE -->|human| UI_ONLY[Tampilkan pesan di Inbox<br/>tanpa balasan otomatis]
    ROUTE -->|bot| RULE{Ada ordered rule<br/>yang cocok?}

    RULE -->|Ya| RULE_REPLY[Buat balasan deterministic]
    RULE -->|Tidak| RAG[Retrieval dan AI generation]

    RAG --> RAG_RESULT{Hasil aman dan<br/>ter-grounding?}
    RAG_RESULT -->|Ya| AI_REPLY[Buat balasan AI]
    RAG_RESULT -->|Fallback biasa| FALLBACK[Buat fallback aman<br/>conversation tetap bot]
    RAG_RESULT -->|Perlu manusia| HANDOFF_REPLY[Buat balasan dan handoff<br/>ubah mode menjadi human]

    RULE_REPLY --> OUTBOX[(Buat durable outbox)]
    AI_REPLY --> OUTBOX
    FALLBACK --> OUTBOX
    HANDOFF_REPLY --> OUTBOX
    ADMIN_FLOW -->|Admin mengirim pesan| OUTBOX

    OUTBOX --> BULLMQ[Enqueue job BullMQ]
    BULLMQ --> WORKER[Worker claim outbox]
    WORKER --> SAFETY{Sending aktif dan<br/>WhatsApp connected?}
    SAFETY -->|Tidak| RETRY[Block, retry, atau tandai gagal]
    SAFETY -->|Ya| SEND[Kirim lewat service WhatsApp]
    SEND --> CUSTOMER([Pesan diterima customer])

    KNOWLEDGE --> LEXICAL[(Lexical knowledge chunks)]
    KNOWLEDGE -.->|Jika provider embedding tersedia| VECTOR[(Active pgvector index)]
    LEXICAL --> RAG
    VECTOR -.-> RAG
```

## 3. Flow pesan customer masuk

```mermaid
flowchart TD
    A([Customer mengirim pesan]) --> B[WhatsApp Network]
    B --> C[Baileys menerima<br/>messages.upsert atau messages.update]
    C --> D[Normalisasi payload,<br/>JID, nomor telepon, dan isi pesan]
    D --> E{Payload dapat dibaca?}

    E -->|Tidak, konten belum tersedia| F[Masukkan ke inbound recovery queue]
    F --> G[Minta placeholder resend<br/>dan tunggu update payload]
    G --> C

    E -->|Tidak valid atau from_me| H[Drop dan tulis structured log]
    E -->|Ya| I[POST /internal/v1/whatsapp/inbound]

    I --> J{Internal token dan<br/>schema valid?}
    J -->|Tidak| K[401 atau 400]
    J -->|Ya| L{Provider message/event<br/>sudah pernah disimpan?}

    L -->|Ya, duplicate| M[Return idempotent response<br/>tanpa automation ulang]
    L -->|Tidak| N[Transaction PostgreSQL]

    N --> N1[Upsert contact]
    N1 --> N2[Upsert conversation]
    N2 --> N3[Simpan incoming message<br/>status received]
    N3 --> N4[Simpan message event]
    N4 --> O[Publish SSE message.inbound]

    O --> P{handlingMode = bot?}
    P -->|Tidak| Q([Selesai: ditangani manusia])
    P -->|Ya| R[Ambil chatbot rule version<br/>berstatus published]
    R --> S{Trigger rule cocok?}

    S -->|Ya| T[Buat outgoing message<br/>source rule]
    S -->|Tidak| U[Kirim presence composing]
    U --> U1[Ambil maksimum 5 pesan sebelumnya]
    U1 --> U2[Jalankan flow contextual RAG / AI]

    T --> T1[Buat durable outbox rule]
    U2 --> W{Hasil AI}
    W -->|Ya| X[Buat outgoing message<br/>source ai]
    W -->|fallback biasa| Y[Buat fallback atau<br/>pertanyaan klarifikasi]
    W -->|handoff| Y1[Buat response dan handoff task]
    Y1 --> Y2[followUpRequired = true<br/>handlingMode = human]

    X --> V
    Y --> V
    Y2 --> V
    V[Buat durable outbox AI] --> V1[Kirim presence paused]
    V1 --> Z[Enqueue outbound.delivery]
    T1 --> Z
```

### Urutan keputusan chatbot

Routing balasan otomatis selalu mengikuti urutan berikut:

1. Pesan duplicate tidak diproses ulang.
2. Conversation dengan mode `human` tidak menjalankan rule maupun AI.
3. Conversation dengan mode `bot` mencoba ordered deterministic rule yang sudah dipublish.
4. Jika rule cocok, respons rule langsung dibuat dan AI tidak dijalankan.
5. Jika tidak ada rule yang cocok, aplikasi menjalankan retrieval dan AI.
6. Pertanyaan lanjutan dapat memakai maksimum lima pesan terakhir untuk memahami rujukan; riwayat bukan sumber fakta.
7. Pertanyaan ambigu menghasilkan satu pertanyaan klarifikasi dan conversation tetap dalam mode `bot`.
8. Fallback biasa tidak membuka handoff. Kategori terbatas/darurat atau keputusan eksplisit `handoff` memindahkan conversation ke manusia.

## 4. Sequence pesan masuk sampai balasan keluar

```mermaid
sequenceDiagram
    autonumber
    actor Customer
    participant WACloud as WhatsApp Network
    participant WA as WhatsApp Service / Baileys
    participant API as Express API
    participant DB as PostgreSQL
    participant AI as Knowledge + AI Provider
    participant Redis as Redis / BullMQ
    participant Worker

    Customer->>WACloud: Kirim pesan
    WACloud->>WA: messages.upsert
    WA->>WA: Normalisasi dan recovery jika perlu
    WA->>API: POST internal inbound + bearer token
    API->>DB: Dedupe provider message/event
    API->>DB: Simpan contact, conversation, incoming message
    API-->>API: Publish SSE message.inbound

    alt Ordered rule cocok
        API->>DB: Buat response source=rule + outbox
    else Tidak ada rule yang cocok
        API->>WA: Presence composing
        API->>DB: Ambil maksimal 5 pesan sebelumnya
        API->>DB: Retrieval lexical (atau pgvector jika aktif)
        API->>AI: Generate grounded answer dengan provider chat aktif
        AI-->>API: answered / fallback / handoff
        API->>DB: Simpan trace, response AI, outbox, dan handoff bila perlu
        API->>WA: Presence paused
    end

    API->>Redis: Enqueue outbound.delivery
    Redis->>Worker: Ambil job
    Worker->>DB: Claim outbox dengan lease
    Worker->>WA: POST internal send
    WA->>WACloud: socket.sendMessage
    WACloud-->>WA: providerMessageId
    WA-->>Worker: Accepted
    Worker->>DB: outbox/message = sent
    WACloud->>Customer: Balasan diterima
```

## 5. Flow pesan manual dari Admin UI

```mermaid
flowchart TD
    A([Admin membuka Inbox]) --> B[Next.js Web]
    B --> C[GET conversations dan messages]
    C --> D[Next.js rewrite request ke Express API]
    D --> E{Session, CSRF, RBAC,<br/>dan tenant valid?}
    E -->|Tidak| F[Reject 401 atau 403]
    E -->|Ya| G[Admin menulis atau memilih template]
    G --> H[POST /api/admin/v1/messages<br/>dengan idempotency key]
    H --> I{Request pernah diproses?}
    I -->|Ya, hash sama| J[Kembalikan response snapshot]
    I -->|Ya, hash berbeda| K[Reject idempotency conflict]
    I -->|Tidak| L[Transaction PostgreSQL]

    L --> L1[Buat outgoing message]
    L1 --> L2[Buat template snapshot bila digunakan]
    L2 --> L3[Buat durable outbox]
    L3 --> L4[Simpan idempotency key dan audit log]

    L4 --> M{Dijadwalkan?}
    M -->|Ya| N[Tunggu sampai availableAt]
    M -->|Tidak| O[Enqueue outbound.delivery]
    N --> O
    O --> P[Worker mengirim lewat WhatsApp Service]
```

## 6. Flow durable outbox

```mermaid
stateDiagram-v2
    [*] --> queued: Message dan outbox dibuat atomically
    queued --> cancelled: Dibatalkan sebelum dikirim
    queued --> leased: Worker berhasil claim
    retryable --> leased: Waktu retry tiba
    retryable --> cancelled: Dibatalkan admin

    leased --> sending: Recipient aman dan WhatsApp connected
    leased --> retryable: Gagal sebelum provider menerima
    leased --> failed: Unsafe recipient atau attempts habis

    sending --> sent: Provider memberi message ID
    sending --> unknown: Hasil provider tidak pasti

    unknown --> sent: Rekonsiliasi admin = sent
    unknown --> failed: Rekonsiliasi admin = failed

    sent --> [*]
    failed --> [*]
    cancelled --> [*]
```

Catatan outbox:

- Message terjadwal tetap memiliki record outbox, tetapi baru dapat di-claim setelah `availableAt` tercapai.
- Job BullMQ hanya membawa identifier durable, bukan isi pesan sebagai source of truth.
- Worker menggunakan lease agar job yang terputus dapat dipulihkan.
- Kegagalan sebelum provider menerima pesan masuk ke `retryable` dengan backoff sampai batas attempt.
- Error setelah proses send dimulai tetapi hasil akhirnya tidak pasti masuk ke `unknown` dan memerlukan rekonsiliasi.
- Safety pause atau kill switch menghentikan delivery sebelum fungsi kirim dijalankan.

## 7. Flow knowledge document dan retrieval index

```mermaid
flowchart TD
    A([Admin upload dokumen]) --> B[Express API memvalidasi<br/>auth, ukuran, dan metadata]
    B --> C[Stream object ke bucket<br/>MinIO quarantine]
    C --> D[Simpan document dan storage metadata<br/>di PostgreSQL]
    D --> E[Enqueue knowledge.document.process]
    E --> F[Worker membaca object quarantine]
    F --> G{Hash, MIME, dan konten aman?}

    G -->|Tidak| H[Document state = failed<br/>simpan failure code]
    G -->|Ya| I[Extract dan bersihkan teks]
    I --> J[Simpan source dan extracted object<br/>ke bucket knowledge]
    J --> K[Chunk teks untuk lexical retrieval]
    K --> L[Simpan lexical chunks<br/>di PostgreSQL]
    L --> M[Document state = ready<br/>dan hapus object quarantine]
    M --> N{Embedding connection tersedia?}

    N -->|Tidak| O[Lexical retrieval tetap siap]
    N -->|Ya| P[Gabungkan published knowledge items<br/>dan ready documents]
    P --> Q[Chunk text secara deterministic]
    Q --> R[Generate embedding tiap chunk]
    R --> S[Simpan chunk dan vector<br/>ke PostgreSQL pgvector]
    S --> T{Seluruh chunk lengkap<br/>dan dimensi sesuai?}

    T -->|Tidak| U[Index state = failed]
    T -->|Ya| V[Atomic cutover]
    V --> V1[Retire index aktif sebelumnya]
    V1 --> V2[Activate index baru]
    V2 --> V3[Enable semantic retrieval<br/>dan hapus response cache]
```

Knowledge item manual yang berstatus `published` dibuat menjadi lexical chunk secara idempotent saat retrieval berjalan. Item `draft` tidak ikut dicari. Embedding index tetap didukung sebagai jalur opsional bila provider embedding tersedia.

## 8. Flow RAG dan AI response

```mermaid
flowchart TD
    A([Pertanyaan customer<br/>tidak cocok dengan rule]) --> B{Restricted atau emergency?}
    B -->|Ya| C[Jawaban keselamatan<br/>status handoff]
    B -->|Tidak| B1[Normalisasi imbuhan, typo,<br/>sinonim, dan rujukan context]
    B1 --> B2[Ambil maksimum 5 pesan terakhir<br/>untuk memahami follow-up]
    B2 --> D{Semantic index aktif dan<br/>embedding provider siap?}
    D -->|Ya| E[Semantic retrieval pada active index<br/>vector similarity + text ranking]
    D -->|Tidak| E1[Lexical retrieval PostgreSQL<br/>full-text ranking dan prefix matching]
    E1 --> F
    E --> F{Hasil tersedia dan<br/>score memenuhi batas?}

    F -->|Tidak, ambigu| G0[Ajukan satu pertanyaan klarifikasi<br/>dan tetap bot]
    F -->|Tidak, sumber kosong| G[Fallback: insufficient grounding<br/>catat unanswered question dan tetap bot]
    F -->|Ya| H{Chat provider aktif<br/>dan generation enabled?}
    H -->|Tidak| I[Fallback: generation not ready]
    H -->|Ya| J[Susun prompt persona dari question,<br/>context, dan sumber berlabel K1..Kn]
    J --> K[AI menghasilkan structured answer]
    K --> K1{JSON dan citation valid?}
    K1 -->|Tidak, percobaan pertama| K2[Retry satu kali dengan<br/>aturan output lebih ketat]
    K2 --> L{Output retry valid?}

    L -->|Tidak| M[Fallback: invalid model output]
    L -->|Ya| N[Simpan AI trace, source,<br/>usage, model, dan latency]
    K1 -->|Ya| N

    C --> O[Buat outgoing message dan handoff]
    G0 --> S
    G --> S
    I --> S
    M --> S
    N --> P{Output meminta handoff?}
    P -->|Ya| O
    P -->|Tidak| Q[Buat outgoing AI message]

    O --> R[handlingMode = human]
    R --> S[Durable outbox]
    Q --> S
```

## 9. Flow realtime Inbox

```mermaid
sequenceDiagram
    actor Admin
    participant Web as Next.js Inbox
    participant API as Express API
    participant Hub as API Event Hub
    participant DB as PostgreSQL

    Admin->>Web: Buka halaman Inbox
    Web->>API: GET conversations dan messages
    API->>DB: Query tenant-scoped data
    DB-->>API: Conversation list
    API-->>Web: Initial data

    Web->>API: EventSource /events/stream
    API->>Hub: Subscribe berdasarkan tenant

    Note over API,DB: Inbound baru sudah disimpan ke database
    API->>Hub: Publish message.inbound
    Hub-->>Web: SSE message.inbound
    Web->>API: Refresh conversations dan selected messages
    API->>DB: Query data terbaru
    DB-->>Web: Data inbound terbaru
```

SSE berfungsi sebagai sinyal refresh. Isi conversation dan message tetap dibaca dari PostgreSQL melalui API, bukan dianggap durable hanya karena pernah diterima melalui stream.

## 10. Flow autentikasi dan otorisasi Admin

```mermaid
flowchart TD
    A([Admin membuka aplikasi]) --> B[Ambil CSRF token]
    B --> C[POST login]
    C --> D{Credential valid?}
    D -->|Tidak| E[Login ditolak dan attempt dicatat]
    D -->|Ya| F[Buat admin session<br/>dan secure cookie]
    F --> G[Request ke /api/admin/v1]
    G --> H[Authenticate session]
    H --> I{Permission RBAC sesuai route?}
    I -->|Tidak| J[403 Forbidden]
    I -->|Ya| K[Gunakan tenant dari session]
    K --> L{Request mengubah data?}
    L -->|Ya| M[Validasi CSRF dan tulis audit log]
    L -->|Tidak| N[Jalankan read operation]
    M --> O[Response]
    N --> O
```

## 11. Service dan tanggung jawabnya

| Service      | Teknologi             | Tanggung jawab utama                                                                                              |
| ------------ | --------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `web`        | Next.js + React       | Admin UI, routing halaman, dan rewrite request API                                                                |
| `api`        | Express + Prisma      | Auth/RBAC, contacts, conversations, chatbot routing, AI/RAG, outbox creation, SSE, dan audit                      |
| `worker`     | BullMQ + Prisma       | Outbox delivery, retry/recovery, retention, document processing, lexical chunking, dan optional embedding reindex |
| `whatsapp`   | Baileys               | QR/session WhatsApp, normalisasi inbound, inbound recovery, dan send message                                      |
| `postgres`   | PostgreSQL + pgvector | Durable business state, audit, message history, AI trace, lexical index, dan optional vector index                |
| `redis`      | Redis                 | Datastore BullMQ dan koordinasi job sementara                                                                     |
| `minio`      | MinIO                 | Quarantine, source/extracted knowledge document, dan export object                                                |
| `minio-init` | MinIO Client          | Bootstrap bucket, policy, lifecycle, dan service account                                                          |

## 12. Network dan persistence Docker Compose

```mermaid
flowchart TB
    HOST[Host 127.0.0.1]

    subgraph APPNET[Docker network: app]
        WEB[web :3000]
        API[api :4000]
        WORKER[worker :4010 internal]
        WA[whatsapp :4020 internal]
        MINIO_APP[minio :9000 / :9001]
    end

    subgraph DATANET[Docker network: data - internal]
        POSTGRES[(postgres :5432)]
        REDIS[(redis :6379)]
        MINIO_DATA[(minio storage)]
        INIT[minio-init]
    end

    HOST -->|Published| WEB
    HOST -->|Published local only| API
    HOST -->|Published local only| MINIO_APP

    API --> POSTGRES
    API --> REDIS
    API --> MINIO_DATA
    WORKER --> POSTGRES
    WORKER --> REDIS
    WORKER --> MINIO_DATA
    WA --> POSTGRES
    INIT --> MINIO_DATA

    POSTGRES --- PGVOL[(postgres_data volume)]
    REDIS --- REDISVOL[(redis_data volume)]
    MINIO_DATA --- MINIOVOL[(minio_data volume)]
    WA --- WAVOL[(whatsapp_auth volume)]
```

## 13. Referensi implementasi

- Arsitektur container: [`compose.yaml`](./compose.yaml)
- Next.js API rewrite: [`apps/web/next.config.ts`](./apps/web/next.config.ts)
- Express routes dan inbound orchestration: [`apps/api/src/app.ts`](./apps/api/src/app.ts)
- Durable message repository: [`apps/api/src/messaging-repository.ts`](./apps/api/src/messaging-repository.ts)
- Knowledge retrieval dan grounded answer: [`apps/api/src/knowledge-repository.ts`](./apps/api/src/knowledge-repository.ts)
- WhatsApp Baileys adapter: [`apps/whatsapp/src/adapter.ts`](./apps/whatsapp/src/adapter.ts)
- WhatsApp inbound internal client: [`apps/whatsapp/src/inbound.ts`](./apps/whatsapp/src/inbound.ts)
- Worker orchestration: [`apps/worker/src/index.ts`](./apps/worker/src/index.ts)
- Durable outbox delivery: [`apps/worker/src/outbox.ts`](./apps/worker/src/outbox.ts)
- Knowledge document worker: [`apps/worker/src/knowledge.ts`](./apps/worker/src/knowledge.ts)
- BullMQ queue definitions: [`packages/queue/src/queue.ts`](./packages/queue/src/queue.ts)
- Prisma schema: [`packages/db/prisma/schema.prisma`](./packages/db/prisma/schema.prisma)

---

Dokumen ini menjelaskan runtime flow aplikasi. Roadmap, fase pengembangan, quality gate, dan release gate tetap dijelaskan secara terpisah di [`AI_DEVELOPMENT_FLOW.md`](./AI_DEVELOPMENT_FLOW.md).
