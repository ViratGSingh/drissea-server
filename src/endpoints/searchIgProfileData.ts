import { OpenAPIRoute, Str } from "chanfana";
import { z } from "zod";
import { type AppContext } from "../types.js";
import { Groq } from "groq-sdk";
import "dotenv/config";
import admin from "firebase-admin";
import { HttpsProxyAgent } from "https-proxy-agent";
import axios from "axios";

export class SearchIgProfileData extends OpenAPIRoute {
  schema = {
    tags: ["Instagram Get Content Data"],
    summary: "Get IG content",
    request: {
      query: z.object({
        query: Str({ description: "IG post/reel url" }),
      }),
    },
    responses: {
      "200": {
        description: "Successfully retrieved content",
        content: {
          "application/json": {
            schema: z.object({
              videoUrl: Str(),
              translatedText: Str(),
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
      return c.json(
        {
          success: false,
          error: "Unauthorized",
        },
        { status: 401 }
      );
    }

    const data = await this.getValidatedData<typeof this.schema>();
    const { query } = data.query;
    const incomingCsrf = c.req.header("X-CSRFToken") ?? "agkp4EEB7u2wPNvvp9ztaZauxvdSgwrD";


    const proxy_user = process.env.OXY_USERNAME;
    const proxy_host = process.env.OXY_HOST;
    const proxy_port = parseInt(process.env.OXY_PORT || "0", 10);
    const proxy_passwd = process.env.OXY_PASSWORD;

    const proxyUrl = `http://${proxy_user}:${proxy_passwd}@${proxy_host}:${proxy_port}`;
    const httpsAgent = new HttpsProxyAgent(proxyUrl);

    const igUrl = "https://www.instagram.com/graphql/query";

    const variables = {
      data: {
        context: "blended",
        include_reel: "true",
        query,
        search_surface: "web_top_search",
      },
      hasQuery: true,
    };

    const formBody = new URLSearchParams({
      variables: JSON.stringify(variables),
      doc_id: "24146980661639222",
    });

    const axiosResponse = await axios.request({
      method: "POST",
      url: igUrl,
      httpsAgent: httpsAgent,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:145.0) Gecko/20100101 Firefox/145.0",
        Accept: "*/*",
        "Accept-Language": "en-US,en;q=0.5",
        "Accept-Encoding": "gzip, deflate",
        "Content-Type": "application/x-www-form-urlencoded",
        "X-CSRFToken": incomingCsrf,
        Origin: "https://www.instagram.com",
        "Alt-Used": "www.instagram.com",
        Connection: "keep-alive",
        Referer: "https://www.instagram.com/",
        "Sec-Fetch-Dest": "empty",
        "Sec-Fetch-Mode": "cors",
        "Sec-Fetch-Site": "same-origin",
      },
      data: formBody.toString(),
      responseType: "arraybuffer"
    });

    const buffer = axiosResponse.data;
    const raw = new TextDecoder("utf-8", { fatal: false }).decode(buffer);
    
    let parsedSearch: any = null;
    try {
      parsedSearch = JSON.parse(raw);
    } catch (e) {
      return c.json(
        { success: false, error: "Invalid IG JSON", raw },
        { status: 500 }
      );
    }

    const results =
      parsedSearch?.data?.xdt_api__v1__fbsearch__topsearch_connection?.users ??
      [];

    return c.json({
      success: true,
      query,
      results,
    });
  }
}

type Answer = {
  created_at: string;
  process: string;
  reply: string;
  source_links: string[];
};
