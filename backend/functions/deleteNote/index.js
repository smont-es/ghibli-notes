const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");

const {
  DynamoDBDocumentClient,
  DeleteCommand,
} = require("@aws-sdk/lib-dynamodb");

// Create DynamoDB client
const dynamoDB = DynamoDBDocumentClient.from(
  new DynamoDBClient({})
);

exports.handler = async (event) => {
  try {
    // 1. Verify table configuration
    const tableName = process.env.TABLE_NAME;

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

    // 4. Delete the note from DynamoDB
    const result = await dynamoDB.send(
      new DeleteCommand({
        TableName: tableName,

        Key: {
          userId,
          noteId,
        },

        // Only delete if the note exists
        ConditionExpression:
          "attribute_exists(userId) AND attribute_exists(noteId)",

        ReturnValues: "ALL_OLD",
      })
    );

    // 5. Return successful response
    return response(200, {
      message: "Note deleted successfully.",
      note: result.Attributes,
    });

  } catch (error) {
    // Return 404 when the note doesn't exist for this user
    if (error.name === "ConditionalCheckFailedException") {
      return response(404, {
        message: "Note not found.",
      });
    }

    console.error("Error deleting note:", error);

    return response(500, {
      message: "An unexpected error occurred while deleting the note.",
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