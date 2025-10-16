import axios from "axios";
import * as cheerio from "cheerio";
import { HttpsProxyAgent } from "https-proxy-agent";
import { Bool, OpenAPIRoute, Str, Num } from "chanfana";
import { z } from "zod";
import { type AppContext, Task } from "../types.js";
import "dotenv/config";
import {
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";

export class OgExtract extends OpenAPIRoute {
  schema = {
    tags: ["Metadata"],
    summary: "Extract Open Graph metadata from a URL",
    request: {
      query: z.object({
        url: Str({ description: "Target webpage URL" }),
      }),
    },
    responses: {
      "200": {
        description: "Metadata extracted successfully",
        content: {
          "application/json": {
            schema: z.object({
              series: z.object({
                success: Bool(),
                ogTitle: Str(),
                ogDescription: Str(),
                ogImage: Str().optional(),
                ogUrl: Str(),
                durationMs: Num(),
              }),
            }),
          },
        },
      },
      "400": {
        description: "Bad request due to missing or invalid URL",
        content: {
          "application/json": {
            schema: z.object({
              series: z.object({
                success: Bool(),
                error: Str(),
              }),
            }),
          },
        },
      },
      "500": {
        description: "Internal server error during metadata extraction",
        content: {
          "application/json": {
            schema: z.object({
              series: z.object({
                success: Bool(),
                error: Str(),
                details: Str(),
              }),
            }),
          },
        },
      },
    },
  };

  async handle(c: AppContext) {
    const { HttpsProxyAgent } = require("https-proxy-agent");

    //Bright Data Access
    const proxy_user = process.env.OXY_USERNAME;
    const proxy_host = process.env.OXY_HOST;
    const proxy_port = parseInt(process.env.OXY_PORT ?? "0", 10);
    const proxy_passwd = process.env.OXY_PASSWORD;

    const proxyUrl = `http://${proxy_user}:${proxy_passwd}@${proxy_host}:${proxy_port}`;
    const httpsAgent = new HttpsProxyAgent(proxyUrl);

    const data = await this.getValidatedData<typeof this.schema>();

    // Authorization check
    const authHeader = c.req.header("Authorization");
    if (!authHeader || authHeader !== `Bearer ${process.env.API_SECRET}`) {
      return c.json(
        {
          success: false,
          error: "Unauthorized",
        },
        401
      );
    }

    const targetUrl = data.query.url;
    const start = Date.now();
    let targetId: string = "";

    try {
      if (
        targetUrl.includes("instagram") ||
        targetUrl.includes("youtube") ||
        targetUrl.includes("youtu.be")
      ) {
        //Find url id
        if (targetUrl.includes("instagram")) {
          const split_url = targetUrl.split("/");
          const post_tags = ["p", "reel", "tv", "reels"];
          const index_shortcode =
            split_url.findIndex((item) => post_tags.includes(item)) + 1;
          targetId = split_url[index_shortcode];
        } else {
          const parsedUrl = new URL(targetUrl);
          if (parsedUrl.hostname.includes("youtu.be")) {
            targetId = parsedUrl.pathname.slice(1);
          } else if (parsedUrl.pathname.startsWith("/shorts/")) {
            targetId =
              parsedUrl.pathname.split("/shorts/")[1]?.split(/[?&]/)[0] || "";
          } else {
            targetId = parsedUrl.searchParams.get("v") || "";
          }
        }
        const s3 = new S3Client({
          region: "auto",
          endpoint: process.env.R2_ENDPOINT,
          credentials: {
            accessKeyId: process.env.R2_ACCESS_KEY_ID!,
            secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
          },
        });

        const fileName = `${
          targetUrl.includes("instagram") ? "ig" : "yt"
        }_thumbnails/${targetId}.jpg`;
        const publicUrl = `${process.env.R2_PUBLIC_BASE_URL}/${fileName}`;

        try {
          await s3.send(
            new HeadObjectCommand({ Bucket: "drissea", Key: fileName })
          );
          const durationMs = Date.now() - start;
          return c.json({
            success: true,
            ogTitle: "",
            ogDescription: "",
            ogImage: publicUrl,
            ogUrl: targetUrl,
            durationMs: durationMs,
          });
        } catch {
          // File not found, proceed with upload
        }
      }
      let config = {
        method: "GET",
        url: targetUrl,
        httpsAgent: httpsAgent,
      };
      const response = await axios(config);

      const html = response.data;
      const $ = cheerio.load(html);

      const ogTitle =
        $('meta[property="og:title"]').attr("content") || $("title").text();
      const ogDescription =
        $('meta[property="og:description"]').attr("content") || "";
      const ogImage = $('meta[property="og:image"]').attr("content");
      const ogUrl = $('meta[property="og:url"]').attr("content") || targetUrl;
      const durationMs = Date.now() - start;

      //Backup thumbnail
      if (
        targetUrl.includes("instagram") ||
        targetUrl.includes("youtube") ||
        targetUrl.includes("youtu.be")
      ) {
        const s3 = new S3Client({
          region: "auto",
          endpoint: process.env.R2_ENDPOINT,
          credentials: {
            accessKeyId: process.env.R2_ACCESS_KEY_ID!,
            secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
          },
        });

        const fileName = `${
          targetUrl.includes("instagram") ? "ig" : "yt"
        }_thumbnails/${targetId}.jpg`;
        const publicUrl = `${process.env.R2_PUBLIC_BASE_URL}/${fileName}`;
        const uploadResponse = await axios.get(ogImage ?? "", {
          responseType: "arraybuffer",
        });
        const fileBuffer = Buffer.from(uploadResponse.data, "binary");

        await s3.send(
          new PutObjectCommand({
            Bucket: "drissea",
            Key: fileName,
            Body: fileBuffer,
            ContentType: "image/jpeg",
          })
        );

        return c.json({
          success: true,
          ogTitle,
          ogDescription,
          ogImage: publicUrl,
          ogUrl,
          durationMs,
        });
      } else {
        return c.json({
          success: true,
          ogTitle,
          ogDescription,
          ogImage,
          ogUrl,
          durationMs,
        });
      }
    } catch (err: any) {
      return c.json(
        {
          success: false,
          error: "Failed to fetch page",
          details: err.message,
        },
        500
      );
    }
  }
}
