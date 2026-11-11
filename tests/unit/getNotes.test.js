
const { test, describe } = require("node:test");
const assert = require("node:assert/strict");

const {
  DynamoDBDocumentClient,
  QueryCommand,
  GetCommand
} = require("../../backend/functions/getNotes/node_modules/@aws-sdk/lib-dynamodb");

process.env.TABLE_NAME = "GhibliNotes-test";

const { handler } = require("../../backend/functions/getNotes");

describe("GetNotes Lambda", () => {


  test("returns 500 when TABLE_NAME environment variable is missing", async () => {
    const originalTableName = process.env.TABLE_NAME;
    const originalConsoleError = console.error;

    delete process.env.TABLE_NAME;
    console.error = () => {};

    try {
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


  test("generates and accepts a pagination continuation token", async () => {
    const originalSend = DynamoDBDocumentClient.prototype.send;

    const lastEvaluatedKey = {
      userId: "test-user-123",
      noteId: "note-page-1"
    };

    let capturedCommand;

    DynamoDBDocumentClient.prototype.send = async (command) => {
      capturedCommand = command;

      if (!command.input.ExclusiveStartKey) {
        return {
          Items: [
            {
              userId: "test-user-123",
              noteId: "note-page-1",
              title: "First Page"
            }
          ],
          Count: 1,
          LastEvaluatedKey: lastEvaluatedKey
        };
      }

      return {
        Items: [
          {
            userId: "test-user-123",
            noteId: "note-page-2",
            title: "Second Page"
          }
        ],
        Count: 1
      };
    };

    try {
      const firstEvent = {
        queryStringParameters: {
          limit: "1"
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

      // Request the first page.
      const firstResult = await handler(firstEvent);

      assert.equal(firstResult.statusCode, 200);

      const firstBody = JSON.parse(firstResult.body);

      assert.ok(firstBody.nextToken);

      // Verify the token contains the expected DynamoDB key.
      const decodedKey = JSON.parse(
        Buffer.from(firstBody.nextToken, "base64url").toString("utf-8")
      );

      assert.deepEqual(decodedKey, lastEvaluatedKey);

      // Request the next page using the returned token.
      const secondEvent = {
        queryStringParameters: {
          limit: "1",
          nextToken: firstBody.nextToken
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

      const secondResult = await handler(secondEvent);

      assert.equal(secondResult.statusCode, 200);

      const secondBody = JSON.parse(secondResult.body);

      assert.equal(secondBody.notes[0].title, "Second Page");
      assert.equal(secondBody.nextToken, null);

      // Verify the decoded token was passed to DynamoDB.
      assert.ok(capturedCommand instanceof QueryCommand);

      assert.deepEqual(
        capturedCommand.input.ExclusiveStartKey,
        lastEvaluatedKey
      );

    } finally {
      DynamoDBDocumentClient.prototype.send = originalSend;
    }
  });


  test("returns 401 when the authenticated user ID is missing", async () => {
    const event = {
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

  test("returns 404 when an individual note does not exist", async () => {
    const originalSend = DynamoDBDocumentClient.prototype.send;

    DynamoDBDocumentClient.prototype.send = async (command) => {
      assert.ok(command instanceof GetCommand);
      return {};
    };

    try {
      const event = {
        pathParameters: {
          noteId: "missing-note-123"
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

  test("retrieves an individual note successfully", async () => {
    const originalSend = DynamoDBDocumentClient.prototype.send;

    const mockNote = {
      userId: "test-user-123",
      noteId: "note-123",
      title: "Test Note",
      text: "This is a test note."
    };

    let capturedCommand;

    DynamoDBDocumentClient.prototype.send = async (command) => {
      capturedCommand = command;
      return { Item: mockNote };
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

      assert.deepEqual(responseBody.note, mockNote);
      assert.ok(capturedCommand instanceof GetCommand);

      assert.deepEqual(capturedCommand.input.Key, {
        userId: "test-user-123",
        noteId: "note-123"
      });

    } finally {
      DynamoDBDocumentClient.prototype.send = originalSend;
    }
  });

  test("retrieves a list of notes successfully", async () => {
    const originalSend = DynamoDBDocumentClient.prototype.send;

    const mockNotes = [
      {
        userId: "test-user-123",
        noteId: "note-1",
        title: "First Note",
        text: "First test note."
      },
      {
        userId: "test-user-123",
        noteId: "note-2",
        title: "Second Note",
        text: "Second test note."
      }
    ];

    let capturedCommand;

    DynamoDBDocumentClient.prototype.send = async (command) => {
      capturedCommand = command;

      return {
        Items: mockNotes,
        Count: 2
      };
    };

    try {
      const event = {
        queryStringParameters: {
          limit: "20"
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

      assert.deepEqual(responseBody.notes, mockNotes);
      assert.equal(responseBody.count, 2);
      assert.equal(responseBody.nextToken, null);

      assert.ok(capturedCommand instanceof QueryCommand);

      assert.equal(
        capturedCommand.input.ExpressionAttributeValues[":userId"],
        "test-user-123"
      );

      assert.equal(capturedCommand.input.Limit, 20);

    } finally {
      DynamoDBDocumentClient.prototype.send = originalSend;
    }
  });

  test("returns 400 when the requested limit is outside the allowed range", async () => {
    const event = {
      queryStringParameters: {
        limit: "101"
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

  test("returns 400 when a pagination token belongs to another user", async () => {
    const foreignToken = Buffer.from(
      JSON.stringify({
        userId: "another-user",
        noteId: "note-123"
      })
    ).toString("base64url");

    const event = {
      queryStringParameters: {
        nextToken: foreignToken
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


  test("returns 400 when a pagination token contains invalid JSON", async () => {
    const invalidToken = Buffer.from("not-valid-json").toString("base64url");

    const event = {
      queryStringParameters: {
        nextToken: invalidToken
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

  test("returns 400 when a pagination token has an invalid structure", async () => {
    const invalidToken = Buffer.from(
      JSON.stringify({
        userId: "test-user-123"
      })
    ).toString("base64url");

    const event = {
      queryStringParameters: {
        nextToken: invalidToken
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

  test("returns 500 when DynamoDB fails to retrieve an individual note", async () => {
    const originalSend = DynamoDBDocumentClient.prototype.send;
    const originalConsoleError = console.error;

    DynamoDBDocumentClient.prototype.send = async () => {
      throw new Error("DynamoDB retrieval failed");
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

  test("returns 500 when DynamoDB fails to retrieve the notes list", async () => {
    const originalSend = DynamoDBDocumentClient.prototype.send;
    const originalConsoleError = console.error;

    DynamoDBDocumentClient.prototype.send = async () => {
      throw new Error("DynamoDB query failed");
    };

    console.error = () => {};

    try {
      const event = {
        queryStringParameters: {
          limit: "20"
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
