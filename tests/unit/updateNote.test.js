
const { test, describe } = require("node:test");
const assert = require("node:assert/strict");

const {
  DynamoDBDocumentClient,
  UpdateCommand
} = require("../../backend/functions/updateNote/node_modules/@aws-sdk/lib-dynamodb");

process.env.TABLE_NAME = "GhibliNotes-test";

const { handler } = require("../../backend/functions/updateNote");

describe("UpdateNote Lambda", () => {


  test("returns 500 when TABLE_NAME environment variable is missing", async () => {
    const originalTableName = process.env.TABLE_NAME;
    const originalConsoleError = console.error;

    delete process.env.TABLE_NAME;
    console.error = () => {};

    try {
      const event = {
        body: JSON.stringify({
          title: "Test Note",
          text: "Testing missing table configuration."
        }),
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
      assert.match(
        JSON.parse(result.body).message,
        /unexpected error/i
      );
    } finally {
      process.env.TABLE_NAME = originalTableName;
      console.error = originalConsoleError;
    }
  });


  test("returns 401 when the authenticated user ID is missing", async () => {
    const event = {
      body: JSON.stringify({
        title: "Updated Note",
        text: "Updated content."
      }),
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
      body: JSON.stringify({
        title: "Updated Note",
        text: "Updated content."
      }),
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

  test("returns 400 when the request body is invalid JSON", async () => {
    const event = {
      body: "{invalid json}",
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

    assert.equal(result.statusCode, 400);
  });

  test("returns 400 when title or note text is empty", async () => {
    const event = {
      body: JSON.stringify({
        title: "Updated Note",
        text: "   "
      }),
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

    assert.equal(result.statusCode, 400);
  });

  test("returns 404 when the note does not exist", async () => {
    const originalSend = DynamoDBDocumentClient.prototype.send;

    DynamoDBDocumentClient.prototype.send = async (command) => {
      assert.ok(command instanceof UpdateCommand);

      const error = new Error("The conditional request failed.");
      error.name = "ConditionalCheckFailedException";

      throw error;
    };

    try {
      const event = {
        body: JSON.stringify({
          title: "Updated Note",
          text: "Updated content."
        }),
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

  test("updates a note successfully", async () => {
    const originalSend = DynamoDBDocumentClient.prototype.send;

    let capturedCommand;

    const updatedNote = {
      userId: "test-user-123",
      noteId: "note-123",
      title: "Updated Title",
      text: "Updated note content.",
      updatedAt: new Date().toISOString()
    };

    DynamoDBDocumentClient.prototype.send = async (command) => {
      capturedCommand = command;

      return {
        Attributes: updatedNote
      };
    };

    try {
      const event = {
        body: JSON.stringify({
          title: "Updated Title",
          text: "Updated note content."
        }),
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

      assert.deepEqual(responseBody.note, updatedNote);

      assert.ok(capturedCommand instanceof UpdateCommand);

      assert.deepEqual(capturedCommand.input.Key, {
        userId: "test-user-123",
        noteId: "note-123"
      });

      assert.equal(
        capturedCommand.input.ExpressionAttributeValues[":title"],
        "Updated Title"
      );

      assert.equal(
        capturedCommand.input.ExpressionAttributeValues[":text"],
        "Updated note content."
      );

      assert.equal(
        capturedCommand.input.ReturnValues,
        "ALL_NEW"
      );

    } finally {
      DynamoDBDocumentClient.prototype.send = originalSend;
    }
  });


  test("returns 400 when the request body is missing", async () => {
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

    assert.equal(result.statusCode, 400);
  });

  test("returns 400 when title or text is not a string", async () => {
    const event = {
      body: JSON.stringify({
        title: 123,
        text: "Updated content."
      }),
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

    assert.equal(result.statusCode, 400);
  });

  test("returns 400 when the title exceeds 200 characters", async () => {
    const event = {
      body: JSON.stringify({
        title: "A".repeat(201),
        text: "Updated content."
      }),
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

    assert.equal(result.statusCode, 400);
  });

  test("returns 500 when DynamoDB fails to update a note", async () => {
    const originalSend = DynamoDBDocumentClient.prototype.send;
    const originalConsoleError = console.error;

    DynamoDBDocumentClient.prototype.send = async () => {
      throw new Error("DynamoDB update failed");
    };

    console.error = () => {};

    try {
      const event = {
        body: JSON.stringify({
          title: "Updated Note",
          text: "Updated content."
        }),
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


});
