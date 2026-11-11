const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");

const {
  DynamoDBDocumentClient,
  UpdateCommand,
} = require("@aws-sdk/lib-dynamodb");

// Create DynamoDB client
const dynamoDB = DynamoDBDocumentClient.from(
  new DynamoDBClient({})
);

exports.handler = async (event) => {
  try {
    const tableName = process.env.TABLE_NAME;
    // 1. Verify table configuration
    if (!tableName) {
      throw new Error("TABLE_NAME environment variable is missing.");
    }

    // 2. Identify authenticated user through Cognito
    const userId = event.requestContext?.authorizer?.jwt?.claims?.sub;

    if (!userId) {
      return response(401, {
        message: "Unauthorized: User identity could not be verified.",
      });
    }

    // 3. Get note ID from API path
    const noteId = event.pathParameters?.noteId;

    if (!noteId) {
      return response(400, {
        message: "A note ID is required.",
      });
    }

    // 4. Parse request body
    if (!event.body) {
      return response(400, {
        message: "Request body is required.",
      });
    }

    const bodyString = event.isBase64Encoded
      ? Buffer.from(event.body, "base64").toString("utf-8")
      : event.body;

    let requestBody;

    try {
      requestBody = JSON.parse(bodyString);
    } catch {
      return response(400, {
        message: "Request body must contain valid JSON.",
      });
    }

    if (
      typeof requestBody !== "object" ||
      requestBody === null ||
      Array.isArray(requestBody)
    ) {
      return response(400, {
        message: "Request body must be a JSON object.",
      });
    }

    const rawTitle = requestBody.title;
    const rawText = requestBody.text;

    if (
      typeof rawTitle !== "string" ||
      typeof rawText !== "string"
    ) {
      return response(400, {
        message: "A valid title and note text are required.",
      });
    }

    const title = rawTitle.trim();
    const text = rawText.trim();

    if (!title || !text) {
      return response(400, {
       message: "Title and note text cannot be empty.",
      });
    }

    if (title.length > 200 || text.length > 10000) {
      return response(400, {
        message: "Title or note text exceeds the allowed length.",
      });
    }

    // 6. Update the note in DynamoDB
    const timestamp = new Date().toISOString();

    const result = await dynamoDB.send(
      new UpdateCommand({
        TableName: tableName,

        Key: {
          userId,
          noteId,
        },

        UpdateExpression:
          "SET title = :title, #noteText = :text, updatedAt = :updatedAt",

        ConditionExpression:
          "attribute_exists(userId) AND attribute_exists(noteId)",

        ExpressionAttributeNames: {
          "#noteText": "text",
        },

        ExpressionAttributeValues: {
          ":title": title,
          ":text": text,
          ":updatedAt": timestamp,
        },

        ReturnValues: "ALL_NEW",
      })
    );

    // 7. Return updated note
    return response(200, {
      message: "Note updated successfully.",
      note: result.Attributes,
    });

  } catch (error) {
    // Return 404 when the note doesn't exist for this user
    if (error.name === "ConditionalCheckFailedException") {
      return response(404, {
        message: "Note not found.",
      });
    }

    console.error("Error updating note:", error);

    return response(500, {
      message: "An unexpected error occurred while updating the note.",
    });
  }
};

// Reusable HTTP response helper
function response(statusCode, body) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  };
}