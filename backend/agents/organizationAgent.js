const dns = require("dns").promises;
const tls = require("tls");
const whois = require("whois-json");
const fetch = require("node-fetch");

/**
 * Hard wall-clock timeout wrapper. Some sandboxed/locked-down network
 * environments (this demo included) silently drop outbound connections to
 * arbitrary domains instead of refusing them, which makes the underlying
 * dns/tls/whois calls hang forever with no error. Every outbound check in
 * this file is wrapped in this so the Organization Agent always returns
 * within a bounded time and the pipeline never stalls.
 */
function withTimeout(promise, ms, timeoutValue) {
  let timer;
  const timeout = new Promise((resolve) => {
    timer = setTimeout(() => resolve(timeoutValue), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

/**
 * Best-effort guess at a company domain from a free-text workplace string,
 * e.g. "Software Analyst at Techstreet Solutions" -> "techstreetsolutions.com".
 * This is a heuristic fallback for when the frontend doesn't pass an explicit
 * domain; results should be treated as low-confidence.
 */
function guessDomain(workplaceText) {
  if (!workplaceText) return null;
  const cleaned = workplaceText
    .replace(/\b(inc|llc|ltd|corp|co|company|group|solutions|technologies|pvt)\b/gi, "")
    .replace(/[^a-zA-Z ]/g, "")
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .join("")
    .toLowerCase();
  return cleaned ? `${cleaned}.com` : null;
}

async function checkDNS(domain) {
  return withTimeout(
    (async () => {
      try {
        const records = await dns.resolve(domain);
        return { resolved: true, records };
      } catch (e) {
        return { resolved: false, error: e.code || e.message };
      }
    })(),
    4000,
    { resolved: false, error: "timeout (network unreachable in this environment)" }
  );
}

async function checkSSL(domain) {
  return withTimeout(checkSSLRaw(domain), 4500, { valid: false, error: "timeout (network unreachable in this environment)" });
}

async function checkSSLRaw(domain) {
  return new Promise((resolve) => {
    const socket = tls.connect(
      { host: domain, port: 443, servername: domain, timeout: 5000 },
      () => {
        const cert = socket.getPeerCertificate();
        socket.end();
        if (!cert || !cert.subject) {
          return resolve({ valid: false, error: "No certificate returned" });
        }
        resolve({
          valid: socket.authorized === true,
          issuer: cert.issuer && cert.issuer.O,
          validFrom: cert.valid_from,
          validTo: cert.valid_to,
          authorizationError: socket.authorizationError,
        });
      }
    );
    socket.on("error", (e) => resolve({ valid: false, error: e.message }));
    socket.on("timeout", () => {
      socket.destroy();
      resolve({ valid: false, error: "TLS connection timed out" });
    });
  });
}

async function checkWhois(domain) {
  return withTimeout(
    (async () => {
      try {
        const data = await whois(domain);
        return {
          found: true,
          registrar: data.registrar || data.registrarName || null,
          creationDate: data.creationDate || data.createdDate || null,
          updatedDate: data.updatedDate || null,
          registrantCountry: data.registrantCountry || null,
        };
      } catch (e) {
        return { found: false, error: e.message };
      }
    })(),
    4000,
    { found: false, error: "timeout (network unreachable in this environment)" }
  );
}

/**
 * Google Safe Browsing check. Requires GOOGLE_SAFE_BROWSING_API_KEY in env.
 * Gracefully no-ops (returns skipped: true) if not configured, rather than
 * failing the whole pipeline.
 */
async function checkSafeBrowsing(url) {
  const apiKey = process.env.GOOGLE_SAFE_BROWSING_API_KEY;
  if (!apiKey) {
    return { skipped: true, reason: "GOOGLE_SAFE_BROWSING_API_KEY not configured" };
  }
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 4000);
    const res = await fetch(
      `https://safebrowsing.googleapis.com/v4/threatMatches:find?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          client: { clientId: "fake-profile-detector", clientVersion: "1.0.0" },
          threatInfo: {
            threatTypes: [
              "MALWARE", "SOCIAL_ENGINEERING", "UNWANTED_SOFTWARE", "POTENTIALLY_HARMFUL_APPLICATION",
            ],
            platformTypes: ["ANY_PLATFORM"],
            threatEntryTypes: ["URL"],
            threatEntries: [{ url }],
          },
        }),
      }
    );
    clearTimeout(timer);
    const json = await res.json();
    return { skipped: false, threatsFound: !!(json.matches && json.matches.length), matches: json.matches || [] };
  } catch (e) {
    return { skipped: false, error: e.name === "AbortError" ? "timeout" : e.message };
  }
}

/**
 * @param {string|null} explicitDomain - domain provided by the user, if any
 * @param {string} workplaceText - fallback text to guess a domain from
 */
async function runOrganizationAgent(explicitDomain, workplaceText) {
  const domain = explicitDomain || guessDomain(workplaceText);
  if (!domain) {
    return {
      agent: "OrganizationAgent",
      skipped: true,
      reason: "No company domain available or derivable from workplace text",
    };
  }

  const [dnsResult, sslResult, whoisResult, safeBrowsingResult] = await Promise.all([
    checkDNS(domain),
    checkSSL(domain),
    checkWhois(domain),
    checkSafeBrowsing(`https://${domain}`),
  ]);

  return {
    agent: "OrganizationAgent",
    domain,
    domainWasGuessed: !explicitDomain,
    dns: dnsResult,
    ssl: sslResult,
    whois: whoisResult,
    safeBrowsing: safeBrowsingResult,
  };
}

module.exports = { runOrganizationAgent, guessDomain };
