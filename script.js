// -----------------------------------------------
// 1. Initialize Firebase
// -----------------------------------------------
const firebaseConfig = {
  // Replace these with your actual config values!
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_PROJECT_ID.firebaseapp.com",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_PROJECT_ID.appspot.com",
  messagingSenderId: "SENDER_ID",
  appId: "APP_ID"
};

firebase.initializeApp(firebaseConfig);

// Shortcuts to Firebase services
const auth = firebase.auth();
const db = firebase.firestore();

// References to HTML elements
const authSection   = document.getElementById('auth-section');
const mainSection   = document.getElementById('main-section');
const emailField    = document.getElementById('email');
const passwordField = document.getElementById('password');
const signInBtn     = document.getElementById('sign-in-btn');
const registerBtn   = document.getElementById('register-btn');
const authError     = document.getElementById('auth-error');
const userEmailSpan = document.getElementById('user-email');

const logoutBtn     = document.getElementById('logout-btn');
const workoutInput  = document.getElementById('workout-input');
const countInput    = document.getElementById('count-input');
const saveBtn       = document.getElementById('save-btn');

const todayTotalSpan  = document.getElementById('today-total');
const sevenTotalSpan  = document.getElementById('seven-total');
const streakCountSpan = document.getElementById('streak-count');

// -----------------------------------------------
// 2. Auth event listeners
// -----------------------------------------------
signInBtn.addEventListener('click', () => {
  const email = emailField.value;
  const password = passwordField.value;

  auth.signInWithEmailAndPassword(email, password)
      .catch((error) => {
        console.error(error);
        authError.textContent = error.message;
      });
});

registerBtn.addEventListener('click', () => {
  const email = emailField.value;
  const password = passwordField.value;

  auth.createUserWithEmailAndPassword(email, password)
      .catch((error) => {
        console.error(error);
        authError.textContent = error.message;
      });
});

logoutBtn.addEventListener('click', () => {
  auth.signOut();
});

// Listen for changes to auth state (logged in / logged out)
auth.onAuthStateChanged((user) => {
  if (user) {
    // Logged in
    authSection.style.display = 'none';
    mainSection.style.display = 'block';
    userEmailSpan.textContent = user.email;

    // After login, fetch stats
    updateStats();
  } else {
    // Logged out
    authSection.style.display = 'block';
    mainSection.style.display = 'none';
    authError.textContent = '';
  }
});

// -----------------------------------------------
// 3. Saving data to Firestore
// -----------------------------------------------
saveBtn.addEventListener('click', async () => {
  const user = auth.currentUser;
  if (!user) return alert("Not logged in!");

  const workoutName = workoutInput.value.trim() || 'pushups';
  const countNumber = parseInt(countInput.value) || 0;

  if (countNumber <= 0) {
    alert("Please enter a positive number.");
    return;
  }

  // We’ll store each count in a sub-collection called "entries"
  // Document path: users/{uid}/entries/{generatedId}
  // Fields: workout, count, timestamp
  try {
    await db.collection('users')
            .doc(user.uid)
            .collection('entries')
            .add({
              workout: workoutName,
              count: countNumber,
              timestamp: firebase.firestore.FieldValue.serverTimestamp()
            });
    
    alert("Saved!");

    // Reset input
    countInput.value = 0;

    // Refresh the displayed stats
    updateStats();
  } catch (error) {
    console.error("Error saving document:", error);
  }
});

// -----------------------------------------------
// 4. Updating displayed stats
// -----------------------------------------------
async function updateStats() {
  const user = auth.currentUser;
  if (!user) return;

  const workoutName = workoutInput.value.trim() || 'pushups';

  // We'll fetch the user's entries from the last 7 days for that workout
  // Then we'll compute:
  // 1) today's total
  // 2) 7-day total
  // 3) current streak

  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(now.getDate() - 6); // including today => 7 total days

  try {
    // Query for the last 7 days
    const snapshot = await db.collection('users')
      .doc(user.uid)
      .collection('entries')
      .where('workout', '==', workoutName)
      .where('timestamp', '>=', firebase.firestore.Timestamp.fromDate(sevenDaysAgo))
      .orderBy('timestamp', 'asc')
      .get();

    const entries = [];
    snapshot.forEach(doc => {
      entries.push(doc.data());
    });

    // Tally up "today's total" (all entries with date == today's date)
    let todayTotal = 0;
    // Tally up 7-day total
    let sevenDayTotal = 0;

    // For streak calculation, we want to track which days had an entry
    // We'll store unique dates in a Set
    const daysWithEntry = new Set();

    for (let entry of entries) {
      if (!entry.timestamp) continue; // safety check in case of null timestamp
      const entryDate = entry.timestamp.toDate();
      // Increase the 7-day total
      sevenDayTotal += entry.count;

      // Check if it's "today"
      if (isSameDay(entryDate, startOfToday)) {
        todayTotal += entry.count;
      }

      // Mark that this date had an entry
      const dateKey = formatDateKey(entryDate);
      daysWithEntry.add(dateKey);
    }

    // Now compute the streak
    // "Current streak" = how many consecutive days (including today) have at least 1 entry
    // We'll check from today backwards
    let streak = 0;
    for (let i = 0; i < 365; i++) {
      const checkDate = new Date();
      checkDate.setDate(now.getDate() - i);

      const dateKey = formatDateKey(checkDate);
      if (daysWithEntry.has(dateKey)) {
        streak++;
      } else {
        // if we find a day that has no entry, break
        break;
      }
    }

    // Update the DOM
    todayTotalSpan.textContent = todayTotal;
    sevenTotalSpan.textContent = sevenDayTotal;
    streakCountSpan.textContent = streak;
  } catch (error) {
    console.error("Error fetching stats:", error);
  }
}

// Helper: Check if a date is the same day as another date
function isSameDay(date, startOfToday) {
  // StartOfToday is the 00:00:00 time of the current day
  // A date is "today" if it’s >= startOfToday and < tomorrow
  const dateYear = date.getFullYear();
  const dateMonth = date.getMonth();
  const dateDay = date.getDate();

  const startYear = startOfToday.getFullYear();
  const startMonth = startOfToday.getMonth();
  const startDay = startOfToday.getDate();

  return (dateYear === startYear && dateMonth === startMonth && dateDay === startDay);
}

// Helper: Format date into a key "YYYY-MM-DD"
function formatDateKey(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}
