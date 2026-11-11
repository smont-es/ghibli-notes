
const { test, describe } = require("node:test");
const assert = require("node:assert/strict");

const {
  DynamoDBDocumentClient,
  PutCommand
} = require("../../backend/functions/addNote/node_modules/@aws-sdk/lib-dynamodb");

process.env.TABLE_NAME = "GhibliNotes-test";

const { handler } = require("../../backend/functions/addNote");

describe("AddNote Lambda", () => {


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

test("returns 400 when the request body is missing", async () => {
  const event = {
    body: null,
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

test("returns 400 when the request body is not a JSON object", async () => {
  const event = {
    body: JSON.stringify(["invalid", "body"]),
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

test("creates a note with the default title when no title is provided", async () => {
  const originalSend = DynamoDBDocumentClient.prototype.send;

  DynamoDBDocumentClient.prototype.send = async (command) => {
    assert.ok(command instanceof PutCommand);
    assert.equal(command.input.Item.title, "No Title");
    return {};
  };

  try {
    const event = {
      body: JSON.stringify({
        text: "A note without a custom title."
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

    assert.equal(result.statusCode, 201);
    assert.equal(
      JSON.parse(result.body).note.title,
      "No Title"
    );

  } finally {
    DynamoDBDocumentClient.prototype.send = originalSend;
  }
});

test("returns 500 when DynamoDB fails to save a note", async () => {
  const originalSend = DynamoDBDocumentClient.prototype.send;
  const originalConsoleError = console.error;

  DynamoDBDocumentClient.prototype.send = async () => {
    throw new Error("Simulated DynamoDB failure.");
  };

  console.error = () => {};

  try {
    const event = {
      body: JSON.stringify({
        title: "Test Note",
        text: "Testing a database failure."
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

    assert.equal(result.statusCode, 500);

  } finally {
    DynamoDBDocumentClient.prototype.send = originalSend;
    console.error = originalConsoleError;
  }
});

  test("returns 401 when the authenticated user ID is missing", async () => {
    const event = {
      body: JSON.stringify({
        title: "Test Note",
        text: "This is a test note."
      }),
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

  test("returns 400 when note text is empty", async () => {
    const event = {
      body: JSON.stringify({
        title: "Test Note",
        text: "   "
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

  test("creates a note successfully", async () => {
    const originalSend = DynamoDBDocumentClient.prototype.send;
    let capturedCommand;

    DynamoDBDocumentClient.prototype.send = async (command) => {
      capturedCommand = command;
      return {};
    };

    try {
      const event = {
        body: JSON.stringify({
          title: "My First Test",
          text: "Testing successful note creation."
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

      assert.equal(result.statusCode, 201);

      const responseBody = JSON.parse(result.body);
      const note = responseBody.note;

      assert.equal(note.userId, "test-user-123");
      assert.equal(note.title, "My First Test");
      assert.equal(note.text, "Testing successful note creation.");

      assert.ok(note.noteId);
      assert.ok(note.createdAt);
      assert.ok(note.updatedAt);

      assert.ok(capturedCommand instanceof PutCommand);

      assert.equal(
        capturedCommand.input.TableName,
        "GhibliNotes-test"
      );

      assert.equal(
        capturedCommand.input.Item.userId,
        "test-user-123"
      );

    } finally {
      DynamoDBDocumentClient.prototype.send = originalSend;
    }
  });

  test("returns 400 when the request body contains invalid JSON", async () => {
    const event = {
      body: "{invalid json}",
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

  test("returns 400 when the note title exceeds 200 characters", async () => {
    const event = {
      body: JSON.stringify({
        title: "A".repeat(201),
        text: "This is a valid note."
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

});
