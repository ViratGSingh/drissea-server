import { OpenAPIRoute, Str } from "chanfana";
import { z } from "zod";
import { type AppContext } from "../types.js";
import "dotenv/config";
import admin from "firebase-admin";

export class UpdateUserData extends OpenAPIRoute {
  schema = {
    tags: ["Users"],
    summary: "Update User Data",
    request: {
      body: {
        content: {
          "application/json": {
            schema: z.object({
              email: z.string(),
              data: z.record(z.any()),
            }),
          },
        },
      },
    },
    responses: {
      "200": {
        description: "Successfully updated user data",
        content: {
          "application/json": {
            schema: z.object({
              success: z.boolean(),
              id: Str(),
            }),
          },
        },
      },
      "400": {
        description: "Missing or invalid request body",
        content: {
          "application/json": {
            schema: z.object({
              error: Str(),
            }),
          },
        },
      },
      "401": {
        description: "Unauthorized",
        content: {
          "application/json": {
            schema: z.object({
              error: Str(),
            }),
          },
        },
      },
      "404": {
        description: "User not found",
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
        { status: 401 }
      );
    }

    if (!admin.apps.length) {
      admin.initializeApp({
        credential: admin.credential.cert(
          require("../../serviceAccountKey.json")
        ),
      });
    }

    const { body } = await this.getValidatedData<typeof this.schema>();
    const { email, data } = body;
    const firestore = admin.firestore();

    try {
      const usersRef = firestore.collection("users");
      const snapshot = await usersRef.where("email", "==", email).limit(1).get();

      if (snapshot.empty) {
        return c.json(
          { success: false, error: "User not found" },
          { status: 404 }
        );
      }

      const doc = snapshot.docs[0];
      await usersRef.doc(doc.id).update({
        ...data,
        updatedAt: new Date().toISOString(),
      });

      return c.json({
        success: true,
        id: doc.id,
      });
    } catch (error: any) {
      console.error("Error updating user:", error);
      return c.json(
        { success: false, error: "Internal server error" },
        { status: 500 }
      );
    }
  }
}
