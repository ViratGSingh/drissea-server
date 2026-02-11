"use strict";
require('dotenv').config();

const { HttpsProxyAgent } = require('https-proxy-agent');
const axios = require('axios');

// Bright Data Proxy
const proxy_user = process.env.OXY_USERNAME;
const proxy_host = process.env.OXY_HOST;
const proxy_port = parseInt(process.env.OXY_PORT, 10);
const proxy_passwd = process.env.OXY_PASSWORD;

const proxyUrl = `http://${proxy_user}:${proxy_passwd}@${proxy_host}:${proxy_port}`;
const httpsAgent = new HttpsProxyAgent(proxyUrl);

/**
 * Search DuckDuckGo and return organic results with og:image URLs.
 * @param {string} query
 * @param {string} country
 * @returns {Promise<Array<{url: string, title: string, excerpts: string, ogImage: string}>>}
 */
async function duckDuckGoSearch(query, country) {
  const encodedQuery = encodeURIComponent(query);
  const region = `${country.toLowerCase()}-en`;

  const url = `https://html.duckduckgo.com/html/?q=${encodedQuery}&kl=${region}`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
      "Accept": "text/html",
      "Accept-Language": "en-US,en;q=0.9",
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: `q=${encodedQuery}&kl=${region}`,
  });

  const html = await res.text();
  const results = parseSearchHTML(html);

  // // Fetch og:image for all results in parallel via proxy
  // const ogImages = await fetchOgImages(results.map(r => r.url));
  // return results.map(r => ({
  //   ...r,
  //   ogImage: ogImages.get(r.url) || "",
  // }));
  return results;
}

function parseSearchHTML(html) {
  const results = [];
  const seenUrls = new Set();

  const resultRegex = /<a[^>]*class="result__a"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g;
  const snippetRegex = /<a[^>]*class="result__snippet"[^>]*>([\s\S]*?)<\/a>/g;

  const snippets = [];
  let snippetMatch;
  while ((snippetMatch = snippetRegex.exec(html)) !== null) {
    snippets.push(stripHTML(snippetMatch[1]).trim());
  }

  let match;
  let index = 0;
  while ((match = resultRegex.exec(html)) !== null) {
    let resultUrl = match[1];
    const uddgMatch = resultUrl.match(/uddg=([^&]+)/);
    if (uddgMatch) {
      resultUrl = decodeURIComponent(uddgMatch[1]);
    }

    const title = stripHTML(match[2]).trim();

    if (!resultUrl || !title || seenUrls.has(resultUrl)) continue;
    seenUrls.add(resultUrl);

    results.push({
      url: resultUrl,
      title,
      excerpts: snippets[index] || "",
      ogImage: "",
    });
    index++;
  }

  return results;
}

/**
 * Fetch og:image from multiple URLs in parallel using the proxy.
 * Only reads the first ~10KB of each page to find the meta tag.
 */
async function fetchOgImages(urls) {
  const results = new Map();
  if (urls.length === 0) return results;

  const promises = urls.map(async (url) => {
    try {
      const res = await axios({
        method: "GET",
        url,
        headers: {
          "User-Agent": "Mozilla/5.0 (compatible; bot)",
          "Accept": "text/html",
        },
        httpsAgent: httpsAgent,
        timeout: 3000,
        maxRedirects: 3,
        // Only read enough to find og:image in <head>
        responseType: "arraybuffer",
        maxContentLength: 15000,
      });

      const html = Buffer.from(res.data).toString("utf-8");

      const ogMatch = html.match(/<meta[^>]*property=["']og:image["'][^>]*content=["']([^"']+)["']/i)
        || html.match(/<meta[^>]*content=["']([^"']+)["'][^>]*property=["']og:image["']/i);

      if (ogMatch && ogMatch[1]) {
        results.set(url, ogMatch[1]);
      }
    } catch {
      // Timeout or fetch error — skip silently
    }
  });

  await Promise.all(promises);
  return results;
}

function stripHTML(str) {
  return str
    .replace(/<[^>]*>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .trim();
}

/**
 * Search DuckDuckGo with multiple queries in parallel, deduplicate results.
 * @param {string[]} queries
 * @param {string} country
 * @returns {Promise<Array<{url: string, title: string, excerpts: string, ogImage: string}>>}
 */
async function duckDuckGoBatchSearch(queries, country) {
  const uniqueQueries = [...new Set(queries)].filter(q => q && q.trim().length > 0);
  if (uniqueQueries.length === 0) return [];

  const resultsArrays = await Promise.all(
    uniqueQueries.map(q => duckDuckGoSearch(q, country).catch(() => []))
  );

  const seenUrls = new Set();
  const deduped = [];
  for (const results of resultsArrays) {
    let count = 0;
    for (const item of results) {
      if (count >= 2) break;
      if (!item.url || seenUrls.has(item.url)) continue;
      seenUrls.add(item.url);
      deduped.push(item);
      count++;
    }
  }

  return deduped;
}

module.exports = { duckDuckGoSearch, duckDuckGoBatchSearch };
