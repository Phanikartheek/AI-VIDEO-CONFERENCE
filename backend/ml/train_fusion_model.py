#!/usr/bin/env python3
"""
Train the FocusMeet engagement fusion model.

Pure-Python implementation (no numpy/sklearn required) so it runs
in any environment. Trains LinearRegression + Ridge via closed-form
normal equations, evaluates MAE/R², computes feature importances,
and writes results.

Usage:
    cd backend/ml && python train_fusion_model.py
"""
import csv
import json
import math
import os
import random
import sys

THIS_DIR = os.path.dirname(os.path.abspath(__file__))
DATASET_PATH = os.path.join(THIS_DIR, "engagement_dataset.csv")
MODEL_PATH = os.path.join(THIS_DIR, "fusion_model.json")
RESULTS_PATH = os.path.join(THIS_DIR, "ml_results.json")

FEATURE_ORDER = [
    "focus_score", "face_detected", "gaze_variance", "blink_rate",
    "mic_active_pct", "speaking_turns", "words_per_min",
    "typing_events_per_min", "chat_messages_in_window",
    "chat_sentiment_avg", "reaction_count_in_window", "poll_participation",
]

TARGET_COL = "self_reported_score"
TEST_SIZE = 0.2
RANDOM_STATE = 42

# ═══════════════════════════════════════════════════════════
# Pure-Python linear algebra helpers
# ═══════════════════════════════════════════════════════════

def mat_zeros(rows, cols):
    return [[0.0]*cols for _ in range(rows)]

def mat_transpose(A):
    rows, cols = len(A), len(A[0])
    return [[A[r][c] for r in range(rows)] for c in range(cols)]

def mat_mul(A, B):
    ra, ca = len(A), len(A[0])
    rb, cb = len(B), len(B[0])
    assert ca == rb
    C = mat_zeros(ra, cb)
    for i in range(ra):
        for j in range(cb):
            s = 0.0
            for k in range(ca):
                s += A[i][k] * B[k][j]
            C[i][j] = s
    return C

def mat_vec_mul(A, v):
    return [sum(A[i][j]*v[j] for j in range(len(v))) for i in range(len(A))]

def mat_add_diag(A, lam):
    """Return A + lambda*I (for Ridge)."""
    n = len(A)
    R = [row[:] for row in A]
    for i in range(n):
        R[i][i] += lam
    return R

def mat_inverse(M):
    """Gauss-Jordan inverse for small matrices."""
    n = len(M)
    aug = [M[i][:] + [1.0 if i==j else 0.0 for j in range(n)] for i in range(n)]
    for col in range(n):
        # Pivot
        max_row = max(range(col, n), key=lambda r: abs(aug[r][col]))
        aug[col], aug[max_row] = aug[max_row], aug[col]
        piv = aug[col][col]
        if abs(piv) < 1e-12:
            piv = 1e-12
        for j in range(2*n):
            aug[col][j] /= piv
        for row in range(n):
            if row == col:
                continue
            factor = aug[row][col]
            for j in range(2*n):
                aug[row][j] -= factor * aug[col][j]
    return [aug[i][n:] for i in range(n)]

def ols_fit(X_rows, y_vec, ridge_lambda=0.0):
    """Fit linear regression: w = (X^T X + λI)^{-1} X^T y.
    X_rows includes a bias column (1s prepended).
    Returns weight vector including bias as w[0].
    """
    n = len(X_rows)
    p = len(X_rows[0])
    Xt = mat_transpose(X_rows)
    XtX = mat_mul(Xt, X_rows)
    if ridge_lambda > 0:
        XtX = mat_add_diag(XtX, ridge_lambda)
    XtX_inv = mat_inverse(XtX)
    # X^T y
    Xty = [sum(Xt[j][i]*y_vec[i] for i in range(n)) for j in range(p)]
    w = mat_vec_mul(XtX_inv, Xty)
    return w

def predict(X_rows, w):
    return [sum(X_rows[i][j]*w[j] for j in range(len(w))) for i in range(len(X_rows))]

def mae(y_true, y_pred):
    return sum(abs(a-b) for a,b in zip(y_true, y_pred)) / len(y_true)

def r2(y_true, y_pred):
    mean_y = sum(y_true) / len(y_true)
    ss_res = sum((a-b)**2 for a,b in zip(y_true, y_pred))
    ss_tot = sum((a-mean_y)**2 for a in y_true)
    return 1.0 - ss_res / ss_tot if ss_tot > 0 else 0.0

def clamp_list(vals, lo=0.0, hi=100.0):
    return [max(lo, min(hi, v)) for v in vals]


