
async function apiRequest(path, options = {}) {
  const token = getAccessToken();

  if (!token) {
    throw new Error("You must be signed in to access your notes.");
  }

  if (!APP_CONFIG.api.baseUrl) {
    throw new Error("API Gateway URL has not been configured.");
  }


let response;

try {
  response = await fetch(
    `${APP_CONFIG.api.baseUrl}${path}`,
    {
      ...options,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(options.body ? { "Content-Type": "application/json" } : {}),
        ...options.headers
      }
    }
  );
} catch (error) {
  console.error("API network error:", error);

  throw new Error(
    "Unable to connect to the server. Check your internet connection and try again."
  );
}


  if (response.status === 401 || response.status === 403) {
    throw new Error("Your session is invalid or expired. Please sign in again.");
  }

  if (!response.ok) {
    let errorMessage = `API request failed (${response.status}).`;

    try {
      const errorData = await response.json();
      errorMessage = errorData.message || errorMessage;
    } catch {
      // Keep the default error message if the response isn't JSON.
    }

    throw new Error(errorMessage);
  }

  if (response.status === 204) {
    return null;
  }

  return response.json();
}

// Retrieve one page of notes
async function getNotes(nextToken = null) {
  const query = new URLSearchParams({ limit: "100" });

  if (nextToken) {
    query.set("nextToken", nextToken);
  }

  return apiRequest(`/notes?${query.toString()}`);
}

// Retrieve every page of notes
async function getAllNotes() {
  const allNotes = [];
  let nextToken = null;

  do {
    const result = await getNotes(nextToken);
    allNotes.push(...result.notes);
    nextToken = result.nextToken;
  } while (nextToken);

  // Display newest notes first
  allNotes.sort(
    (a, b) => new Date(b.createdAt) - new Date(a.createdAt)
  );

  return allNotes;
}

// Create a note
async function addNote(title, text) {
  return apiRequest("/notes", {
    method: "POST",
    body: JSON.stringify({ title, text })
  });
}

// Update a note
async function updateNote(noteId, title, text) {
  return apiRequest(`/notes/${encodeURIComponent(noteId)}`, {
    method: "PATCH",
    body: JSON.stringify({ title, text })
  });
}

// Delete one note
async function deleteNote(noteId) {
  return apiRequest(`/notes/${encodeURIComponent(noteId)}`, {
    method: "DELETE"
  });
}

// Delete all notes, processing backend batches
async function deleteAllNotes() {
  let deletedCount = 0;
  let hasMore = true;

  while (hasMore) {
    const result = await apiRequest("/notes", {
      method: "DELETE"
    });

    const batchDeleted = result.deletedCount || 0;

    deletedCount += batchDeleted;
    hasMore = result.hasMore === true;

    // Prevent an infinite loop if the backend
    // reports more notes but deletes nothing.
    if (hasMore && batchDeleted === 0) {
      throw new Error(
        "Deletion stopped because no notes were deleted, but additional notes remain."
      );
    }
  }

  return deletedCount;
}
