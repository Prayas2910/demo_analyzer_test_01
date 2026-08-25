"""
Reads a single JSON feature dict from stdin, runs it through the trained model
bundle, and prints a JSON result to stdout. Called from Node via child_process.

Input JSON example (missing keys default to 0):
{
  "Connections": 500, "Followers": 717, "Number of Experiences": 2,
  "Number of Educations": 1, "Number of Licenses": 0, "Number of Volunteering": 0,
  "Number of Skills": 3, "Number of Recommendations": 0, "Number of Honors": 0,
  "Number of Languages": 0, "Number of Organizations": 0, "Number of Interests": 4,
  "Number of Activities": 1, "Total_URLs_Found": 5, "Has_Photo": 0, "About_Length": 547
}

Output JSON:
{
  "fake_probability": 0.12,
  "predicted_label": 0,
  "predicted_class": "genuine",
  "class_probabilities": {"0": 0.9, "1": 0.05, "10": 0.03, "11": 0.02},
  "feature_importances": {...}
}
"""

import sys
import json
import os
import numpy as np
import joblib

MODEL_PATH = os.path.join(os.path.dirname(__file__), "model.joblib")

CLASS_NAMES = {
    0: "genuine",
    1: "fake_type_1",
    10: "fake_type_10",
    11: "fake_type_11",
}


def main():
    raw = sys.stdin.read()
    try:
        payload = json.loads(raw) if raw.strip() else {}
    except json.JSONDecodeError as e:
        print(json.dumps({"error": f"invalid JSON input: {e}"}))
        sys.exit(1)

    bundle = joblib.load(MODEL_PATH)
    features = bundle["features"]
    scaler = bundle["scaler"]
    bin_model = bundle["binary_model"]
    multi_model = bundle["multiclass_model"]

    x = np.array([[float(payload.get(f, 0) or 0) for f in features]])
    x_scaled = scaler.transform(x)

    fake_proba = float(bin_model.predict_proba(x_scaled)[0][1])
    bin_pred = int(bin_model.predict(x_scaled)[0])

    multi_pred = int(multi_model.predict(x_scaled)[0])
    multi_classes = multi_model.classes_.tolist()
    multi_proba = multi_model.predict_proba(x_scaled)[0].tolist()
    class_probabilities = {
        str(c): round(p, 4) for c, p in zip(multi_classes, multi_proba)
    }

    result = {
        "fake_probability": round(fake_proba, 4),
        "predicted_label": multi_pred,
        "predicted_class": CLASS_NAMES.get(multi_pred, str(multi_pred)),
        "binary_prediction": "fake" if bin_pred == 1 else "genuine",
        "class_probabilities": class_probabilities,
        "feature_importances": {
            k: round(v, 4) for k, v in bundle["feature_importances"].items()
        },
    }
    print(json.dumps(result))


if __name__ == "__main__":
    main()
