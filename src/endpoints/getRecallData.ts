import { OpenAPIRoute, Str } from "chanfana";
import { z } from "zod";
import { type AppContext } from "../types.js";
import admin from "firebase-admin";
import "dotenv/config";

export class GetRecallData extends OpenAPIRoute {
  schema = {
    tags: ["Instagram Answer Generator"],
    summary: "Generate an answer based on IG video content",
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
      const shortcodes = allSourceUrls.map((url: string) => {
        try {
          const split_url = url.split("/");
          const post_tags = ["p", "reel", "tv", "reels"];
          const index_shortcode =
            split_url.findIndex((item) => post_tags.includes(item)) + 1;
          const shortcode = split_url[index_shortcode];
          return shortcode;
        } catch (err: any) {
          throw new Error(`Failed to obtain shortcode: ${err.message}`);
        }
      });

      let totalDuration = 0;
      const snippets = await Promise.all(
        shortcodes.map(async (shortcode) => {
          try {
            const docRef = admin
              .firestore()
              .collection("short-videos")
              .doc(shortcode);
            const docSnap = await docRef.get();
            if (!docSnap.exists)
              return `Shortcode: ${shortcode} (no data found)`;
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
            return `Shortcode: ${shortcode}
Username: ${data.username || ""}
Full Name: ${data.fullname || ""}
Caption: ${data.caption || ""}
Created At: ${createdAt}
Framewatch: ${data.framewatch || ""}
Followers: ${data.totalFollowers || 0} followers
Media: ${data.totalMedia || 0} media
Views: ${data.views || 0}
Transcription: ${data.transcription || ""}`;
          } catch (err: any) {
            return `Shortcode: ${shortcode} (failed to fetch data: ${err.message})`;
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
      const reorderedSnippets: string[] = [];
      const reorderedSources: string[] = [];
      results.forEach((r: any) => {
        reorderedSnippets.push(snippets[r.index]);
        reorderedSources.push(allSourceUrls[r.index]);
      });
      return c.json({ query: data.body.query, sources: reorderedSources, snippets: reorderedSnippets, total_duration: totalDuration });
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
