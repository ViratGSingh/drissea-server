import axios from "axios";
import * as cheerio from "cheerio";
import {HttpsProxyAgent} from "https-proxy-agent";
import { Bool, OpenAPIRoute, Str, Num } from "chanfana";
import { z } from "zod";
import { type AppContext, Task } from "../types.js";
import { S3Client, PutObjectCommand, HeadObjectCommand } from "@aws-sdk/client-s3";
import 'dotenv/config';

export class SaveVideoThumbnail extends OpenAPIRoute {
  schema = {
    tags: ["Metadata"],
    summary: "Extract Open Graph metadata from a URL",
    request: {
      body: {
        content: {
          "application/json": {
            schema: z.object({
              id: z.string(),
              url:z.string(),
              platform:z.string()
            }),
          },
        },
      },
    },
    responses: {
      "200": {
        description: "Metadata extracted successfully",
        content: {
          "application/json": {
            schema: z.object({
              series: z.object({
                success: Bool(),
                url: Str(),
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

    const {HttpsProxyAgent} = require('https-proxy-agent');
    

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

    const targetUrl = data.body.url;
    const targetId = data.body.id;

    try {

      const s3 = new S3Client({
        region: "auto",
        endpoint: process.env.R2_ENDPOINT,
        credentials: {
          accessKeyId: process.env.R2_ACCESS_KEY_ID!,
          secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
        },
      });

      const fileName = `${data.body.platform=="instagram"?"ig":"yt"}_thumbnails/${targetId}.jpg`;
      const publicUrl = `${process.env.R2_PUBLIC_BASE_URL}/${fileName}`;

      try {
        await s3.send(new HeadObjectCommand({ Bucket: "drissea", Key: fileName }));
        return c.json({
          success: true,
          url: publicUrl,
        });
      } catch {
        // File not found, proceed with upload
      }

      const response = await axios.get(targetUrl, { responseType: "arraybuffer" });
      const fileBuffer = Buffer.from(response.data, "binary");

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
        url: publicUrl,
      });
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
