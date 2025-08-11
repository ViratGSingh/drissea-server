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

export class AltSerpData extends OpenAPIRoute {
  schema = {
    tags: ["Serp Search"],
    summary: "Get instagram source links from google",
    request: {
      query: z.object({
        query: Str({
          description: "Search query to fetch video links via DuckDuckGo",
        }),
        domain: Str({
          description: "Domain to fetch video links via DuckDuckGo",
        }),
        total_results: z.number().describe("Total number of results required"),
        prev_results: z.number().describe("Number of previous results to skip"),
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
    const { query, total_results, prev_results, domain } = data.query;

    try {
      const userAgent =
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36";
      const proxy_user = process.env.OXY_USERNAME;
      const proxy_host = process.env.OXY_HOST;
      const proxy_port = parseInt(process.env.OXY_PORT ?? "0", 10);
      const proxy_passwd = process.env.OXY_PASSWORD;

      const proxyUrl = `http://${proxy_user}:${proxy_passwd}@${proxy_host}:${proxy_port}`;
      const httpsAgent = new HttpsProxyAgent(proxyUrl);
      const duckUrl = `https://duckduckgo.com/?q=${encodeURIComponent(
        `${query} site:${domain}.com`
      )}`;

      const res = await axios.get(duckUrl, {
        httpsAgent,
        headers: {
          "User-Agent": userAgent,
        },
      });
      const html = res.data;
      let jsonData;
      const editableParams: Record<string, string> = {};
      // Extract the first <script type="text/javascript">...</script> containing DDG.deep.initialize
      const scriptRegex =
        /<script[^>]*type=["']text\/javascript["'][^>]*>([\s\S]*?DDG\.deep\.initialize[\s\S]*?)<\/script>/i;
      const scriptMatch = html.match(scriptRegex);
      if (scriptMatch) {
        // Find DDG.deep.initialize('...')
        const ddgInitRegex = /DDG\.deep\.initialize\s*\(\s*(['"])(.*?)\1/;
        const ddgMatch = scriptMatch[1].match(ddgInitRegex);
        if (ddgMatch) {
          // Extract and log editable query parameters from ddgMatch[2]
          const queryString = `https://links.duckduckgo.com/${ddgMatch[2]}`;
          const urlParams = new URLSearchParams(queryString);

          urlParams.forEach((value, key) => {
            editableParams[key] = value;
          });
          editableParams["prev_s"] = String(data.query.prev_results);
          editableParams["s"] = String(data.query.total_results);

          const vqd = editableParams["vqd"];
          const editedQueryString = `https://duckduckgo.com/v.js?q=${query} site:${domain}.com&o=json&l=us-en&vqd=${vqd || ""}&p=-1&sr=1`;

          //Make query to this with https://links.duckduckgo.com/
          const fetchResponse = await axios.get(editedQueryString, {
            //httpsAgent,
            headers: {
              "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
            },
          });
          console.log(fetchResponse.data);
          jsonData = fetchResponse.data;
        } else {
          console.error("❌ Could not find DDG.deep.initialize argument.");
        }
      } else {
        console.error(
          '❌ Could not find <script type="text/javascript"> containing DDG.deep.initialize.'
        );
      }


      return {
        query,
        "results":jsonData["results"]??[],
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
