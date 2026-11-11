
const { test, describe } = require("node:test");
const assert = require("node:assert/strict");

const {
  DynamoDBDocumentClient,
  QueryCommand,
  DeleteCommand
} = require("../../backend/functions/deleteAllNotes/node_modules/@aws-sdk/lib-dynamodb");

process.env.TABLE_NAME = "GhibliNotes-test";

const { handler } = require("../../backend/functions/deleteAllNotes");

describe("DeleteAllNotes Lambda", () => {

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

  test("successfully deletes all notes when fewer than 25 exist", async () => {
    const originalSend = DynamoDBDocumentClient.prototype.send;

    const notes = [
      { userId: "test-user-123", noteId: "note-1" },
      { userId: "test-user-123", noteId: "note-2" },
      { userId: "test-user-123", noteId: "note-3" }
    ];

    let deleteCount = 0;

    DynamoDBDocumentClient.prototype.send = async (command) => {
      if (command instanceof QueryCommand) {
        if (command.input.Limit === 25) {
          return { Items: notes };
        }

        return { Items: [] };
      }

      if (command instanceof DeleteCommand) {
        deleteCount++;
        return {};
      }

      throw new Error("Unexpected DynamoDB command.");
    };

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
      const body = JSON.parse(result.body);

      assert.equal(result.statusCode, 200);
      assert.equal(body.deletedCount, 3);
      assert.equal(body.hasMore, false);
      assert.equal(deleteCount, 3);

    } finally {
      DynamoDBDocumentClient.prototype.send = originalSend;
    }
  });

  test("returns zero deleted notes when the user has no notes", async () => {
    const originalSend = DynamoDBDocumentClient.prototype.send;

    DynamoDBDocumentClient.prototype.send = async (command) => {
      assert.ok(command instanceof QueryCommand);

      return { Items: [] };
    };

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
      const body = JSON.parse(result.body);

      assert.equal(result.statusCode, 200);
      assert.equal(body.deletedCount, 0);
      assert.equal(body.hasMore, false);

    } finally {
      DynamoDBDocumentClient.prototype.send = originalSend;
    }
  });

  test("uses the authenticated user ID when querying and deleting notes", async () => {
    const originalSend = DynamoDBDocumentClient.prototype.send;

    const capturedQueries = [];
    const capturedDeletes = [];

    DynamoDBDocumentClient.prototype.send = async (command) => {
      if (command instanceof QueryCommand) {
        capturedQueries.push(command);

        if (command.input.Limit === 25) {
          return {
            Items: [
              { userId: "test-user-123", noteId: "note-1" }
            ]
          };
        }

        return { Items: [] };
      }

      if (command instanceof DeleteCommand) {
        capturedDeletes.push(command);
        return {};
      }

      throw new Error("Unexpected DynamoDB command.");
    };

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

      await handler(event);

      assert.equal(capturedQueries.length, 2);

      for (const command of capturedQueries) {
        assert.equal(
          command.input.ExpressionAttributeValues[":userId"],
          "test-user-123"
        );
      }

      assert.equal(capturedDeletes.length, 1);

      assert.deepEqual(capturedDeletes[0].input.Key, {
        userId: "test-user-123",
        noteId: "note-1"
      });

    } finally {
      DynamoDBDocumentClient.prototype.send = originalSend;
    }
  });

  test("limits each deletion batch to 25 notes", async () => {
    const originalSend = DynamoDBDocumentClient.prototype.send;

    let firstQueryLimit;
    let deleteCount = 0;

    const notes = Array.from({ length: 25 }, (_, index) => ({
      userId: "test-user-123",
      noteId: `note-${index + 1}`
    }));

    DynamoDBDocumentClient.prototype.send = async (command) => {
      if (command instanceof QueryCommand) {
        if (command.input.Limit === 25) {
          firstQueryLimit = command.input.Limit;

          return { Items: notes };
        }

        return {
          Items: [{ noteId: "remaining-note" }]
        };
      }

      if (command instanceof DeleteCommand) {
        deleteCount++;
        return {};
      }

      throw new Error("Unexpected DynamoDB command.");
    };

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
      const body = JSON.parse(result.body);

      assert.equal(result.statusCode, 200);
      assert.equal(firstQueryLimit, 25);
      assert.equal(deleteCount, 25);
      assert.equal(body.deletedCount, 25);
      assert.equal(body.hasMore, true);

    } finally {
      DynamoDBDocumentClient.prototype.send = originalSend;
    }
  });

  test("returns 500 and reports deleted count when a deletion fails", async () => {
    const originalSend = DynamoDBDocumentClient.prototype.send;
    const originalConsoleError = console.error;

    let deleteCount = 0;

    DynamoDBDocumentClient.prototype.send = async (command) => {
      if (command instanceof QueryCommand) {
        return {
          Items: [
            { userId: "test-user-123", noteId: "note-1" },
            { userId: "test-user-123", noteId: "note-2" }
          ]
        };
      }

      if (command instanceof DeleteCommand) {
        deleteCount++;

        if (deleteCount === 2) {
          throw new Error("Simulated DynamoDB failure.");
        }

        return {};
      }

      throw new Error("Unexpected DynamoDB command.");
    };

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
      const body = JSON.parse(result.body);

      assert.equal(result.statusCode, 500);
      assert.equal(body.deletedCount, 1);

    } finally {
      DynamoDBDocumentClient.prototype.send = originalSend;
      console.error = originalConsoleError;
    }
  });


  test("returns 500 when the DynamoDB table name is missing", async () => {
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
      const body = JSON.parse(result.body);

      assert.equal(result.statusCode, 500);
      assert.equal(body.deletedCount, 0);

    } finally {
      process.env.TABLE_NAME = originalTableName;
      console.error = originalConsoleError;
    }
  });

  test("returns 500 when the initial DynamoDB query fails", async () => {
    const originalSend = DynamoDBDocumentClient.prototype.send;
    const originalConsoleError = console.error;

    DynamoDBDocumentClient.prototype.send = async () => {
      throw new Error("Simulated initial query failure.");
    };

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
      const body = JSON.parse(result.body);

      assert.equal(result.statusCode, 500);
      assert.equal(body.deletedCount, 0);

    } finally {
      DynamoDBDocumentClient.prototype.send = originalSend;
      console.error = originalConsoleError;
    }
  });

  test("returns 500 when the final remaining-notes query fails", async () => {
    const originalSend = DynamoDBDocumentClient.prototype.send;
    const originalConsoleError = console.error;

    let queryCount = 0;

    DynamoDBDocumentClient.prototype.send = async (command) => {
      if (command instanceof QueryCommand) {
        queryCount++;

        if (queryCount === 1) {
          return {
            Items: [
              { userId: "test-user-123", noteId: "note-1" }
            ]
          };
        }

        throw new Error("Simulated final query failure.");
      }

      if (command instanceof DeleteCommand) {
        return {};
      }

      throw new Error("Unexpected DynamoDB command.");
    };

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
      const body = JSON.parse(result.body);

      assert.equal(result.statusCode, 500);
      assert.equal(body.deletedCount, 1);
      assert.equal(queryCount, 2);

    } finally {
      DynamoDBDocumentClient.prototype.send = originalSend;
      console.error = originalConsoleError;
    }
  });


});
