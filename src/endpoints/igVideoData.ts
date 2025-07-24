import { OpenAPIRoute, Str } from "chanfana";
import { z } from "zod";
import { initFirebase } from "../firebase";
import { type AppContext } from "../types";
import { Groq } from "groq-sdk";
import { success } from "zod/v4";

export class IGVideoData extends OpenAPIRoute {
  schema = {
    tags: ["Instagram Get Video Data"],
    summary: "Watch IG video and transcribe its audio",
    request: {
      query: z.object({
        url: Str({ description: "IG reel url" }),
      }),
    },
    responses: {
      "200": {
        description: "Successfully retrieved video and translation",
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
    if (!authHeader || authHeader !== `Bearer ${c.env.API_SECRET}`) {
      console.log(c.env.API_SECRET);
      console.log(authHeader);
      return Response.json(
        {
          success: false,
          error: "Unauthorized",
        },
        { status: 401 }
      );
    }

    const data = await this.getValidatedData<typeof this.schema>();
    const { url } = data.query;

    // Get IG reel info
    const reelUrl = url; // Assuming searchId contains the Instagram reel URL
    const response = await fetch(`https://instagram-scraper-api2.p.rapidapi.com/v1/post_info?code_or_id_or_url=${encodeURIComponent(reelUrl)}`, {
      method: "GET",
      headers: {
        "x-rapidapi-host": "instagram-scraper-api2.p.rapidapi.com",
        "x-rapidapi-key": c.env.IG_RAPID_API_KEY,
      },
    });

    if (!response.ok) {
      return Response.json({ error: "Failed to fetch IG data", success: false}, { status: 400 });
    }

    const json = (await response.json()) as { data?: any };
    const videoUrl = json?.data?.video_versions?.[0]?.url;
    const thumbnailUrl = json?.data?.thumbnail_url??"";
    const caption = json?.data?.caption?.text??"";
    const username = json?.data?.user?.username??"";
    const fullname = json?.data?.user?.full_name??"";
    const userId = json?.data?.user?.id??"";
    const isVerified = json?.data?.user?.is_verified??false;
    const videoDuration = json?.data?.video_duration??0;
    const hasAudio = json?.data?.has_audio??false;
    const videoId = json?.data?.code??"";


    if (!videoUrl) {
      return Response.json({ error: "No video URL found" }, { status: 404 });
    }


    var translatedText =  "";
    if(hasAudio==true){
      // Translate using Groq SDK
      const groq = new Groq({ apiKey: c.env.GROQ_API_KEY });
      const transcriptResponse = await groq.audio.translations.create({
        url:videoUrl,
        model: "whisper-large-v3",
        response_format: "json", // Optional
        temperature: 0.0, // Optional
      });
      translatedText = transcriptResponse.text;
    }

    return Response.json({
      "data":{
        "user":{
          "id": userId,
          "username": username,
          "fullname": fullname,
          "is_verified": isVerified,
        },
        "video":{
          "id":videoId,
          "duration":videoDuration,
          "thumbnail_url":thumbnailUrl,
          "video_url":videoUrl,
          "caption":caption,
          "transcription":translatedText
        }
      },
      "success":true
    });
  }
}

type Answer = {
  created_at: string;
  process: string;
  reply: string;
  source_links: string[];
};
