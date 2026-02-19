# The World's Hardest Job Interview

A voice-based mock interview experience where candidates face R.J. Carrington III -- a fictional, impossibly demanding CEO who has conducted 40,000 interviews and hired exactly 12 people. Upload your CV, survive the interview, and receive a brutally honest assessment with an ELO rating.

## Demo

**Live application:** [interview.taluna.io](https://interview.taluna.io)

## Tech Stack

- **Framework:** Next.js 16 (App Router)
- **Language:** TypeScript
- **UI:** React 19, Tailwind CSS v4, Framer Motion
- **Voice AI:** ElevenLabs Conversational AI (real-time voice agent)
- **Scoring AI:** Anthropic Claude (interview transcript analysis)
- **Document Parsing:** pdf-parse, mammoth (CV extraction from PDF/DOCX)
- **Icons:** Lucide React
- **Testing:** Vitest, Testing Library

## Prerequisites

- Node.js >= 20
- npm >= 10
- An [ElevenLabs](https://elevenlabs.io) account with a configured conversational agent
- An [Anthropic](https://console.anthropic.com) API key

## Getting Started

```bash
# Clone the repository
git clone https://github.com/spectrum-search/worlds-hardest-interview.git
cd worlds-hardest-interview

# Install dependencies
npm install

# Copy the example environment file and fill in your keys
cp .env.example .env.local

# Start the development server
npm run dev
```

The app will be available at `http://localhost:3000`.

## Environment Variables

| Variable | Description |
|----------|-------------|
| `ANTHROPIC_API_KEY` | Anthropic API key for Claude (used server-side to score interview transcripts) |
| `ELEVENLABS_API_KEY` | ElevenLabs API key (used server-side to fetch conversation transcripts) |
| `NEXT_PUBLIC_ELEVENLABS_AGENT_ID` | ElevenLabs agent ID for the R.J. Carrington III voice character (client-side) |

See `.env.example` for the template.

## Project Structure

```
worlds-hardest-interview/
├── src/
│   ├── app/
│   │   ├── api/
│   │   │   ├── conversations/[id]/  # Proxy to fetch ElevenLabs transcripts
│   │   │   ├── score-interview/     # Claude-powered interview scoring endpoint
│   │   │   └── upload/              # CV upload and text extraction (PDF/DOCX)
│   │   ├── globals.css              # Design tokens and base styles
│   │   ├── layout.tsx               # Root layout with font setup
│   │   └── page.tsx                 # Main wizard orchestrator
│   ├── components/
│   │   ├── LandingStep.tsx          # Step 1: Character introduction
│   │   ├── UploadCvStep.tsx         # Step 2: CV upload (optional)
│   │   ├── InterviewStep.tsx        # Step 3: Live voice interview
│   │   ├── AnalysisStep.tsx         # Step 4: Scoring in progress
│   │   ├── ResultsStep.tsx          # Step 5: ELO rating and feedback
│   │   ├── SocialShare.tsx          # Share results on social media
│   │   └── StepIndicator.tsx        # Progress indicator bar
│   ├── hooks/
│   │   ├── useInterviewWizard.ts    # Central wizard state management
│   │   └── useReducedMotion.ts      # Accessibility: reduced motion detection
│   └── lib/
│       ├── constants.ts             # App-wide constants and tier definitions
│       ├── elevenlabs.ts            # ElevenLabs API client utilities
│       ├── motion.ts                # Framer Motion presets and helpers
│       └── types.ts                 # Shared TypeScript type definitions
├── elevenlabs-agent-prompt.md       # Voice agent system prompt (R.J. Carrington III)
├── .env.example                     # Environment variable template
├── package.json
├── tsconfig.json
└── vitest.config.ts
```

## Scripts

| Script | Description |
|--------|-------------|
| `npm run dev` | Start the Next.js development server |
| `npm run build` | Create a production build |
| `npm start` | Run the production server |
| `npm test` | Run tests with Vitest |
| `npm run test:watch` | Run tests in watch mode |
| `npm run lint` | Lint the codebase with ESLint |

## How It Works

1. **Landing** -- The candidate meets R.J. Carrington III through a theatrical introduction
2. **Upload CV** -- Optionally upload a PDF or DOCX CV (text is extracted server-side)
3. **Interview** -- A real-time voice conversation with the AI interviewer via ElevenLabs
4. **Analysis** -- The transcript is sent to Claude for scoring across five dimensions
5. **Results** -- An ELO rating (100--3000), tier classification, HIRED/NOT HIRED verdict, dimension breakdowns, and chess-style moment annotations

The scoring system evaluates five dimensions: Articulation, Substance, Evidence, Composure, and Curiosity. Each receives a 1--10 score with feedback written in the boss's voice. Key moments from the interview are annotated with chess-style symbols (!! for brilliant through ??? for blunder).
