"""
Trains the Profile Agent's risk-scoring model on LinkedIn_Dataset_ML_Ready.csv.

Label meaning in this dataset:
  0  -> genuine profile
  1, 10, 11 -> different classes of fake/inauthentic profile

We train two things and save both:
  1. A binary classifier: genuine (0) vs fake (1) -- this drives the main risk score.
  2. A multiclass classifier: 0 / 1 / 10 / 11 -- this drives the "fake profile type"
     shown in the Explainability Agent, in case the four classes represent distinct
     fake-profile patterns (e.g. spam, scraper, impersonation) worth telling the user apart.

Run:  python3 train_model.py
Produces: model.joblib (dict with both models + scaler + feature list + metrics)
"""

import json
import pandas as pd
import numpy as np
from sklearn.model_selection import train_test_split
from sklearn.ensemble import RandomForestClassifier
from sklearn.preprocessing import StandardScaler
from sklearn.metrics import classification_report, accuracy_score, roc_auc_score
import joblib

DATA_PATH = "../data/LinkedIn_Dataset_ML_Ready.csv"
MODEL_OUT = "model.joblib"
FEATURES = [
    "Connections", "Followers",
    "Number of Experiences", "Number of Educations", "Number of Licenses",
    "Number of Volunteering", "Number of Skills", "Number of Recommendations",
    "Number of Honors", "Number of Languages", "Number of Organizations",
    "Number of Interests", "Number of Activities",
    "Total_URLs_Found", "Has_Photo", "About_Length",
]

def main():
    df = pd.read_csv(DATA_PATH)

    # Ensure all feature columns exist and are numeric
    for c in FEATURES:
        if c not in df.columns:
            raise SystemExit(f"Missing expected column: {c}")
        df[c] = pd.to_numeric(df[c], errors="coerce").fillna(0)

    X = df[FEATURES].values
    y_multi = df["Label"].astype(int).values
    y_binary = (y_multi != 0).astype(int)  # 0 = genuine, 1 = any fake type

    scaler = StandardScaler()
    X_scaled = scaler.fit_transform(X)

    # --- Binary model (genuine vs fake) ---
    Xtr, Xte, ytr, yte = train_test_split(
        X_scaled, y_binary, test_size=0.2, random_state=42, stratify=y_binary
    )
    bin_clf = RandomForestClassifier(
        n_estimators=300, max_depth=10, class_weight="balanced", random_state=42
    )
    bin_clf.fit(Xtr, ytr)
    bin_pred = bin_clf.predict(Xte)
    bin_proba = bin_clf.predict_proba(Xte)[:, 1]
    bin_report = classification_report(yte, bin_pred, output_dict=True)
    bin_auc = roc_auc_score(yte, bin_proba)
    bin_acc = accuracy_score(yte, bin_pred)

    # --- Multiclass model (0 / 1 / 10 / 11) ---
    Xtr2, Xte2, ytr2, yte2 = train_test_split(
        X_scaled, y_multi, test_size=0.2, random_state=42, stratify=y_multi
    )
    multi_clf = RandomForestClassifier(
        n_estimators=300, max_depth=12, class_weight="balanced", random_state=42
    )
    multi_clf.fit(Xtr2, ytr2)
    multi_pred = multi_clf.predict(Xte2)
    multi_report = classification_report(yte2, multi_pred, output_dict=True)
    multi_acc = accuracy_score(yte2, multi_pred)

    feature_importances = dict(zip(FEATURES, bin_clf.feature_importances_.tolist()))

    bundle = {
        "scaler": scaler,
        "binary_model": bin_clf,
        "multiclass_model": multi_clf,
        "features": FEATURES,
        "metrics": {
            "binary_accuracy": bin_acc,
            "binary_auc": bin_auc,
            "binary_report": bin_report,
            "multiclass_accuracy": multi_acc,
            "multiclass_report": multi_report,
        },
        "feature_importances": feature_importances,
    }
    joblib.dump(bundle, MODEL_OUT)

    print("=== Binary (genuine vs fake) ===")
    print(f"Accuracy: {bin_acc:.4f}  AUC: {bin_auc:.4f}")
    print("=== Multiclass (0/1/10/11) ===")
    print(f"Accuracy: {multi_acc:.4f}")
    print("\nTop feature importances:")
    for k, v in sorted(feature_importances.items(), key=lambda x: -x[1])[:8]:
        print(f"  {k}: {v:.4f}")
    print(f"\nSaved model bundle -> {MODEL_OUT}")

if __name__ == "__main__":
    main()
