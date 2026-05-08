# AuthCorp — AI-Powered Document Verification Platform

<div align="center">

![AuthCorp](https://img.shields.io/badge/AuthCorp-AI%20Document%20Verification-blue?style=for-the-badge)
![Next.js](https://img.shields.io/badge/Next.js-14-black?style=for-the-badge&logo=next.js)
![TypeScript](https://img.shields.io/badge/TypeScript-5-blue?style=for-the-badge&logo=typescript)
![OpenAI](https://img.shields.io/badge/OpenAI-GPT--4o--mini-green?style=for-the-badge&logo=openai)
![Vercel](https://img.shields.io/badge/Deployed-Vercel-black?style=for-the-badge&logo=vercel)

**Live Demo:** [authcorp.vercel.app](https://authcorp.vercel.app)

</div>

---

## What is AuthCorp?

AuthCorp is a next-generation forensic document verification platform that uses AI vision, blockchain anchoring, and multi-detector forensic analysis to detect forged, tampered, and AI-generated documents in real time.

Built as a Final Year B.Tech Project.

---

## Features

| Feature | Description |
|---------|-------------|
| 🔍 **AI Forensic Analysis** | GPT-4o-mini Vision analyses every uploaded document — returns authenticity score, heatmap regions, metadata clues |
| 📸 **Live AR Document Scanner** | WebRTC camera feed + live frame capture + instant AI analysis with AR overlay boxes |
| 🔗 **Blockchain Anchoring** | Anchors document SHA-256 hash to Ethereum/Polygon via Infura — creates tamper-evident timestamp proof |
| 🗺️ **Tampering Heatmap** | Visual grid showing suspicious regions color-coded by type (text modification, copy-move, compression anomaly) |
| 📋 **Metadata Forensics** | EXIF data extraction, editing software detection, font inconsistency analysis |
| 🤖 **AI Forensic Assistant** | OpenAI GPT-3.5-turbo powered chat with full document context awareness |
| 🛡️ **Risk Intelligence** | Sanctions screening, fraud pattern detection, risk scoring with evidence trail |
| 📊 **Real-time Dashboard** | Live deepfake counter, authenticity rate, recent activity feed |
| 🔐 **Secure Auth** | JWT sessions + Google OAuth 2.0 |
| 🚨 **Threat Simulation** | Test the system with simulated attack scenarios |

---

## Tech Stack

```
Frontend:    Next.js 14 · React 18 · TypeScript · Tailwind CSS · Framer Motion
AI:          OpenAI GPT-4o-mini Vision · GPT-3.5-turbo
Blockchain:  Ethereum + Polygon via Infura JSON-RPC
Auth:        JWT · Google OAuth 2.0
Database:    PostgreSQL (Neon) · Redis (Upstash)
Deployment:  Vercel (serverless)
Camera:      WebRTC · HTML5 Canvas API
```

---

## Quick Start

### 1. Clone and install
```bash
git clone https://github.com/YOUR_USERNAME/authcorp.git
cd authcorp
npm install
```

### 2. Set up environment variables
```bash
cp .env.local .env.local.bak
```

Edit `.env.local` with your API keys:

```env
# Security (generate with: node -e "console.log(require('crypto').randomBytes(64).toString('hex'))")
JWT_SECRET=your_64_char_secret
ENCRYPTION_KEY=your_32_char_key
SESSION_SECRET=your_random_secret

# Google OAuth — console.cloud.google.com
NEXT_PUBLIC_GOOGLE_CLIENT_ID=your_client_id.apps.googleusercontent.com

# OpenAI — platform.openai.com (free $5 credit)
OPENAI_API_KEY=sk-your_key

# Infura/MetaMask — developer.metamask.io (free tier)
ETHEREUM_RPC_URL=https://mainnet.infura.io/v3/YOUR_PROJECT_ID
POLYGON_RPC_URL=https://polygon-mainnet.infura.io/v3/YOUR_PROJECT_ID

# Database — neon.tech (free tier)
DATABASE_URL=postgresql://user:pass@host/authcorp?sslmode=require

# Redis — upstash.com (free tier)
REDIS_URL=rediss://default:password@host.upstash.io:6379

# Feature flags
ENABLE_BLOCKCHAIN_ANCHORING=true
ENABLE_AI_ASSISTANT=true
ENABLE_REAL_TIME_MONITORING=true
NODE_ENV=development
NEXT_PUBLIC_APP_URL=http://localhost:3000
NEXT_PUBLIC_API_URL=http://localhost:3000/api
```

### 3. Run
```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

**Demo credentials:** `admin@authcorp.com` / `admin123`

---

## Free API Keys Setup

| Service | URL | Free Tier |
|---------|-----|-----------|
| OpenAI | [platform.openai.com](https://platform.openai.com) | $5 free credit |
| Google OAuth | [console.cloud.google.com](https://console.cloud.google.com) | Free forever |
| Infura (Blockchain) | [developer.metamask.io](https://developer.metamask.io) | 3M requests/month |
| Neon (PostgreSQL) | [neon.tech](https://neon.tech) | 512MB free |
| Upstash (Redis) | [upstash.com](https://upstash.com) | 500k commands/month |

---

## Project Structure

```
authcorp/
├── src/
│   ├── app/
│   │   ├── api/
│   │   │   ├── assistant/ask/      # AI assistant (OpenAI GPT-3.5)
│   │   │   ├── auth/               # Login, logout, Google OAuth
│   │   │   ├── blockchain/         # Blockchain anchoring (Infura)
│   │   │   └── documents/
│   │   │       ├── analyze/        # Document analysis pipeline
│   │   │       └── vision-analyze/ # GPT-4o-mini Vision API
│   │   ├── ar-forensics/           # Live document scanner page
│   │   ├── login/                  # Auth page
│   │   └── page.tsx                # Main dashboard
│   ├── components/
│   │   ├── forensics-provider.tsx  # Global analysis state
│   │   ├── forensic-analysis.tsx   # Forensic tabs (Overview/Heatmap/Metadata/Text)
│   │   ├── risk-intelligence.tsx   # Risk screening
│   │   ├── dashboard.tsx           # Main dashboard
│   │   ├── document-upload.tsx     # Upload interface
│   │   ├── futuristic-features.tsx # AR Scanner, Blockchain, AI Assistant
│   │   └── header.tsx              # Live stats header
│   └── lib/
│       ├── blockchain-config.ts    # Network definitions
│       ├── document-classifier.ts  # Document type detection
│       ├── security.ts             # JWT, encryption, audit logging
│       └── ai-detection.ts         # AI detection engine
├── services/                       # Python microservices (Docker)
│   ├── detectors/ela/              # Error Level Analysis
│   ├── detectors/metadata/         # EXIF metadata analysis
│   ├── detectors/quantization/     # DCT quantization analysis
│   ├── fusion/                     # Multi-detector result fusion
│   ├── ingest/                     # File ingestion service
│   ├── ocr/                        # Tesseract OCR
│   └── risk/                       # Risk intelligence service
├── sql/init.sql                    # PostgreSQL schema
├── docker-compose.yml              # Full stack Docker setup
└── vercel.json                     # Vercel deployment config
```

---

## How Document Analysis Works

```
User uploads document
        ↓
FileReader converts to base64
        ↓
GPT-4o-mini Vision API analyses image
        ↓
Returns: authenticity score, document type,
         heatmap regions, metadata clues,
         extracted text, reasoning
        ↓
Results displayed across 5 tabs:
Overview · Heatmap · Metadata · Text Analysis · Comparison
        ↓
If score < 60% → Deepfake counter increments
If blocked → Security alert shown
        ↓
Optional: Anchor SHA-256 hash to blockchain
```

---

## Blockchain Anchoring

AuthCorp uses a **witness-based anchoring** approach:

1. SHA-256 hash of document computed client-side
2. `eth_blockNumber` called on Infura to get latest block
3. `eth_getBlockByNumber` fetches block hash and timestamp
4. Deterministic anchor ID created: `SHA256(network:docHash:blockHash)`
5. Block number verifiable on [Etherscan](https://etherscan.io) / [Polygonscan](https://polygonscan.com)

This proves the document existed and was verified at a specific point in time without storing any personal data on-chain.

---

## Deployment

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/YOUR_USERNAME/authcorp)

Add all environment variables in Vercel → Project → Settings → Environment Variables, then deploy.

---

## Demo Credentials

| Role | Email | Password |
|------|-------|----------|
| Admin | admin@authcorp.com | admin123 |
| Investigator | investigator@authcorp.com | investigator123 |
| Analyst | analyst@authcorp.com | analyst123 |

Or use **Continue with Google** (after Google OAuth setup).

---

## License

MIT License — Built for educational purposes as a B.Tech Final Year Project.