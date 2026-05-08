# AuthCorp — Complete Setup Guide

## Quick Start (Frontend Only — Recommended for Demo)

This mode runs the Next.js frontend with mock data. No Docker, no Python services needed.

### 1. Install dependencies
```bash
npm install
```

### 2. Configure environment
```bash
cp .env.local .env.local.bak  # backup
# Edit .env.local and fill in the values below
```

### 3. Required API keys (all free)

#### A) OpenAI — for AI assistant
1. Go to https://platform.openai.com → Sign up
2. API Keys → Create new secret key
3. Add to `.env.local`:
   ```
   OPENAI_API_KEY=sk-your_key_here
   ```

#### B) Google OAuth — for Google login
1. Go to https://console.cloud.google.com
2. Create project → APIs & Services → Credentials
3. Create Credentials → OAuth 2.0 Client ID
4. Application type: Web app
5. Authorized JavaScript origins: `http://localhost:3000`
6. Authorized redirect URIs: `http://localhost:3000/api/auth/google`
7. Add to `.env.local`:
   ```
   NEXT_PUBLIC_GOOGLE_CLIENT_ID=your_client_id.apps.googleusercontent.com
   ```

#### C) Infura — for blockchain anchoring  
1. Go to https://infura.io → Sign up (free tier)
2. Create new project → Copy Project ID
3. Add to `.env.local`:
   ```
   ETHEREUM_RPC_URL=https://mainnet.infura.io/v3/YOUR_PROJECT_ID
   POLYGON_RPC_URL=https://polygon-mainnet.infura.io/v3/YOUR_PROJECT_ID
   ```

#### D) Security secrets (generate these)
Run this in terminal:
```bash
node -e "console.log('JWT_SECRET=' + require('crypto').randomBytes(64).toString('hex'))"
node -e "console.log('ENCRYPTION_KEY=' + require('crypto').randomBytes(16).toString('hex') + '0000000000000000')"
node -e "console.log('SESSION_SECRET=' + require('crypto').randomBytes(32).toString('hex'))"
```
Paste the output into `.env.local`.

### 4. Run the app
```bash
npm run dev
```
Open http://localhost:3000

**Demo login credentials:**
- Email: `admin@authcorp.com` / Password: `admin123`
- Or use Google OAuth if configured

---

## Full Stack (with Python microservices)

Requires Docker Desktop.

```bash
# Copy env file
cp .env.local .env

# Start everything
docker-compose up -d

# Check logs
docker-compose logs -f frontend
```

Services will be available at:
| Service | Port |
|---|---|
| Frontend | http://localhost:3000 |
| Auth Service | http://localhost:8009 |
| Ingest Service | http://localhost:8001 |
| ELA Detector | http://localhost:8002 |
| Metadata Detector | http://localhost:8003 (mapped from 8004 in compose) |
| Quantization Detector | http://localhost:8004 (mapped from 8003 in compose) |
| Fusion Service | http://localhost:8005 |
| OCR Service | http://localhost:8006 |
| Risk Service | http://localhost:8007 |
| Report Service | http://localhost:8008 |
| Grafana | http://localhost:3001 (admin/authcorp123) |
| Prometheus | http://localhost:9090 |

---

## Architecture

```
Browser → Next.js Frontend (port 3000)
              ↓
         Next.js API Routes (/api/*)
              ↓ (optional — for full stack)
    ┌─────────────────────────────────┐
    │  Python Microservices           │
    │  ├── Ingest (8001)              │
    │  ├── ELA Detector (8002)        │
    │  ├── Metadata Detector (8003)   │
    │  ├── Quantization (8004)        │
    │  ├── OCR Service (8005→8006)    │
    │  ├── Fusion Service (8006→8005) │
    │  ├── Risk Intelligence (8007)   │
    │  ├── Report Generator (8008)    │
    │  └── Auth Service (8009)        │
    └─────────────────────────────────┘
              ↓
    PostgreSQL (5432) + Redis (6379)
```

---

## Project Structure

```
Authcorp-main/
├── src/
│   ├── app/                    # Next.js pages + API routes
│   │   ├── api/
│   │   │   ├── assistant/ask/  # AI assistant (OpenAI-powered)
│   │   │   ├── auth/           # Login, logout, Google OAuth
│   │   │   ├── blockchain/     # Anchoring (Infura)
│   │   │   ├── documents/      # Document analysis
│   │   │   └── threats/        # Threat simulation
│   │   ├── ai-assistant/       # AI chat page
│   │   ├── blockchain/         # Blockchain anchoring page
│   │   ├── monitoring/         # System monitoring page
│   │   └── threat-simulation/  # Threat simulator page
│   ├── components/             # React components
│   └── lib/                    # Utilities (security, DB, etc.)
├── services/
│   ├── auth/                   # Python auth service
│   ├── detectors/
│   │   ├── ela/                # Error Level Analysis
│   │   ├── metadata/           # EXIF metadata analysis
│   │   └── quantization/       # DCT quantization analysis
│   ├── fusion/                 # Multi-detector result fusion
│   ├── ingest/                 # File upload & queue
│   ├── ocr/                    # Tesseract OCR
│   ├── report/                 # PDF report generator
│   └── risk/                   # Risk intelligence & screening
├── sql/                        # PostgreSQL schema
├── .env.local                  # Your environment config (git-ignored)
└── docker-compose.yml          # Full stack Docker setup
```
