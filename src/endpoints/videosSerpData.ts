import { OpenAPIRoute, Str } from "chanfana";
import { z } from "zod";
import { type AppContext } from "../types.js";
import "dotenv/config";

interface VideoResultItem {
  //position: number;
  title: string;
  link: string;
  displayed_link: string;
  thumbnail: string;
  snippet: string;
  duration: string;
  date: string;
}

interface VideosSerpResponse {
  short_video_results?: [];
  video_results?: VideoResultItem[];
  news_results?: [];
  images_results?: [];
  organic_results?: [];
  // Add other fields if needed, like `inline_videos?: { link: string }[]`
}

interface SerpApiResponse {
  videos?: { link: string }[];
  // Add other fields if needed, like `inline_videos?: { link: string }[]`
}

export class VideosSerpData extends OpenAPIRoute {
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
      const  videosRes
       = await 
        fetch(
          `${altSerpUrl}?q=${encodeURIComponent(query)}&api_key=${
            process.env.ALT_SERP_API_KEY
          }&engine=google_videos_light&gl=${countryCode}&location=${country},`,
          {
            method: "GET",
            headers: {
              "Content-Type": "application/json",
            },
          }
        );

      const  [videosJson]
       = await Promise.all([
        videosRes.json() as Promise<VideosSerpResponse>
        ]);


      const videosLinks = (videosJson?.video_results || []).map(
        (item: any): VideoResultItem => ({
          //position: typeof item.position === "number" ? item.position : 0,
          title: typeof item.title === "string" ? item.title : "",
          link: typeof item.link === "string" ? item.link : "",
          displayed_link: typeof item.displayed_link === "string" ? item.displayed_link : "",
          thumbnail: typeof item.thumbnail === "string" ? item.thumbnail : "",
          snippet: typeof item.snippet === "string" ? item.snippet : "",
          duration: typeof item.duration === "string" ? item.duration : "",
          date: typeof item.date === "string" ? item.date : "",
        })
      );

      // const webLinks = (webJson?.organic_results || []).map(
      //   (item: any) => item
      // );

      // const newsLinks = (newsJson?.news_results || []).map(
      //   (item: any) => item
      // );

      // const imagesLinks = (imagesJson?.images_results || []).map(
      //   (item: any) => item
      // );

      return {
        query,
        //web_results: [...webLinks],
        data: [...videosLinks],
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
