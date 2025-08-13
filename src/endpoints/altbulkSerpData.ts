import axios from "axios";
import { HttpsProxyAgent } from "https-proxy-agent";
import { OpenAPIRoute, Str } from "chanfana";
import { z } from "zod";
import { type AppContext } from "../types.js";
import "dotenv/config";

interface SerpApiResponse {
  organic?: { link: string }[];
  // Add other fields if needed, like `inline_videos?: { link: string }[]`
}

export class AltBulkSerpData extends OpenAPIRoute {
  schema = {
    tags: ["Serp Search"],
    summary: "Get instagram source links from google",
    request: {
      query: z.object({
        queries: Str({
          description: "Search queries to fetch video links via DuckDuckGo",
        }),
        domain: Str({
          description: "Domain to fetch video links via DuckDuckGo",
        }),
        total_results: z.number().describe("Total number of results required"),
        prev_results: z.number().describe("Number of previous results to skip"),
        date_range: z.string().optional().describe("Date range of results"),
        // vqd: z.string().optional().describe("Optional vqd parameter"),
        // dp: z.string().optional().describe("Optional dp parameter"),
      }),
    },
    responses: {
      "200": {
        description: "Successfully retrieved answer",
        content: {
          "application/json": {
            schema: z.object({
              series: z.object({
                query: Str(),
                answer: Str(),
                sourceUrls: z.array(Str()),
              }),
            }),
          },
        },
      },
      "400": {
        description: "Missing or invalid searchId parameter",
        content: {
          "application/json": {
            schema: z.object({
              series: z.object({
                error: Str(),
              }),
            }),
          },
        },
      },
      "404": {
        description: "Document not found",
        content: {
          "application/json": {
            schema: z.object({
              series: z.object({
                error: Str(),
              }),
            }),
          },
        },
      },
      "500": {
        description: "Internal server error",
        content: {
          "application/json": {
            schema: z.object({
              series: z.object({
                error: Str(),
              }),
            }),
          },
        },
      },
    },
  };

  async handle(c: AppContext) {
    // Authorization check
    const authHeader = c.req.header("Authorization");
    if (!authHeader || authHeader !== `Bearer ${process.env.API_SECRET}`) {
      return Response.json(
        {
          success: false,
          error: "Unauthorized",
        },
        { status: 401 }
      );
    }
    const data = await this.getValidatedData<typeof this.schema>();
    const { queries, domain, date_range} = data.query;

    try {
      const userAgent =
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36";
      const proxy_user = process.env.OXY_USERNAME;
      const proxy_host = process.env.OXY_HOST;
      const proxy_port = parseInt(process.env.OXY_PORT ?? "0", 10);
      const proxy_passwd = process.env.OXY_PASSWORD;

      const proxyUrl = `http://${proxy_user}:${proxy_passwd}@${proxy_host}:${proxy_port}`;
      const httpsAgent = new HttpsProxyAgent(proxyUrl);

      const allQueries = queries.split(",").map(q => q.trim()).filter(q => q);
      const queryResults: Record<string, any[]> = {};

      await Promise.all(allQueries.map(async (searchQuery) => {
        const duckUrl = `https://duckduckgo.com/?q=${encodeURIComponent(`${searchQuery} site:${domain}.com`)}`;
        const res = await axios.get(duckUrl, { httpsAgent, headers: { "User-Agent": userAgent } });
        const html = res.data;
        const editableParams: Record<string, string> = {};
        const scriptRegex = /<script[^>]*type=["']text\/javascript["'][^>]*>([\s\S]*?DDG\.deep\.initialize[\s\S]*?)<\/script>/i;
        const scriptMatch = html.match(scriptRegex);
        if (scriptMatch) {
          const ddgInitRegex = /DDG\.deep\.initialize\s*\(\s*(['"])(.*?)\1/;
          const ddgMatch = scriptMatch[1].match(ddgInitRegex);
          if (ddgMatch) {
            const queryString = `https://links.duckduckgo.com/${ddgMatch[2]}`;
            const urlParams = new URLSearchParams(queryString);
            urlParams.forEach((value, key) => {
              editableParams[key] = value;
            });
            const vqd = editableParams["vqd"];
            const filterParam = date_range ? `&f=publishedAfter:${date_range}` : "";
            const editedQueryString = `https://duckduckgo.com/v.js?q=${searchQuery} site:${domain}.com&o=json&l=us-en&vqd=${vqd || ""}&p=-1&sr=1${filterParam}`;
            const fetchResponse = await axios.get(editedQueryString, { headers: { "User-Agent": userAgent } });
            const resultsData = fetchResponse.data?.results || [];
            queryResults[searchQuery] = resultsData;
          }
        }
      }));

      return {
        queries: allQueries,
        results: queryResults,
        total: Object.values(queryResults).reduce((sum, arr) => sum + arr.length, 0),
        success: true,
      };
    } catch (error: any) {
      console.error("DuckDuckGo fetch error:", error);
      return Response.json(
        { error: "Failed to fetch DuckDuckGo results" },
        { status: 500 }
      );
    }
  }
}
