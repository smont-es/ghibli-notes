const { randomUUID } = require("crypto");

const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const {
  DynamoDBDocumentClient,
  PutCommand,
} = require("@aws-sdk/lib-dynamodb");

// Create the DynamoDB client
const dynamoDB = DynamoDBDocumentClient.from(
  new DynamoDBClient({})
);

// Get the DynamoDB table name from the Lambda environment

exports.handler = async (event) => {
const tableName = process.env.TABLE_NAME;
  try {
    // 1. Verify that the table name is configured
    if (!tableName) {
      throw new Error("TABLE_NAME environment variable is missing.");
    }

    // 2. Get the authenticated user's ID from Cognito JWT claims
    const userId = event.requestContext?.authorizer?.jwt?.claims?.sub;

    if (!userId) {
      return response(401, {
        message: "Unauthorized: User identity could not be verified.",
      });
    }

    // 3. Parse the incoming request body
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
  (rawTitle !== undefined && typeof rawTitle !== "string") ||
  typeof rawText !== "string"
) {
  return response(400, {
    message: "A valid note title and text are required.",
  });
}

const title = rawTitle?.trim() || "No Title";
const text = rawText.trim();

if (!text) {
  return response(400, {
    message: "Note text cannot be empty.",
  });
}

    if (title.length > 200 || text.length > 10000) {
      return response(400, {
        message: "Title or note text exceeds the allowed length.",
      });
    }

    // 5. Generate a unique note ID
    const noteId = randomUUID();
    const timestamp = new Date().toISOString();

    // 6. Create the note object
    const note = {
      userId,
      noteId,
      title,
      text,
      createdAt: timestamp,
      updatedAt: timestamp,
    };

    // 7. Save the note to DynamoDB
    await dynamoDB.send(
      new PutCommand({
        TableName: tableName,
        Item: note,
        ConditionExpression: "attribute_not_exists(userId) AND attribute_not_exists(noteId)",
      })
    );

    // 8. Return a successful response
    return response(201, {
      message: "Note created successfully.",
      note,
    });

  } catch (error) {
    console.error("Error creating note:", error);

    return response(500, {
      message: "An unexpected error occurred while creating the note.",
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