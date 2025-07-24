import { OpenAPIRoute, Str } from "chanfana";
import { z } from "zod";
import { initFirebase } from "../firebase";
import { type AppContext } from "../types";
import { success } from "zod/v4";

export class SearchData extends OpenAPIRoute {
  schema = {
    tags: ["Answer"],
    summary: "Get answer by searchId from Firestore",
    request: {
      query: z.object({
        searchId: Str({ description: "Firestore document ID in 'answers' collection" }),
      }),
    },
    responses: {
      "200": {
        description: "Successfully retrieved answer",
        success:true,
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
        success:false,
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
        success:false,
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
        success:false,
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
      return Response.json(
        {
          success: false,
          error: "Unauthorized",
        },
        { status: 401 }
      );
    }
    const data = await this.getValidatedData<typeof this.schema>();
    const { searchId } = data.query;

    try {
      const projectId = c.env.FIREBASE_PROJECT_ID;
      const apiKey = c.env.FIREBASE_API_KEY;
      const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/answers/${searchId}?key=${apiKey}`;
      const res = await fetch(url);

      if (!res.ok) {
        return Response.json({ error: url }, { status: 404 });
      }

      const json = (await res.json()) as { fields?: any };
      const fields = json.fields;

      const query = fields?.query?.stringValue || "";
      const answer = fields?.answer?.stringValue || "";
      const process = fields?.process?.stringValue || "";
      const sourceUrls = (fields?.source_links?.arrayValue?.values || []).map((v: any) => v.stringValue);

      return {
        query,
        process,
        answer,
        sourceUrls,
      };
    } catch (error: any) {
      console.error("Firestore REST error:", error);
      return Response.json({ error: "Internal server error" }, { status: 500 });
    }
  }
}

type Answer = {
  created_at: string;
  process: string;
  reply: string;
  source_links: string[];
};
