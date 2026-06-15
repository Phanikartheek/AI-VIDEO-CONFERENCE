#!/usr/bin/env python3
"""
Generate realistic synthetic engagement training data for FocusMeet.

Creates correlated feature vectors that mimic real meeting behaviour:
  - "focused" participants: high focus_score, moderate mic, some chat
  - "passive" participants: medium focus, low mic, some typing
  - "disengaged": low focus or no face, minimal everything
  - "audio-only": no face, high mic, moderate chat
  - "multitasker": face on but wandering gaze, sporadic chat bursts

Each row gets a self_reported_score that correlates with feature patterns
plus realistic noise (±8 pts), simulating what a real label collection
would produce.

Output: backend/ml/engagement_dataset.csv
"""
import csv
import math
import os
import random
import sys

FEATURE_ORDER = [
    "focus_score", "face_detected", "gaze_variance", "blink_rate",
    "mic_active_pct", "speaking_turns", "words_per_min",
    "typing_events_per_min", "chat_messages_in_window",
    "chat_sentiment_avg", "reaction_count_in_window", "poll_participation",
]

NUM_ROWS = 2000
OUTPUT_DIR = os.path.dirname(os.path.abspath(__file__))
OUTPUT_PATH = os.path.join(OUTPUT_DIR, "engagement_dataset.csv")

random.seed(42)


def clamp(v: float, lo: float = 0.0, hi: float = 100.0) -> float:
    return max(lo, min(hi, v))


def noise(scale: float = 1.0) -> float:
    return random.gauss(0, scale)


def generate_row() -> dict:
    """Generate one feature row + ground-truth engagement label."""
    archetype = random.choices(
        ["focused", "passive", "disengaged", "audio_only", "multitasker"],
        weights=[35, 25, 15, 15, 10],
    )[0]

    if archetype == "focused":
        focus = clamp(78 + noise(12))
        face = True
        gaze_var = max(0, 3.5 + noise(2.5))
        blink = clamp(14 + noise(4), 0, 40)
        mic = clamp(35 + noise(18))
        turns = max(0, int(3 + noise(2)))
        wpm = max(0, 28 + noise(12))
        typing = max(0, 8 + noise(5))
        chat_n = max(0, int(2 + noise(1.5)))
        sentiment = clamp(0.3 + noise(0.25), -1, 1)
        reactions = max(0, int(1.5 + noise(1.2)))
        poll = random.choices([1, 0, -1], weights=[60, 20, 20])[0]
        true_eng = clamp(72 + noise(8))

    elif archetype == "passive":
        focus = clamp(55 + noise(15))
        face = True
        gaze_var = max(0, 8 + noise(4))
        blink = clamp(16 + noise(5), 0, 40)
        mic = clamp(8 + noise(8))
        turns = max(0, int(0.5 + noise(0.8)))
        wpm = max(0, 5 + noise(4))
        typing = max(0, 3 + noise(3))
        chat_n = max(0, int(0.5 + noise(0.8)))
        sentiment = clamp(0.05 + noise(0.2), -1, 1)
        reactions = max(0, int(0.3 + noise(0.6)))
        poll = random.choices([1, 0, -1], weights=[30, 40, 30])[0]
        true_eng = clamp(42 + noise(10))

    elif archetype == "disengaged":
        face = random.random() > 0.4
        focus = clamp(15 + noise(12)) if face else 0
        gaze_var = max(0, 18 + noise(6)) if face else 0
        blink = clamp(10 + noise(5), 0, 40) if face else 0
        mic = clamp(2 + noise(3))
        turns = 0
        wpm = max(0, 1 + noise(2))
        typing = max(0, 0.5 + noise(1))
        chat_n = 0
        sentiment = 0.0
        reactions = 0
        poll = random.choices([0, -1], weights=[30, 70])[0]
        true_eng = clamp(12 + noise(7))

    elif archetype == "audio_only":
        face = False
        focus = 0
        gaze_var = 0
        blink = 0
        mic = clamp(55 + noise(20))
        turns = max(0, int(4 + noise(2)))
        wpm = max(0, 35 + noise(15))
        typing = max(0, 12 + noise(6))
        chat_n = max(0, int(1.5 + noise(1.2)))
        sentiment = clamp(0.15 + noise(0.3), -1, 1)
        reactions = max(0, int(1 + noise(1)))
        poll = random.choices([1, 0, -1], weights=[50, 25, 25])[0]
        true_eng = clamp(58 + noise(12))

    else:  # multitasker
        focus = clamp(40 + noise(15))
        face = True
        gaze_var = max(0, 22 + noise(8))
        blink = clamp(20 + noise(6), 0, 45)
        mic = clamp(15 + noise(12))
        turns = max(0, int(1 + noise(1.2)))
        wpm = max(0, 10 + noise(8))
        typing = max(0, 18 + noise(8))
        chat_n = max(0, int(3 + noise(2)))
        sentiment = clamp(0.1 + noise(0.3), -1, 1)
        reactions = max(0, int(2 + noise(1.5)))
        poll = random.choices([1, 0, -1], weights=[40, 35, 25])[0]
        true_eng = clamp(38 + noise(10))

    return {
        "focus_score": round(focus, 2),
        "face_detected": int(face),
        "gaze_variance": round(gaze_var, 4),
        "blink_rate": round(blink, 2),
        "mic_active_pct": round(mic, 2),
        "speaking_turns": turns,
        "words_per_min": round(wpm, 2),
        "typing_events_per_min": round(typing, 2),
        "chat_messages_in_window": chat_n,
        "chat_sentiment_avg": round(sentiment, 4),
        "reaction_count_in_window": reactions,
        "poll_participation": poll,
        "self_reported_score": round(true_eng, 2),
    }


def main():
    rows = [generate_row() for _ in range(NUM_ROWS)]
    fieldnames = FEATURE_ORDER + ["self_reported_score"]

    with open(OUTPUT_PATH, "w", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)

    print(f"✓ Generated {NUM_ROWS} rows → {OUTPUT_PATH}")

    # Quick stats
    scores = [r["self_reported_score"] for r in rows]
    print(f"  Score range: {min(scores):.1f} – {max(scores):.1f}")
    print(f"  Mean: {sum(scores)/len(scores):.1f}")
    face_on = sum(1 for r in rows if r["face_detected"])
    print(f"  Face-on: {face_on}/{NUM_ROWS} ({face_on/NUM_ROWS*100:.0f}%)")


if __name__ == "__main__":
    main()
