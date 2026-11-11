
const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");

const {
  DynamoDBDocumentClient,
  QueryCommand,
  DeleteCommand,
} = require("@aws-sdk/lib-dynamodb");

// Create DynamoDB client
const dynamoDB = DynamoDBDocumentClient.from(
  new DynamoDBClient({})
);

const BATCH_SIZE = 25;

exports.handler = async (event) => {
  let deletedCount = 0;

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

    // 3. Retrieve up to 25 notes belonging to this user
    const result = await dynamoDB.send(
      new QueryCommand({
        TableName: tableName,
        KeyConditionExpression: "userId = :userId",
        ExpressionAttributeValues: {
          ":userId": userId,
        },
        ProjectionExpression: "userId, noteId",
        Limit: BATCH_SIZE,
      })
    );

    const notes = result.Items || [];

    // 4. Delete the retrieved notes
    for (const note of notes) {
      await dynamoDB.send(
        new DeleteCommand({
          TableName: tableName,
          Key: {
            userId,
            noteId: note.noteId,
          },
          ConditionExpression:
            "attribute_exists(userId) AND attribute_exists(noteId)",
        })
      );

      deletedCount++;
    }

    // 5. Check whether any notes remain
    const remainingNotes = await dynamoDB.send(
      new QueryCommand({
        TableName: tableName,
        KeyConditionExpression: "userId = :userId",
        ExpressionAttributeValues: {
          ":userId": userId,
        },
        ProjectionExpression: "userId, noteId",
        Limit: 1,
        ConsistentRead: true,
      })
    );

    const hasMore = (remainingNotes.Items || []).length > 0;

    // 6. Return batch results
    return response(200, {
      message: hasMore
        ? "Deletion batch completed."
        : "All notes deleted successfully.",
      deletedCount,
      hasMore,
    });

  } catch (error) {
    console.error("Error deleting notes:", error);

    return response(500, {
      message: "An unexpected error occurred while deleting notes.",
      deletedCount,
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
