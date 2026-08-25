const fs = require("fs");
const path = require("path");
const { parse } = require("csv-parse/sync");

const CSV_PATH = path.join(__dirname, "..", "data", "LinkedIn_Dataset_ML_Ready.csv");

let RECORDS = null;

function coerceNumbers(row) {
  const numericCols = [
    "Connections", "Followers", "Number of Experiences", "Number of Educations",
    "Number of Licenses", "Number of Volunteering", "Number of Skills",
    "Number of Recommendations", "Number of Honors", "Number of Languages",
    "Number of Organizations", "Number of Interests", "Number of Activities",
    "Total_URLs_Found", "Label", "Has_Photo", "About_Length",
  ];
  for (const c of numericCols) {
    if (row[c] !== undefined && row[c] !== "") row[c] = Number(row[c]);
    else row[c] = 0;
  }
  return row;
}

function loadDataset() {
  if (RECORDS) return RECORDS;
  const raw = fs.readFileSync(CSV_PATH, "utf-8");
  const rows = parse(raw, { columns: true, skip_empty_lines: true });
  RECORDS = rows.map((r, idx) => ({ ...coerceNumbers(r), _index: idx }));
  console.log(`[dataset] loaded ${RECORDS.length} profiles`);
  return RECORDS;
}

function searchProfiles(query, limit = 10) {
  const records = loadDataset();
  const q = (query || "").trim().toLowerCase();
  if (!q) return [];

  const isUrl = q.includes("linkedin.com");
  const slug = isUrl ? q.split("/in/")[1]?.replace(/\/$/, "") : null;

  const matches = records.filter((r) => {
    if (isUrl && slug && (r.People_URLs || "").toLowerCase().includes(slug)) return true;
    return (r["Full Name"] || "").toLowerCase().includes(q);
  });

  return matches.slice(0, limit).map((r) => ({
    index: r._index,
    fullName: r["Full Name"],
    workplace: r["Workplace"],
    location: r["Location"],
    label: r.Label,
  }));
}

function getProfileByIndex(index) {
  const records = loadDataset();
  return records[Number(index)] || null;
}

function getRandomProfile() {
  const records = loadDataset();
  return records[Math.floor(Math.random() * records.length)];
}

function datasetSize() {
  return loadDataset().length;
}

module.exports = {
  loadDataset,
  searchProfiles,
  getProfileByIndex,
  getRandomProfile,
  datasetSize,
};
