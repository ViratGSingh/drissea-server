import { OpenAPIRoute, Str } from "chanfana";
import { z } from "zod";
import { type AppContext } from "../types.js";
import "dotenv/config";

interface WebSerpResponse {
  short_video_results?: [];
  video_results?: [];
  news_results?: [];
  images_results?: [];
  answer_box?: {
    type: string;
    title: string;
    answer: string;
    thumbnail?: string;
  };
  knowledge_graph?: {
    title: string;
    type: string;
    description: string;
    header_images?: {
      image: string;
      source: string;
    }[];
    movies?: {
      extensions?: string[];
      image: string;
    }[];
    movies_and_shows?: {
      extensions?: string[];
      image: string;
    }[];
    tv_shows?: {
      extensions?: string[];
      image: string;
    }[];
    video_games?: {
      extensions?: string[];
      image: string;
    }[];
    books?: {
      extensions?: string[];
      image: string;
    }[];
  };
  
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

    

    const serpUrl = "https://google.serper.dev/videos";
    const altSerpUrl = "https://serpapi.com/search";

    try {
     
      //Get Search Results
      const  webRes
        = await 
        fetch(
          `${altSerpUrl}?q=${encodeURIComponent(query)}&api_key=${
            process.env.ALT_SERP_API_KEY
          }&engine=google_light&gl=${countryCode}&location=${country}&safe=off&device=mobile`,
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
        knowledge_graph: webJson?.knowledge_graph
          ? {
              title: webJson.knowledge_graph.title,
              type: webJson.knowledge_graph.type,
              description: webJson.knowledge_graph.description,
              header_images: webJson.knowledge_graph.header_images?.map((hi) => ({
                image: hi.image,
                source: hi.source,
              })),
              movies: webJson.knowledge_graph.movies?.map((m) => ({
                extensions: m.extensions,
                image: m.image,
              })),
              movies_and_shows: webJson.knowledge_graph.movies_and_shows?.map((m) => ({
                extensions: m.extensions,
                image: m.image,
              })),
              tv_shows: webJson.knowledge_graph.tv_shows?.map((t) => ({
                extensions: t.extensions,
                image: t.image,
              })),
              video_games: webJson.knowledge_graph.video_games?.map((v) => ({
                extensions: v.extensions,
                image: v.image,
              })),
              books: webJson.knowledge_graph.books?.map((b) => ({
                extensions: b.extensions,
                image: b.image,
              })),
            }
          : {},
        answer_box: webJson?.answer_box
          ? {
              type: webJson.answer_box.type,
              title: webJson.answer_box.title,
              answer: webJson.answer_box.answer,
              thumbnail: webJson.answer_box.thumbnail,
            }
          : {},
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
