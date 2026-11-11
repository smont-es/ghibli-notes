
const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");

const {
  DynamoDBDocumentClient,
  QueryCommand,
  GetCommand,
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

    // 3. Check whether a specific note ID was requested
    const noteId = event.pathParameters?.noteId;

    // 4. Retrieve one note
    if (noteId) {
      const result = await dynamoDB.send(
        new GetCommand({
          TableName: tableName,
          Key: {
            userId,
            noteId,
          },
        })
      );

      if (!result.Item) {
        return response(404, {
          message: "Note not found.",
        });
      }

      return response(200, {
        note: result.Item,
      });
    }

    // 5. Read and validate pagination parameters
    const queryParameters = event.queryStringParameters || {};

    const requestedLimit = queryParameters.limit || "20";
    const limit = Number(requestedLimit);

    if (
      !Number.isInteger(limit) ||
      limit < 1 ||
      limit > 100
    ) {
      return response(400, {
        message: "Limit must be an integer between 1 and 100.",
      });
    }

    // 6. Decode the pagination token, if supplied
    let exclusiveStartKey;

    if (queryParameters.nextToken) {
      try {
        const decodedToken = Buffer.from(
          queryParameters.nextToken,
          "base64url"
        ).toString("utf-8");

        exclusiveStartKey = JSON.parse(decodedToken);

        // Ensure the token belongs to the authenticated user
        if (
          !exclusiveStartKey ||
          typeof exclusiveStartKey !== "object" ||
          exclusiveStartKey.userId !== userId ||
          typeof exclusiveStartKey.noteId !== "string"
        ) {
          return response(400, {
            message: "Invalid pagination token.",
          });
        }
      } catch {
        return response(400, {
          message: "Invalid pagination token.",
        });
      }
    }

    // 7. Retrieve one page of the user's notes
    const result = await dynamoDB.send(
      new QueryCommand({
        TableName: tableName,
        KeyConditionExpression: "userId = :userId",
        ExpressionAttributeValues: {
          ":userId": userId,
        },
        ScanIndexForward: false,
        Limit: limit,
        ExclusiveStartKey: exclusiveStartKey,
      })
    );

    // 8. Generate a token if more notes are available
    const nextToken = result.LastEvaluatedKey
      ? Buffer.from(
          JSON.stringify(result.LastEvaluatedKey)
        ).toString("base64url")
      : null;

    // 9. Return the current page
    return response(200, {
      notes: result.Items || [],
      count: result.Count || 0,
      nextToken,
    });

  } catch (error) {
    console.error("Error retrieving notes:", error);

    return response(500, {
      message: "An unexpected error occurred while retrieving notes.",
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
