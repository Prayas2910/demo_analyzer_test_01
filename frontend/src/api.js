const BASE = "/api";

async function handle(res) {
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(json.error || `Request failed (${res.status})`);
    err.hint = json.hint;
    throw err;
  }
  return json;
}

export async function health() {
  const res = await fetch(`${BASE}/health`);
  return handle(res);
}

export async function searchProfiles(q) {
  const res = await fetch(`${BASE}/search?q=${encodeURIComponent(q)}`);
  return handle(res);
}

export async function getRandomProfile() {
  const res = await fetch(`${BASE}/profile/random`);
  return handle(res);
}

export async function analyze(payload) {
  const res = await fetch(`${BASE}/analyze`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return handle(res);
}

export async function searchCompany(name) {
  const res = await fetch(`${BASE}/company/search?name=${encodeURIComponent(name)}`);
  return handle(res);
}

export async function checkCompany(payload) {
  const res = await fetch(`${BASE}/company/check`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return handle(res);
}

export async function analyzeCompany(payload) {
  const res = await fetch(`${BASE}/company/analyze`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return handle(res);
}
