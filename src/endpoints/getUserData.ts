import { OpenAPIRoute, Str } from "chanfana";
import { z } from "zod";
import { type AppContext } from "../types.js";
import 'dotenv/config';
import admin from "firebase-admin";

export class GetUserData extends OpenAPIRoute {
  schema = {
    tags: ["Users"],
    summary: "Get User Data",
    request: {
      query: z.object({
        email: z.string().describe("Email of the user in the users collection"),
      }),
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
    const { email } = data.query;
    try {
      if (!admin.apps.length) {
        admin.initializeApp({
          credential: admin.credential.cert(require("../../serviceAccountKey.json")),
        });
      }
      const usersRef = admin.firestore().collection("users");
      const snapshot = await usersRef.where("email", "==", email).limit(1).get();
      if (snapshot.empty) {
        return c.json(
          { success: false, error: "User not found" },
          { status: 404 }
        );
      }
      const doc = snapshot.docs[0];
      const userData = doc.data();
      return c.json(
        {
          success: true,
          data: {
            id: doc.id,
            ...userData,
          },
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
