import { OpenAPIRoute, Str } from "chanfana";
import { z } from "zod";
import { type AppContext } from "../types.js";
import "dotenv/config";

interface WebSerpResponse {
  short_video_results?: [];
  video_results?: [];
  news_results?: [];
  images_results?: [];
  organic_results?: {
    position: number;
    title: string;
    link: string;
    displayed_link: string;
    snippet: string;
  }[];
  // Add other fields if needed, like `inline_videos?: { link: string }[]`
}

interface SerpApiResponse {
  videos?: { link: string }[];
  // Add other fields if needed, like `inline_videos?: { link: string }[]`
}

export class WebSerpData extends OpenAPIRoute {
  schema = {
    tags: ["Serp Search"],
    summary: "Get source links from google",
    request: {
      query: z.object({
        query: Str({
          description: "Search query to fetch Instagram links via SerpAPI",
        }),
        gl: Str({ description: "Country Code" }),
        location: Str({ description: "Country Name" }),
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
    const { query, gl, location } = data.query;

    let countryCode = gl ?? "in";
    let country = location ?? "India";

    // // Get client IP from headers or connection, fallback to empty string
    // const clientIp =
    //   c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ||
    //   c.req.header("cf-connecting-ip") ||
    //   // @ts-ignore
    //   c.req.raw?.connection?.remoteAddress ||
    //   "";
    // try {
    //   let ipapiUrl = "https://ipapi.co";
    //   if (clientIp) {
    //     ipapiUrl += `/${clientIp}/json/`;
    //   } else {
    //     ipapiUrl += "/json/";
    //   }
    //   const ipRes = await fetch(ipapiUrl);
    //   const ipJson = (await ipRes.json()) as { country_code?: string; country_name?: string; error?: string };
    //   countryCode = ipJson.country_code ? ipJson.country_code.toLowerCase() : "in";
    //   country = ipJson.country_name ? ipJson.country_name : "India";
    // } catch (err) {
    //   // If ipapi fails, fallback to default countryCode
    //   countryCode = "in";
    //   country = "India";
    //   console.log("ipapi failed, using fallback countryCode:", countryCode);
    // }

    const serpUrl = "https://google.serper.dev/videos";
    const altSerpUrl = "https://serpapi.com/search";

    try {
      // const res = await fetch(serpUrl, {
      //   method: "POST",
      //   headers: {
      //     "X-API-KEY": `${process.env.SERP_API_KEY}`,
      //     "Content-Type": "application/json",
      //   },
      //   body: JSON.stringify({
      //     q: `${query}`,
      //     //api_key: process.env.SERP_API_KEY,
      //     num: "10",
      //     gl:countryCode,
      //     location:country,
      //     hl: "en",
      //   }),
      // });

      // const json = (await res.json()) as SerpApiResponse;

      //Get Search Results
      const  webRes
        = await 
        fetch(
          `${altSerpUrl}?q=${encodeURIComponent(query)}&api_key=${
            process.env.ALT_SERP_API_KEY
          }&engine=google_light&gl=${countryCode}&location=${country}&device=mobile`,
          {
            method: "GET",
            headers: {
              "Content-Type": "application/json",
            },
          }
        );

      const [
        webJson,
      ] = await Promise.all([
        webRes.json() as Promise<WebSerpResponse>,
        ]);

      
      return {
        query,
        //web_results: [...webLinks],
        data: webJson?.organic_results?.map(({ position, title, link, displayed_link, snippet }) => ({
          title,
          link,
          displayed_link,
          snippet,
        })) ?? [],
        // video_results: [...videosLinks],
        // news_results: [...newsLinks],
        // image_results: [...imagesLinks],
        //thumbnail_links: thumbnailLinks,
        success: true,
      };
    } catch (error: any) {
      console.error("SerpAPI fetch error:", error);
      return Response.json(
        { error: "Failed to fetch SerpAPI results" },
        { status: 500 }
      );
    }
  }
}
