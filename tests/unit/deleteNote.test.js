
const { test, describe } = require("node:test");
const assert = require("node:assert/strict");

const {
  DynamoDBDocumentClient,
  DeleteCommand
} = require("../../backend/functions/deleteNote/node_modules/@aws-sdk/lib-dynamodb");

process.env.TABLE_NAME = "GhibliNotes-test";

const { handler } = require("../../backend/functions/deleteNote");

describe("DeleteNote Lambda", () => {

  test("returns 401 when the authenticated user ID is missing", async () => {
    const event = {
      pathParameters: {
        noteId: "note-123"
      },
      requestContext: {
        authorizer: {
          jwt: {
            claims: {}
          }
        }
      }
    };

    const result = await handler(event);

    assert.equal(result.statusCode, 401);
  });

  test("returns 400 when the note ID is missing", async () => {
    const event = {
      requestContext: {
        authorizer: {
          jwt: {
            claims: {
              sub: "test-user-123"
            }
          }
        }
      }
    };

    const result = await handler(event);

    assert.equal(result.statusCode, 400);
  });

  test("returns 404 when the note does not exist", async () => {
    const originalSend = DynamoDBDocumentClient.prototype.send;

    DynamoDBDocumentClient.prototype.send = async (command) => {
      assert.ok(command instanceof DeleteCommand);

      const error = new Error("The conditional request failed.");
      error.name = "ConditionalCheckFailedException";

      throw error;
    };

    try {
      const event = {
        pathParameters: {
          noteId: "missing-note"
        },
        requestContext: {
          authorizer: {
            jwt: {
              claims: {
                sub: "test-user-123"
              }
            }
          }
        }
      };

      const result = await handler(event);

      assert.equal(result.statusCode, 404);

    } finally {
      DynamoDBDocumentClient.prototype.send = originalSend;
    }
  });

  test("deletes a note successfully", async () => {
    const originalSend = DynamoDBDocumentClient.prototype.send;

    let capturedCommand;

    const deletedNote = {
      userId: "test-user-123",
      noteId: "note-123",
      title: "My Note",
      text: "This note will be deleted."
    };

    DynamoDBDocumentClient.prototype.send = async (command) => {
      capturedCommand = command;

      return {
        Attributes: deletedNote
      };
    };

    try {
      const event = {
        pathParameters: {
          noteId: "note-123"
        },
        requestContext: {
          authorizer: {
            jwt: {
              claims: {
                sub: "test-user-123"
              }
            }
          }
        }
      };

      const result = await handler(event);

      assert.equal(result.statusCode, 200);

      const responseBody = JSON.parse(result.body);

      assert.equal(
        responseBody.message,
        "Note deleted successfully."
      );

      assert.deepEqual(responseBody.note, deletedNote);

      assert.ok(capturedCommand instanceof DeleteCommand);

      assert.deepEqual(capturedCommand.input.Key, {
        userId: "test-user-123",
        noteId: "note-123"
      });

      assert.equal(
        capturedCommand.input.ReturnValues,
        "ALL_OLD"
      );

    } finally {
      DynamoDBDocumentClient.prototype.send = originalSend;
    }
  });

  test("uses a condition expression to prevent deleting nonexistent notes", async () => {
    const originalSend = DynamoDBDocumentClient.prototype.send;

    let capturedCommand;

    DynamoDBDocumentClient.prototype.send = async (command) => {
      capturedCommand = command;

      return {
        Attributes: {}
      };
    };

    try {
      const event = {
        pathParameters: {
          noteId: "note-123"
        },
        requestContext: {
          authorizer: {
            jwt: {
              claims: {
                sub: "test-user-123"
              }
            }
          }
        }
      };

      await handler(event);

      assert.equal(
        capturedCommand.input.ConditionExpression,
        "attribute_exists(userId) AND attribute_exists(noteId)"
      );

    } finally {
      DynamoDBDocumentClient.prototype.send = originalSend;
    }
  });

  test("returns 500 when DynamoDB encounters an unexpected error", async () => {
    const originalSend = DynamoDBDocumentClient.prototype.send;
    const originalConsoleError = console.error;

    DynamoDBDocumentClient.prototype.send = async () => {
      throw new Error("Simulated DynamoDB failure.");
    };

    console.error = () => {};

    try {
      const event = {
        pathParameters: {
          noteId: "note-123"
        },
        requestContext: {
          authorizer: {
            jwt: {
              claims: {
                sub: "test-user-123"
              }
            }
          }
        }
      };

      const result = await handler(event);

      assert.equal(result.statusCode, 500);

    } finally {
      DynamoDBDocumentClient.prototype.send = originalSend;
      console.error = originalConsoleError;
    }
  });


  test("returns 400 when the note ID is an empty string", async () => {
    const event = {
      pathParameters: {
        noteId: ""
      },
      requestContext: {
        authorizer: {
          jwt: {
            claims: {
              sub: "test-user-123"
            }
          }
        }
      }
    };

    const result = await handler(event);

    assert.equal(result.statusCode, 400);
  });

  test("returns 500 when the DynamoDB table name is missing", async () => {
    const originalTableName = process.env.TABLE_NAME;
    const originalConsoleError = console.error;

    delete process.env.TABLE_NAME;
    console.error = () => {};

    try {
      const event = {
        pathParameters: {
          noteId: "note-123"
        },
        requestContext: {
          authorizer: {
            jwt: {
              claims: {
                sub: "test-user-123"
              }
            }
          }
        }
      };

    const result = await handler(event);

    assert.equal(result.statusCode, 500);

    const body = JSON.parse(result.body);

    assert.equal(
      body.message,
      "An unexpected error occurred while deleting the note."
    );

  } finally {
    process.env.TABLE_NAME = originalTableName;
    console.error = originalConsoleError;
  }
});

});
