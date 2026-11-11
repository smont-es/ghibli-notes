document.addEventListener('DOMContentLoaded', async () => {
  // Authentication controls
  const signInBtn = document.getElementById("signInBtn");
  const signOutBtn = document.getElementById("signOutBtn");
  const authStatus = document.getElementById("authStatus");

  // Process Cognito authentication callback
  let authError = false;

  // Process Cognito authentication callback
  try {
    await handleAuthCallback();
  } catch (error) {
    console.error("Authentication callback error:", error);
    authStatus.textContent = "Sign-in failed. Please try again.";
    authError = true;
  }

  // Restore an existing authentication session
  const isAuthenticated = authError ? false : restoreSession();

  // Update authentication interface
  function updateAuthUI(authenticated) {
    authStatus.textContent = authenticated
      ? "You are signed in."
      : "You are not signed in.";

    signInBtn.hidden = authenticated;
    signOutBtn.hidden = !authenticated;
  }

  updateAuthUI(isAuthenticated);

  // Show notes only after successful authentication
  const notesApp = document.getElementById("notesApp");
  notesApp.hidden = !isAuthenticated;

  signInBtn.addEventListener("click", async () => {
    try {
      await signIn();
    } catch (error) {
      console.error("Sign-in error:", error);
      authStatus.textContent = error.message;
    }
  });

  signOutBtn.addEventListener("click", () => {
    signOut();
  });

  const backgroundResources = {
    "spirited away": {
      link: "../assets/spirited-away.gif"
    },
    "spirited away 2": {
      link: "../assets/spirited-away.gif"
     },
    "howl": {
      link: "../assets/howl.gif"
    },
     "howl 2": {
      link: "../assets/howl-2.gif"
     },
     "totoro": {
      link: "../assets/totoro.gif"
     },
     "totoro 2": {
      link: "../assets/totoro-2.gif"
     },
     "Princess Mononoke": {
      link: "../assets/princess-mononoke.gif"
     },
     "Princess Mononoke 2": {
      link: "../assets/princess-mononoke-2.gif"
     },
     "Kiki": {
      link: "../assets/kiki.gif"
     },
     "Kiki 2": {
      link: "../assets/kiki-2.gif"
    }
};

  const themes = Object.keys(backgroundResources);
  let currentIndex = Math.floor(Math.random() * themes.length);

  function setBackground(index) {
    const name = themes[index];
    const resource = backgroundResources[name];
    if (resource) {
      document.body.style.backgroundImage = `url('${resource.link}')`;
      document.body.setAttribute('data-current-theme', name);
    }
  }

  setBackground(currentIndex);

  const changeThemeBtn = document.getElementById('changeThemeBtn');
  if (changeThemeBtn) {
    changeThemeBtn.onclick = () => {
      currentIndex = (currentIndex + 1) % themes.length;
      setBackground(currentIndex);
    };
  }

  // Note taking logic
  const addBtn = document.getElementById('addBtn');
  const noteInput = document.getElementById('noteInput');
  const noteIdInput = document.getElementById('noteId');
  const notesContainer = document.getElementById('notesContainer');

  let notes = [];

  async function loadNotes() {
    try {
     notes = await getAllNotes();
      renderNotes();
      allNotes.sort(
        (a, b) => new Date(b.createdAt) - new Date(a.createdAt)
      );
      return true;

    } catch (error) {
      console.error("Unable to load notes:", error);
      alert(error.message);
      return false;
    }
  }

  function renderNotes() {
    notesContainer.innerHTML = '';
    notes.forEach((note, index) => {
      const div = document.createElement('div');
      div.className = 'note';

      // Add title
      const header = document.createElement('div');
      header.className = 'note-header';
      header.innerText = note.title || 'No Title';

      // Note content container
      const contentDiv = document.createElement('div');
      contentDiv.className = 'note-content';

      // Note text
      const span = document.createElement('span');
      span.className = 'note-text';
      span.innerText = note.text;

      // Buttons inside note
      const btnContainer = document.createElement('div');
      btnContainer.className = 'note-buttons';

      const deleteBtn = document.createElement('button');
      deleteBtn.className = 'deleteBtn';
      deleteBtn.innerHTML = '&times;';
      deleteBtn.onclick = async () => {
         const confirmed = confirm("Are you sure you want to delete this note?");

        if (!confirmed) {
          return;
        }

        try {
          await deleteNote(note.noteId);

          // Remove the deleted note from the local display
          notes = notes.filter(item => item.noteId !== note.noteId);

          renderNotes();

        } catch (error) {
          console.error("Unable to delete note:", error);
          alert(error.message);
        }
      };

      const editBtn = document.createElement('button');
      editBtn.className = 'editBtn';
      editBtn.innerText = 'Edit';
      editBtn.onclick = () => {
        startEditing(note, index);
      };

      btnContainer.appendChild(editBtn);
      btnContainer.appendChild(deleteBtn);

      contentDiv.appendChild(span);
      contentDiv.appendChild(btnContainer);

      div.appendChild(header);
      div.appendChild(contentDiv);
      notesContainer.appendChild(div);
    });
  }

  function startEditing(note, index) {
    const noteElement = notesContainer.children[index];

     const titleInput = document.createElement("input");
     titleInput.type = "text";
      titleInput.value = note.title || "No Title";
      titleInput.placeholder = "Title";
     titleInput.style.width = "100%";

      const textInput = document.createElement("textarea");
     textInput.value = note.text;
     textInput.placeholder = "Write your note here...";
     textInput.style.width = "100%";

     const saveBtn = document.createElement("button");
     saveBtn.innerText = "Save";

     const cancelBtn = document.createElement("button");
     cancelBtn.innerText = "Cancel";

     noteElement.innerHTML = "";

     noteElement.appendChild(titleInput);
     noteElement.appendChild(textInput);
      noteElement.appendChild(saveBtn);
     noteElement.appendChild(cancelBtn);

     saveBtn.onclick = async () => {
     const newTitle = titleInput.value.trim() || "No Title";
     const newText = textInput.value.trim();

     if (!newText) {
       alert("Note text cannot be empty.");
        return;
     }

     try {
       await updateNote(note.noteId, newTitle, newText);
       await loadNotes();

     } catch (error) {
       console.error("Unable to update note:", error);
       alert(error.message);
     }
   };

   cancelBtn.onclick = () => {
     renderNotes();
   };
 }

  // Add new note
  document.getElementById('addBtn').onclick = async () => {
    const title = noteIdInput.value.trim() || "No Title";
    const text = noteInput.value.trim();

    if (!text) {
      alert("Please enter some note text.");
      return;
    }

    try {
      await addNote(title, text);

      // Reload notes from the API
      await loadNotes();

      // Clear inputs after successful creation
      noteInput.value = "";
      noteIdInput.value = "";

    } catch (error) {
      console.error("Unable to add note:", error);
      alert(error.message);
    }
  };

  document.getElementById('noteInput').addEventListener('keypress', e => {
    if (e.key === 'Enter') {
      document.getElementById('addBtn').click();
    }
  });

  // Search Notes button - now searches by title
  const searchBtn = document.getElementById('searchBtn');
  searchBtn.onclick = () => {
    const searchTerm = prompt("Enter title to search for:");
    if (searchTerm !== null) {
      const lowerSearchTerm = searchTerm.toLowerCase();
      document.querySelectorAll('.note').forEach(noteDiv => {
        const header = noteDiv.querySelector('.note-header');
        if (header.innerText.toLowerCase().includes(lowerSearchTerm)) {
          noteDiv.style.border = '2px solid yellow';
        } else {
          noteDiv.style.border = 'none';
        }
      });
    }
  };

// Load notes from the API after authentication
if (isAuthenticated) {
  await loadNotes();
}
});