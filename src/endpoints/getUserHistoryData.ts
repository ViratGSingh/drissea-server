import { OpenAPIRoute, Str } from "chanfana";
import { z } from "zod";
import { type AppContext } from "../types.js";
import 'dotenv/config';
import admin from "firebase-admin";

export class GetUserHistoryData extends OpenAPIRoute {
  schema = {
    tags: ["Users"],
    summary: "Get User Data",
    request: {
       body: {
        content: {
          "application/json": {
            schema: z.object({
              email:z.string(),
            }),
          },
        },
      },
    },
    responses: {
      "200": {
        description: "Successfully retrieved user data",
        content: {
          "application/json": {
            schema: z.object({
              success: z.literal(true),
              user: z.record(z.any()),
            }),
          },
        },
      },
      "404": {
        description: "User not found",
        content: {
          "application/json": {
            schema: z.object({
              success: z.literal(false),
              error: z.string(),
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
    const email: string = data.body.email;
    try {
      if (!admin.apps.length) {
        admin.initializeApp({
          credential: admin.credential.cert(require("../../serviceAccountKey.json")),
        });
      }
      const usersRef = admin.firestore().collection("sessions");
  const snapshot = await usersRef
    .where("email", "==", email)
    .orderBy("createdAt", "desc")
    .limit(20)
    .get();

  if (snapshot.empty) {
    return c.json(
      { success: false, error: "No sessions found for this user" },
      { status: 404 }
    );
  }

  const userData = snapshot.docs.map(doc => {
    const data = doc.data();
    return {
      id: doc.id,
      sourceUrls: data.sourceUrls || [],
      query: data.questions?.[0] || data.searchTerms?.[0] || "",
      searchTerm: data.searchTerms?.[0] || "",
      answer: data.answers?.[0] || "",
      createdAt: data.createdAt || "",
      isSearchMode: data.isSearchMode ?? false,
    };
  });

  return c.json(
    {
      success: true,
      data: userData,
    },
    { status: 200 }
  );
    } catch (error: any) {
      console.error("Firestore REST error:", error);
      return c.json(
        { success: false, error: "Internal server error" },
        { status: 500 }
      );
    }
  }
}
