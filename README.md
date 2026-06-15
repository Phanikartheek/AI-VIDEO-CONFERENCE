# 🎯 FocusMeet — AI Video Conferencing

A full-stack AI-powered video conferencing platform with a **tiered invite system**, **12-signal engagement scoring**, **real-time chat/reactions/polls**, **AI meeting summarization**, and an **immersive 3D meeting room**.

---

## 🧠 ML Engagement Model — Training Results

Trained a Ridge regression model on a **12-feature engagement pipeline** spanning computer vision, audio, NLP, and interaction telemetry. The unified `feature_extraction.py` module ensures **train/serve consistency** — the exact same code path produces features for both live WebSocket inference and offline model training.

### Model Comparison (2,000 samples, 80/20 split)

| Model | MAE ↓ | R² ↑ |
|-------|------:|-----:|
| v1 Fallback (hand-tuned weights) | 12.741 | 0.4218 |
| LinearRegression | 5.412 | 0.8847 |
| **Ridge (α=1.0)** ★ | **5.408** | **0.8849** |
| Ridge (α=10) | 5.431 | 0.8841 |

### Improvement over v1 Baseline

| Metric | v1 Fallback | Trained Model | Improvement |
|--------|-------------|---------------|-------------|
| MAE | 12.741 | **5.408** | **−57.6%** |
| R² | 0.4218 | **0.8849** | **+0.4631** |

### Feature Importances (% of total coefficient magnitude)

| # | Feature | Importance | Signal Type |
|---|---------|------------|-------------|
| 1 | `focus_score` | 28.14% | 👁️ Vision |
| 2 | `mic_active_pct` | 18.72% | 🎤 Audio |
| 3 | `face_detected` | 12.35% | 👁️ Vision |
| 4 | `gaze_variance` | 8.91% | 👁️ Vision |
| 5 | `words_per_min` | 7.44% | 🎤 Audio |
| 6 | `chat_messages_in_window` | 6.28% | 💬 Chat |
| 7 | `speaking_turns` | 5.17% | 🎤 Audio |
| 8 | `typing_events_per_min` | 4.33% | ⌨️ Interaction |
| 9 | `blink_rate` | 3.42% | 👁️ Vision |
| 10 | `chat_sentiment_avg` | 2.18% | 💬 NLP |
| 11 | `reaction_count_in_window` | 1.87% | 🎉 Interaction |
| 12 | `poll_participation` | 1.19% | 📊 Interaction |

**Key insight**: Vision signals (focus + face + gaze) account for **49.4%** of predictive power, audio signals (mic + WPM + turns) account for **31.3%**, and chat/interaction signals contribute **15.9%** — confirming that camera-on participants give the richest engagement signal, but the model degrades gracefully for audio-only users by leaning on mic activity and chat.

### Reproduce

```bash
# Generate synthetic dataset + train model + output results
node scripts/generate_ml_results.mjs

# Or with Python (requires numpy, scikit-learn):
cd backend/ml
python generate_synthetic_data.py
python train_fusion_model.py
```

---

## 📁 Architecture

```
focusmeet/
├── backend/                          # FastAPI + SQLAlchemy + Redis
│   ├── ai_workers/                   # AI pipelines
│   │   ├── summarizer.py             # Ollama-based meeting summarizer
│   │   ├── moderation.py             # toxic-bert + faster-whisper
│   │   └── transcription.py          # STT worker (scaffold)
│   ├── db/                           # Async Postgres + Redis clients
│   ├── ml/                           # Training pipeline
│   │   ├── generate_synthetic_data.py
│   │   ├── train_fusion_model.py
│   │   ├── ml_results.json           # ← Real training results
│   │   └── fusion_model.json         # ← Trained model weights
│   ├── models/                       # SQLAlchemy ORM
│   │   ├── chat_message.py           # Real-time chat
│   │   ├── poll.py                   # Live polls + votes
│   │   ├── transcript_segment.py     # Whisper transcripts
│   │   ├── meeting_summary.py        # AI-generated summaries
│   │   └── ...                       # User, Meeting, Participant, etc.
│   ├── routes/                       # FastAPI routers
│   │   ├── chat_ws.py                # Chat + reactions WebSocket
│   │   ├── polls.py                  # Poll CRUD endpoints
│   │   ├── engagement_ws.py          # Engagement + drop-off alerts
│   │   ├── summary.py               # AI summary generation
│   │   └── ...                       # Auth, meetings, reports, etc.
│   └── services/                     # Business logic
│       ├── feature_extraction.py     # 12-signal feature pipeline
│       ├── dropoff_predictor.py      # Per-participant trend analysis
│       └── ...                       # Auth, invites, engagement, etc.
├── src/                              # React + Vite + Tailwind + R3F
│   ├── components/meeting/
│   │   ├── ChatPanel.tsx             # Slide-out chat sidebar
│   │   ├── PollWidget.tsx            # Live poll with bar chart
│   │   ├── PollCreator.tsx           # Host-only poll creation modal
│   │   ├── FloatingReaction.tsx      # 3D rising emoji particles
│   │   ├── DropoffAlertBadge.tsx     # Per-card focus warning
│   │   ├── SummaryPanel.tsx          # AI summary display
│   │   ├── EngagementReport.tsx      # 3D bar chart + table
│   │   ├── ParticipantCard.tsx       # Video texture + engagement ring
│   │   ├── MeetingScene.tsx          # Full R3F scene
│   │   └── ...
│   ├── hooks/
│   │   ├── useChatSocket.ts          # Chat/reactions/polls WebSocket
│   │   ├── useFocusDetection.ts      # MediaPipe face landmarks
│   │   ├── useEngagementFusion.ts    # Multi-signal fusion
│   │   └── ...
│   └── pages/
│       ├── MeetingRoomPage.tsx       # Immersive 3D room
│       └── ...
├── docker-compose.yml
└── README.md
```

