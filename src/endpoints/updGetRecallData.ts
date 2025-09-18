import { OpenAPIRoute, Str } from "chanfana";
import { z } from "zod";
import { type AppContext } from "../types.js";
import admin from "firebase-admin";
import "dotenv/config";

export class UpdGetRecallData extends OpenAPIRoute {
  schema = {
    tags: ["Recall"],
    summary: "Get videos based on the query",
    request: {
      body: {
        content: {
          "application/json": {
            schema: z.object({
              query: Str(),
              email: Str(),
            }),
          },
        },
      },
    },
    responses: {
      "200": {
        description: "Generated answer",
        content: {
          "application/json": {
            schema: z.object({
              content: Str(),
            }),
          },
        },
      },
      "400": {
        description: "Missing or invalid parameters",
        content: {
          "application/json": {
            schema: z.object({
              error: Str(),
            }),
          },
        },
      },
      "500": {
        description: "Internal server error",
        content: {
          "application/json": {
            schema: z.object({
              error: Str(),
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
        401
      );
    }
    if (!admin.apps.length) {
      admin.initializeApp({
        credential: admin.credential.cert(
          require("../../serviceAccountKey.json")
        ),
      });
    }
    try {
      const data = await this.getValidatedData<typeof this.schema>();
      const { email } = data.body;

      const sessionsSnapshot = await admin
        .firestore()
        .collection("sessions")
        .where("email", "==", email)
        .orderBy("createdAt", "desc")
        .limit(5)
        .get();

      const sessions = sessionsSnapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }));

      const allSourceUrls = sessions.flatMap((s: any) => s.sourceUrls || []);
      const seenUrls = new Set<string>();
      const shortcodesWithPlatform = allSourceUrls.map((url: string) => {
        if (seenUrls.has(url)) {
          return null; // skip duplicate
        }
        seenUrls.add(url);
        try {
          if (url.includes("instagram.com")) {
            const split_url = url.split("/");
            const post_tags = ["p", "reel", "tv", "reels"];
            const index_shortcode =
              split_url.findIndex((item) => post_tags.includes(item)) + 1;
            const shortcode = split_url[index_shortcode];
            return { platform: "instagram", code: shortcode };
          } else if (url.includes("youtube.com") || url.includes("youtu.be")) {
            let videoId = "";
            if (url.includes("youtube.com/watch")) {
              const params = new URL(url).searchParams;
              videoId = params.get("v") || "";
            } else if (url.includes("youtube.com/shorts/")) {
              const split_url = url.split("/");
              const index =
                split_url.findIndex((item) => item === "shorts") + 1;
              videoId = split_url[index];
            } else if (url.includes("youtu.be/")) {
              const split_url = url.split("/");
              videoId = split_url[split_url.length - 1];
            }
            return { platform: "youtube", code: videoId };
          } else {
            throw new Error("Unsupported URL format");
          }
        } catch (err: any) {
          throw new Error(`Failed to obtain shortcode: ${err.message}`);
        }
      }).filter(Boolean) as { platform: string; code: string }[];

      const instagramShortcodes = shortcodesWithPlatform
        .filter((item) => item.platform === "instagram")
        .map((item) => item.code);

      const youtubeIds = shortcodesWithPlatform
        .filter((item) => item.platform === "youtube")
        .map((item) => item.code);

      let totalDuration = 0;
      const snippets = await Promise.all(
        shortcodesWithPlatform.map(async ({ platform, code }) => {
          if (platform === "instagram") {
            try {
              const docRef = admin
                .firestore()
                .collection("short-videos")
                .doc(code);
              const docSnap = await docRef.get();
              if (!docSnap.exists) return `Shortcode: ${code} (no data found)`;
              const data = docSnap.data() || {};
              totalDuration += data.duration || 0;
              let createdAt = data.createdAt;
              if (createdAt && typeof createdAt.toDate === "function") {
                createdAt = createdAt.toDate().toISOString();
              } else if (createdAt instanceof Date) {
                createdAt = createdAt.toISOString();
              } else if (typeof createdAt === "string") {
                // keep as is
              } else {
                createdAt = "";
              }
              return `
              Username: ${data.username || ""}
              Full Name: ${data.fullname || ""}
              Caption: ${data.caption || ""}
              Created At: ${createdAt}
              Framewatch: ${data.framewatch || ""}
              Transcription: ${data.transcription || ""}
              `;
            } catch (err: any) {
              return `Shortcode: ${code} (failed to fetch data: ${err.message})`;
            }
          } else {
            try {
              const docRef = admin
                .firestore()
                .collection("yt-videos")
                .doc(code);
              const docSnap = await docRef.get();
              if (!docSnap.exists) return `Shortcode: ${code} (no data found)`;
              const data = docSnap.data() || {};
              totalDuration += data.duration || 0;
              let createdAt = data.createdAt;
              if (createdAt && typeof createdAt.toDate === "function") {
                createdAt = createdAt.toDate().toISOString();
              } else if (createdAt instanceof Date) {
                createdAt = createdAt.toISOString();
              } else if (typeof createdAt === "string") {
                // keep as is
              } else {
                createdAt = "";
              }
              return `
              Full Name: ${data.fullname || ""}
              Caption: ${data.caption || ""}
              Created At: ${createdAt}
              `;
            } catch (err: any) {
              return `Shortcode: ${code} (failed to fetch data: ${err.message})`;
            }
          }
        })
      );

      // Rerank with Jina API

      const rerankRes = await fetch("https://api.jina.ai/v1/rerank", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${process.env.JINA_API_KEY || ""}`,
        },
        body: JSON.stringify({
          model: "jina-reranker-v2-base-multilingual",
          query: data.body.query,
          top_n: 20,
          documents: snippets,
          return_documents: false,
        }),
      });

      // Tell TypeScript the type of the parsed JSON
      const rerankJson = (await rerankRes.json()) as JinaRerankResponse;

      // Now TypeScript knows rerankJson has a results array
      const results = rerankJson.results || [];
      //const reorderedSnippets: string[] = [];
      const reorderedSources: string[] = [];
      results.forEach((r: any) => {
        //reorderedSnippets.push(snippets[r.index]);
        reorderedSources.push(allSourceUrls[r.index]);
      });
      return c.json({
        sources: reorderedSources,
        //snippets: reorderedSnippets,
        total_duration: totalDuration,
      });
    } catch (error) {
      console.error("Error in GetRecallData route:", error);
      return c.json(
        { error: "Something went wrong while fetching sessions." },
        500
      );
    }
  }
}

type JinaRerankResponse = {
  model: string;
  usage: { total_tokens: number };
  results: { index: number; relevance_score: number }[];
};