# ═══════════════════════════════════════════════════════════
# v1 fallback scoring (from feature_extraction.py)
# ═══════════════════════════════════════════════════════════

def v1_fallback_score(feat):
    focus = feat.get("focus_score", 0)
    face = bool(feat.get("face_detected", 0))
    mic = feat.get("mic_active_pct", 0)
    wpm = feat.get("words_per_min", 0)
    typing = feat.get("typing_events_per_min", 0)
    chat_n = feat.get("chat_messages_in_window", 0)
    reactions = feat.get("reaction_count_in_window", 0)
    chat_signal = min(chat_n * 25, 100)
    reaction_signal = min(reactions * 20, 100)
    wpm_norm = min(wpm / 2.0, 100)
    typing_norm = min(typing / 0.5, 100)
    if face:
        return max(0, min(100, 0.6*focus + 0.2*mic + 0.1*chat_signal + 0.1*reaction_signal))
    else:
        return max(0, min(100, 0.4*mic + 0.2*wpm_norm + 0.2*chat_signal + 0.1*typing_norm + 0.1*reaction_signal))


# ═══════════════════════════════════════════════════════════
# Main
# ═══════════════════════════════════════════════════════════

def main():
    # Generate dataset if not exists
    if not os.path.exists(DATASET_PATH):
        print("Dataset not found. Generating synthetic data...")
        # Import and run the generator
        gen_path = os.path.join(THIS_DIR, "generate_synthetic_data.py")
        exec(open(gen_path).read(), {"__name__": "__main__"})

    # Load dataset
    rows = []
    with open(DATASET_PATH, newline="") as f:
        reader = csv.DictReader(f)
        for row in reader:
            rows.append(row)

    # Build matrices
    n = len(rows)
    p = len(FEATURE_ORDER)

    # Feature standardization (mean=0, std=1) for stable regression
    raw_X = []
    y_all = []
    for row in rows:
        vec = []
        for col in FEATURE_ORDER:
            val = float(row[col])
            if col == "poll_participation" and val < 0:
                val = 0.0
            vec.append(val)
        raw_X.append(vec)
        y_all.append(float(row[TARGET_COL]))

    # Compute per-feature mean/std
    means = [0.0]*p
    stds = [0.0]*p
    for j in range(p):
        vals = [raw_X[i][j] for i in range(n)]
        m = sum(vals) / n
        means[j] = m
        v = sum((x - m)**2 for x in vals) / n
        stds[j] = math.sqrt(v) if v > 0 else 1.0

    # Standardize + add bias column
    X_all = []
    for i in range(n):
        row_std = [1.0]  # bias
        for j in range(p):
            row_std.append((raw_X[i][j] - means[j]) / stds[j])
        X_all.append(row_std)

    # Train/test split
    random.seed(RANDOM_STATE)
    indices = list(range(n))
    random.shuffle(indices)
    split = int(n * (1 - TEST_SIZE))
    train_idx = indices[:split]
    test_idx = indices[split:]

    X_train = [X_all[i] for i in train_idx]
    y_train = [y_all[i] for i in train_idx]
    X_test = [X_all[i] for i in test_idx]
    y_test = [y_all[i] for i in test_idx]

    print(f"\n{'='*64}")
    print(f"  FocusMeet Engagement Model — Training Pipeline")
    print(f"{'='*64}")
    print(f"  Dataset: {n} samples, {p} features")
    print(f"  Target:  self_reported_score (0–100)")
    print(f"  Split:   {len(train_idx)} train / {len(test_idx)} test")
    print(f"{'='*64}\n")

    # Train models
    results = {}

    # 1. Linear Regression (OLS)
    w_ols = ols_fit(X_train, y_train, ridge_lambda=0.0)
    y_pred_ols = clamp_list(predict(X_test, w_ols))
    mae_ols = mae(y_test, y_pred_ols)
    r2_ols = r2(y_test, y_pred_ols)
    results["LinearRegression"] = {"mae": round(mae_ols, 3), "r2": round(r2_ols, 4)}
    print(f"  LinearRegression")
    print(f"    MAE:  {mae_ols:.3f}")
    print(f"    R²:   {r2_ols:.4f}\n")

    # 2. Ridge (λ=1.0)
    w_ridge = ols_fit(X_train, y_train, ridge_lambda=1.0)
    y_pred_ridge = clamp_list(predict(X_test, w_ridge))
    mae_ridge = mae(y_test, y_pred_ridge)
    r2_ridge = r2(y_test, y_pred_ridge)
    results["Ridge (α=1.0)"] = {"mae": round(mae_ridge, 3), "r2": round(r2_ridge, 4)}
    print(f"  Ridge (α=1.0)")
    print(f"    MAE:  {mae_ridge:.3f}")
    print(f"    R²:   {r2_ridge:.4f}\n")

    # 3. Ridge (λ=10)
    w_r10 = ols_fit(X_train, y_train, ridge_lambda=10.0)
    y_pred_r10 = clamp_list(predict(X_test, w_r10))
    mae_r10 = mae(y_test, y_pred_r10)
    r2_r10 = r2(y_test, y_pred_r10)
    results["Ridge (α=10)"] = {"mae": round(mae_r10, 3), "r2": round(r2_r10, 4)}
    print(f"  Ridge (α=10)")
    print(f"    MAE:  {mae_r10:.3f}")
    print(f"    R²:   {r2_r10:.4f}\n")

    # Pick best
    best_name = max(results, key=lambda k: results[k]["r2"])
    best_w = {"LinearRegression": w_ols, "Ridge (α=1.0)": w_ridge, "Ridge (α=10)": w_r10}[best_name]

    print(f"{'─'*64}")
    print(f"  ★ Best model: {best_name}")
    print(f"    MAE = {results[best_name]['mae']:.3f}   R² = {results[best_name]['r2']:.4f}")
    print(f"{'─'*64}\n")

    # Feature importances (absolute standardized coefficients)
    coef_abs = [abs(best_w[j+1]) for j in range(p)]  # skip bias at [0]
    total_imp = sum(coef_abs) if sum(coef_abs) > 0 else 1
    importances = {}
    for j, feat in enumerate(FEATURE_ORDER):
        importances[feat] = round(coef_abs[j] / total_imp * 100, 2)

    sorted_imp = sorted(importances.items(), key=lambda x: x[1], reverse=True)

    print("  Feature Importances (% of total |coef|):")
    print(f"  {'Feature':<30} {'Importance':>10}")
    print(f"  {'─'*42}")
    for feat, imp in sorted_imp:
        bar_len = int(imp / 2)
        bar = "█" * bar_len + "░" * max(0, 25 - bar_len)
        print(f"  {feat:<30} {imp:>8.2f}%  {bar}")
    print()

    # v1 fallback baseline
    print(f"{'─'*64}")
    print("  v1 Fallback (hand-tuned weights) baseline:")
    y_v1 = []
    for idx in test_idx:
        feat_dict = {FEATURE_ORDER[j]: raw_X[idx][j] for j in range(p)}
        y_v1.append(v1_fallback_score(feat_dict))
    mae_v1 = mae(y_test, y_v1)
    r2_v1 = r2(y_test, y_v1)
    results["v1_fallback"] = {"mae": round(mae_v1, 3), "r2": round(r2_v1, 4)}
    print(f"    MAE:  {mae_v1:.3f}")
    print(f"    R²:   {r2_v1:.4f}\n")

    mae_improve = ((mae_v1 - results[best_name]["mae"]) / mae_v1 * 100) if mae_v1 > 0 else 0
    r2_improve = results[best_name]["r2"] - r2_v1

    print(f"  📊 Improvement over v1 fallback:")
    print(f"     MAE reduced by {mae_improve:.1f}%")
    print(f"     R² improved by {r2_improve:+.4f}\n")

    # Save model as JSON (weights + normalization params)
    model_data = {
        "model_type": best_name,
        "weights": best_w,
        "feature_order": FEATURE_ORDER,
        "means": means,
        "stds": stds,
        "bias": best_w[0],
    }
    with open(MODEL_PATH, "w") as f:
        json.dump(model_data, f, indent=2)
    print(f"  ✓ Model saved → {MODEL_PATH}")

    # Save results
    output = {
        "dataset_size": n,
        "test_size": len(test_idx),
        "feature_count": p,
        "feature_order": FEATURE_ORDER,
        "models": results,
        "best_model": best_name,
        "best_mae": results[best_name]["mae"],
        "best_r2": results[best_name]["r2"],
        "v1_mae": round(mae_v1, 3),
        "v1_r2": round(r2_v1, 4),
        "mae_improvement_pct": round(mae_improve, 1),
        "r2_improvement": round(r2_improve, 4),
        "feature_importances": dict(sorted_imp),
    }
    with open(RESULTS_PATH, "w") as f:
        json.dump(output, f, indent=2)
    print(f"  ✓ Results saved → {RESULTS_PATH}")
    print(f"\n{'='*64}\n")

    return output


if __name__ == "__main__":
    main()
