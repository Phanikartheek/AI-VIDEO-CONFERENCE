#!/usr/bin/env python3
"""
Export engagement labels CSV from the database / Redis.

Queries all stored engagement data for finished meetings and writes
a CSV with the full 12-feature vector + self_reported_score per row.

In production this runs against real Postgres/Redis data. For the
training pipeline, generate_synthetic_data.py creates the dataset
directly (this script is the template for real data collection).

Usage:
    python -m backend.ml.export_labels
"""
import csv
import os
import sys

THIS_DIR = os.path.dirname(os.path.abspath(__file__))

FEATURE_ORDER = [
    "focus_score", "face_detected", "gaze_variance", "blink_rate",
    "mic_active_pct", "speaking_turns", "words_per_min",
    "typing_events_per_min", "chat_messages_in_window",
    "chat_sentiment_avg", "reaction_count_in_window", "poll_participation",
]


def main():
    """
    Template for real label export.

    In production, this would:
    1. Query all finished meetings from Postgres
    2. For each participant in each meeting:
       a. For each 30-second window in the meeting duration:
          - Call extract_features(meeting_id, user_id, window_start, window_end)
          - Look up self-reported engagement label if available
          - Write the 12 features + label to the CSV
    3. Output engagement_labels.csv

    For now, the synthetic generator (generate_synthetic_data.py) creates
    the dataset directly, and this file documents the real-data schema.
    """
    output_path = os.path.join(THIS_DIR, "engagement_labels.csv")

    print("export_labels.py — Label Export Template")
    print()
    print("This script documents the schema for real-data collection.")
    print("For training, use generate_synthetic_data.py instead.")
    print()
    print(f"Feature columns ({len(FEATURE_ORDER)}):")
    for i, f in enumerate(FEATURE_ORDER, 1):
        print(f"  {i:2d}. {f}")
    print(f"  + self_reported_score (target)")
    print()
    print("To collect real labels:")
    print("  1. Add a periodic 'How engaged are you?' prompt to the UI")
    print("  2. Store responses as (meeting_id, user_id, timestamp, score)")
    print("  3. For each response, call extract_features() for the")
    print("     preceding 30-second window")
    print("  4. Write to CSV with the same column order as FEATURE_ORDER")
    print()
    print(f"Output path: {output_path}")


if __name__ == "__main__":
    main()
