import React, { useState } from "react";
import { searchProfiles, getRandomProfile } from "../api.js";

const TABS = [
  { id: "search", label: "Find profile" },
  { id: "manual", label: "Add details" },
];

const emptyManual = {
  fullName: "",
  workplace: "",
  location: "",
  connections: 500,
  followers: 500,
  hasPhoto: true,
  about: "",
  experiences: 2,
  educations: 1,
  skills: 5,
  recommendations: 0,
  honors: 0,
  languages: 0,
  organizations: 0,
  interests: 3,
  activities: 2,
  licenses: 0,
  volunteering: 0,
  totalUrlsFound: 2,
};

export default function ControlPanel({ onAnalyze, loading }) {
  const [tab, setTab] = useState("search");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [manual, setManual] = useState(emptyManual);

  async function runSearch(e) {
    e?.preventDefault();
    if (!query.trim()) return;
    setSearching(true);
    try {
      const { results } = await searchProfiles(query);
      setResults(results);
    } finally {
      setSearching(false);
    }
  }

  async function pickRandom() {
    setSearching(true);
    try {
      const profile = await getRandomProfile();
      onAnalyze({ mode: "dataset", index: profile._index });
    } finally {
      setSearching(false);
    }
  }

  function updateManual(key, value) {
    setManual((m) => ({ ...m, [key]: value }));
  }

  function submitManual(e) {
    e.preventDefault();
    onAnalyze({ mode: "manual", profile: manual });
  }

  return (
    <div className="panel">
      <div className="panel-title">
        <span>Review a profile</span>
      </div>
      <p className="panel-sub">
        Start with a known profile from the dataset or drop in the details yourself for a quick sanity check.
      </p>

      <div className="tabs">
        {TABS.map((t) => (
          <button
            key={t.id}
            className={`tab ${tab === t.id ? "active" : ""}`}
            onClick={() => setTab(t.id)}
            type="button"
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "search" && (
        <>
          <form onSubmit={runSearch}>
            <div className="field">
              <label>Full name or pasted LinkedIn URL</label>
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Try a name or a LinkedIn URL"
              />
            </div>
            <button className="btn-primary" type="submit" disabled={searching}>
              {searching ? "Looking it up…" : "Search profile"}
            </button>
          </form>

          {results.length > 0 && (
            <div className="search-results">
              {results.map((r) => (
                <div
                  key={r.index}
                  className="search-result-item"
                  onClick={() => onAnalyze({ mode: "dataset", index: r.index })}
                >
                  <div className="name">{r.fullName || "(no name)"}</div>
                  <div className="meta">
                    {(r.workplace || "—").slice(0, 40)} · idx {r.index}
                  </div>
                </div>
              ))}
            </div>
          )}

          <div style={{ marginTop: 14 }}>
            <button className="btn-ghost" type="button" onClick={pickRandom} disabled={loading}>
              ⟳ Review a random profile
            </button>
          </div>
        </>
      )}

      {tab === "manual" && (
        <form onSubmit={submitManual}>
          <div className="field">
            <label>Full name</label>
            <input
              value={manual.fullName}
              onChange={(e) => updateManual("fullName", e.target.value)}
              placeholder="Jane Doe"
            />
          </div>
          <div className="field">
            <label>Workplace</label>
            <input
              value={manual.workplace}
              onChange={(e) => updateManual("workplace", e.target.value)}
              placeholder="Senior Consultant at Acme Corp"
            />
          </div>
          <div className="field">
            <label>About section</label>
            <textarea
              value={manual.about}
              onChange={(e) => updateManual("about", e.target.value)}
              placeholder="Paste or write the profile's About text…"
            />
          </div>
          <div className="field-row">
            <div className="field">
              <label>Connections</label>
              <input
                type="number"
                value={manual.connections}
                onChange={(e) => updateManual("connections", e.target.value)}
              />
            </div>
            <div className="field">
              <label>Followers</label>
              <input
                type="number"
                value={manual.followers}
                onChange={(e) => updateManual("followers", e.target.value)}
              />
            </div>
          </div>
          <div className="field-row">
            <div className="field">
              <label>Experiences</label>
              <input
                type="number"
                value={manual.experiences}
                onChange={(e) => updateManual("experiences", e.target.value)}
              />
            </div>
            <div className="field">
              <label>Educations</label>
              <input
                type="number"
                value={manual.educations}
                onChange={(e) => updateManual("educations", e.target.value)}
              />
            </div>
          </div>
          <div className="field-row">
            <div className="field">
              <label>Skills listed</label>
              <input
                type="number"
                value={manual.skills}
                onChange={(e) => updateManual("skills", e.target.value)}
              />
            </div>
            <div className="field">
              <label>Activities</label>
              <input
                type="number"
                value={manual.activities}
                onChange={(e) => updateManual("activities", e.target.value)}
              />
            </div>
          </div>
          <div className="checkbox-row">
            <input
              type="checkbox"
              id="hasPhoto"
              checked={manual.hasPhoto}
              onChange={(e) => updateManual("hasPhoto", e.target.checked)}
            />
            <label htmlFor="hasPhoto">Profile has a photo</label>
          </div>
          <button className="btn-primary" type="submit" disabled={loading}>
            {loading ? "Reviewing…" : "Run review"}
          </button>
        </form>
      )}
    </div>
  );
}