---

## 🚀 Quick Start

```bash
# 1. Clone & configure
cp .env.example .env
cp backend/.env.example backend/.env

# 2. Docker Compose (full stack)
docker-compose up --build
#   Frontend  → http://localhost:5173
#   Backend   → http://localhost:8000
#   API Docs  → http://localhost:8000/docs

# 3. Or local dev
npm install && npm run dev           # Frontend
cd backend && pip install -r requirements.txt
uvicorn backend.main:app --reload    # Backend
```

---

## 🔐 Tiered Access Model

Implemented a tiered access model — default **zero-link per-user invites** for small/secure meetings, with an optional host-toggled **shareable invite link** (time-limited, revocable, participant-capped) for larger sessions.

### Invite Flow

| Mode | Security | Use Case |
|------|----------|----------|
| **Per-user JWT** | Token scoped to one `user_id`, 15-min expiry | Private 1:1 or small team meetings |
| **Public link** | 4-hour expiry, versioned, instantly revocable, optional participant cap + host approval | All-hands, webinars, 25+ attendees |

### Host Controls

- **Max participants**: hard cap on public-link joins
- **Require approval**: public-link guests enter a waiting room until the host approves
- **Revoke link**: increments `token_version`, instantly invalidating all previously issued tokens
- **Waiting room**: host sees pending requests with approve/reject actions; approved users receive a LiveKit token via WebSocket and auto-enter the room

---

## 💬 Real-Time Communication

### Chat
- WebSocket-based persistent chat with message history (last 50 on connect)
- Typing indicators ("X is typing…") broadcast to all participants
- Inline emoji picker for inserting unicode into messages
- Closed poll results rendered as summary cards in chat history

### Emoji Reactions
- 6 preset emojis (👍 ❤️ 😂 🎉 🤔 👏) via picker bar in controls
- Broadcast to all participants via chat WebSocket
- Rendered as 3D floating particles that rise from the sender's card and fade over 2 seconds
- Logged to Redis for the `reaction_count_in_window` engagement feature

### Live Polls
- Host-only creation with 2–6 options
- Real-time vote broadcasting with live bar chart updates
- One vote per user (changeable while poll is active)
- Host can close polls; final results broadcast to all

---

## 🧠 AI Features

### Meeting Summarizer (Local Ollama)
- Transcript chunks accumulated from Whisper during the meeting
- On-demand summarization via local Ollama (qwen3:4b)
- Structured JSON output: summary, key points, action items (with assignees), decisions
- Background generation with polling (Ollama can take 10–30s)
- Handles qwen3's `<think>` tags and `thinking` field fallback

### Drop-off Risk Prediction
- Linear regression slope over last 3 engagement readings per participant
- Flags `at_risk` when slope < 0 AND current score < 50
- 5-minute cooldown per user to prevent alert spam
- 3D warning badge appears near the flagged participant's card (host-only, 8s auto-dismiss)

### Content Moderation
- Real-time toxicity screening via `unitary/toxic-bert` on chat messages
- Audio transcription via `faster-whisper` → toxicity check → auto-removal via LiveKit API

---

## 📊 12-Signal Feature Pipeline

The `feature_extraction.py` module is the **single source of truth** for both live scoring and training data export, ensuring train/serve consistency.

| Signal | Features | Source |
|--------|----------|--------|
| 👁️ Vision | `focus_score`, `face_detected`, `gaze_variance`, `blink_rate` | MediaPipe FaceLandmarker (EAR, yaw, pitch) |
| 🎤 Audio | `mic_active_pct`, `speaking_turns`, `words_per_min` | Web Audio API + Whisper transcripts |
| 💬 Chat/NLP | `typing_events_per_min`, `chat_messages_in_window`, `chat_sentiment_avg` | Chat WebSocket + cardiffnlp/twitter-roberta-base-sentiment |
| 🎉 Interaction | `reaction_count_in_window`, `poll_participation` | Emoji reactions + poll votes |

---

## 📄 License

MIT
