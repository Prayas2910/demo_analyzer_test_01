# Veriscan

Profile authenticity analysis platform with multi-agent risk scoring and explainable AI.

## Features

- Profile risk assessment with visual scoring
- Multi-agent analysis (profile, organization, image, behavior)
- Explainability panel for model transparency
- Real-time pipeline visualization

## Tech Stack

- **Frontend:** React + Vite
- **Backend:** Node.js + Express
- **ML:** Python (scikit-learn)

## Quick Start

### Prerequisites
- Node.js v16+
- Python 3.8+

### Installation

```bash
# Backend
cd backend
npm install
python3 -m venv .venv
source .venv/bin/activate  # On Windows: .venv\Scripts\activate
pip install -r ml/requirements.txt

# Frontend
cd ../frontend
npm install