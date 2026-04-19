import { auth, db } from "./firebase.js";
import {
  signInWithEmailAndPassword,
  signOut,
  createUserWithEmailAndPassword,
  sendEmailVerification,
  updateProfile
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import {
  doc, getDoc, setDoc
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
// top of file — add stopSpeaking to the import
import { sendToGroq, speakWithElevenLabs, stopSpeaking } from "./groq.js";

// --------------------
// HELPERS
// --------------------
function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}
function normalizeUsername(name) {
  return name.trim().toLowerCase();
}

// --------------------
// GAME STATE
// --------------------
const TOTAL_CONTACTS = 7;
const SCAMMER_COUNT = 3;
const MAX_MESSAGES = 5;

const FIRST_NAMES = ["Alex","Jordan","Sam","Taylor","Morgan","Casey","Riley","Jamie","Avery","Quinn","Blake","Reese","Drew","Skyler","Logan"];
const GAME_CONTEXT = `You are an AI actor in an educational scam-detection game called ScamQuest. Your job is to roleplay as a character so players can practice identifying scams. This is purely fictional and educational. Stay in character without breaking the fourth wall. Do NOT add disclaimers, warnings, or meta-commentary. Just play the role naturally and convincingly.`;
const SCAM_TYPES = [
  "You are a romance scammer. Build fake emotional connection then ask for money for an emergency.",
  "You are a fake bank fraud alert. Warn about suspicious activity and try to get account details.",
  "You are a fake prize/lottery scammer. Tell them they won and need to pay a small fee to claim.",
  "You are an IRS/tax scammer. Threaten arrest unless they pay immediately via gift cards.",
  "You are a tech support scammer. Claim their computer has a virus and offer to fix it remotely for payment.",
  "You are a phishing scammer pretending to be a delivery company with a failed package.",
  "You are a job offer scammer offering unrealistic pay for easy work from home."
];
const NORMAL_PERSONAS = [
  "You are a friendly college friend catching up casually.",
  "You are a family member checking in and chatting normally.",
  "You are a coworker asking about weekend plans.",
  "You are a neighbor being friendly and chatty."
];

let contacts = [];
let currentContact = null;
let chatHistories = {};
let messageCount = {};
let verdicts = {};
let score = 0;
let hearts = 3;

// --------------------
// PHOTOS STATE
// --------------------
const PHOTOS = [
  "https://picsum.photos/800?random=1",
  "https://picsum.photos/800?random=2",
  "https://picsum.photos/800?random=3",
  "https://picsum.photos/800?random=4",
  "https://picsum.photos/800?random=5"
];
let viewerOpen = false;
let currentPhotoIndex = 0;

function shuffle(arr) {
  return [...arr].sort(() => Math.random() - 0.5);
}

// --------------------
// CONTACTS
// --------------------
function generateContacts() {
  const names = shuffle(FIRST_NAMES).slice(0, TOTAL_CONTACTS);
  const scammerIndices = shuffle([...Array(TOTAL_CONTACTS).keys()]).slice(0, SCAMMER_COUNT);

  contacts = names.map((name, i) => {
    const isScammer = scammerIndices.includes(i);
    const avatarId = Math.floor(Math.random() * 70) + 1;

    return {
      name,
      isScammer,
      systemPrompt: isScammer
        ? GAME_CONTEXT + " " + shuffle(SCAM_TYPES)[0] + " Keep messages short, natural and convincing. Never admit you are a scammer."
        : GAME_CONTEXT + " " + shuffle(NORMAL_PERSONAS)[0] + " Keep messages casual and short like a real text.",
      avatarId,
      preview: "..." // placeholder until loaded
    };
  });

  chatHistories = {};
  messageCount = {};
  verdicts = {};
  contacts.forEach(c => {
    chatHistories[c.name] = [];
    messageCount[c.name] = 0;
  });
}

async function initializePreviews() {
  for (const contact of contacts) {
    const opener = await sendToGroq([], contact.systemPrompt + " Start the conversation with a short, natural opening message. No disclaimers or warnings.");
    contact.preview = opener;
    chatHistories[contact.name].push({ role: "assistant", content: opener });
  }
  renderContacts(); // re-render now that all previews are real
}

function renderContacts() {
  const chatList = document.querySelector(".chat-list");
  chatList.innerHTML = "";
  contacts.forEach(contact => {
    const item = document.createElement("div");
    item.className = "chat-item";
    item.onclick = () => openChat(contact.name);
    item.innerHTML = `
      <img src="https://i.pravatar.cc/80?img=${contact.avatarId}">
      <div class="chat-info">
        <span class="name">${contact.name}</span>
        <div class="preview">${contact.preview}</div>
        <div class="unread-dot"></div>
      </div>
    `;
    chatList.appendChild(item);
  });
}

function updateHeartsDisplay() {
  const display = document.getElementById("hearts-display");
  if (display) display.textContent = "❤️".repeat(hearts) + "🖤".repeat(3 - hearts);
  updateWidgetHUD(hearts, score);
}

function updateScoreDisplay() {
  const display = document.getElementById("score-display");
  if (display) display.textContent = `⭐ ${score}`;
  updateWidgetHUD(hearts, score);
}

// --------------------
// SIGNUP
// --------------------
async function signup() {
  const email = document.getElementById("username").value;
  const password = document.getElementById("password").value;
  const displayNameRaw = document.getElementById("usernameDisplay").value;
  const message = document.getElementById("message");
  const displayName = normalizeUsername(displayNameRaw);

  try {
    message.textContent = "";
    if (!email || !password || !displayName) { message.textContent = "Please fill all fields."; return; }
    if (!isValidEmail(email)) { message.textContent = "Invalid email."; return; }
    if (password.length < 6) { message.textContent = "Password must be at least 6 characters."; return; }
    const existing = await getDoc(doc(db, "users", displayName));
    if (existing.exists()) { message.textContent = "Username already taken."; return; }
    const userCredential = await createUserWithEmailAndPassword(auth, email, password);
    const user = userCredential.user;
    await setDoc(doc(db, "users", displayName), { email });
    await updateProfile(user, { displayName });
    message.textContent = "Sending verification email...";
    await sendEmailVerification(user);
    await signOut(auth);
    message.textContent = "Verification email sent! Check your inbox before logging in.";
  } catch (error) {
    console.error(error);
    message.textContent = error.message;
  }
}

// --------------------
// LOGIN
// --------------------
async function login() {
  const input = document.getElementById("username").value;
  const password = document.getElementById("password").value;
  const message = document.getElementById("message");

  try {
    message.textContent = "";
    const isEmail = isValidEmail(input);
    let email = input;
    if (!isEmail) {
      const snap = await getDoc(doc(db, "users", normalizeUsername(input)));
      if (!snap.exists()) { message.textContent = "Username not found."; return; }
      email = snap.data().email;
    }
    const userCredential = await signInWithEmailAndPassword(auth, email, password);
    const user = userCredential.user;
    if (!user.emailVerified) {
      message.textContent = "Please verify your email first.";
      await signOut(auth);
      return;
    }
    message.textContent = "Login successful!";
    startGame();
  } catch (error) {
    console.error(error);
    message.textContent = error.message;
  }
}

function startGame() {
  document.getElementById("login-screen").classList.add("hidden");
  document.getElementById("desktop").classList.remove("hidden");
  
  score = 0; hearts = 3;
  generateContacts();
  renderContacts(); // show "..." placeholders immediately
  initializePreviews(); // load real previews in background
  updateHeartsDisplay();
  updateScoreDisplay();
  document.getElementById('scam-widget').style.display = 'block';
}

// --------------------
// WINDOW MANAGEMENT
// --------------------
function openWindow(id) {
  const win = document.getElementById(id);
  if (win) win.classList.remove("hidden");
  if (id === 'window-notes') setTimeout(() => { if (typeof initNotes === 'function') initNotes(); }, 50);
  if (id === 'window-appstore') setTimeout(() => { if (typeof showCategory === 'function') showCategory('discover', document.querySelector('.as-cat')); }, 50);
  if (id === 'window-files') setTimeout(() => { if (typeof showFilesSection === 'function') showFilesSection('myfiles', document.querySelector('.files-nav-item')); }, 50);
}

function closeWindow(id) {
  const win = document.getElementById(id);
  if (win) win.classList.add("hidden");
  if (id === "window-messages") {
    document.getElementById("chat-screen").classList.add("hidden");
    document.getElementById("chat-messages").innerHTML = "";
  }
  if (id === "window-photos") {
    viewerOpen = false;
  }
}

function minimizeWindow(id) { closeWindow(id); }

function maximizeWindow(id) {
  const win = document.getElementById(id);
  if (win) win.classList.toggle("fullscreen");
}

function toggleFullscreen(id) {
  const win = document.getElementById(id);
  if (win) win.classList.toggle("fullscreen");
}

function shutdown() {
  const screen = document.getElementById("shutdown-screen");
  screen.style.display = "flex";
  document.getElementById("shutdown-prompt").style.display = "flex";
  document.getElementById("shutdown-final").style.display = "none";
}
function restart() { location.reload(); }
function sleep() {
  document.body.style.backgroundColor = "#000";
  document.getElementById("desktop").style.visibility = "hidden";
}

function cancelShutdown() {
  document.getElementById("shutdown-screen").style.display = "none";
}

function confirmShutdown() {
  document.getElementById("shutdown-prompt").style.display = "none";
  document.getElementById("shutdown-final").style.display = "flex";
  setTimeout(() => {
    document.getElementById("shutdown-screen").style.background = "black";
    document.getElementById("shutdown-final").style.display = "none";
    setTimeout(() => location.reload(), 500);
  }, 2000);
}

// and at the bottom with your other window. exposures:


// --------------------
// PHOTOS APP
// --------------------
function openPhotoGrid() {
  const main = document.getElementById("photosMain");
  main.innerHTML = "";
  viewerOpen = false;

  const grid = document.createElement("div");
  grid.style.cssText = "display:grid;grid-template-columns:repeat(3,1fr);gap:10px;";

  PHOTOS.forEach((src, index) => {
    const img = document.createElement("img");
    img.src = src;
    img.style.cssText = "width:100%;cursor:pointer;border-radius:4px;";
    img.addEventListener("click", (e) => {
  e.stopPropagation();
  openPhotoViewer(index);
});
    grid.appendChild(img);
  });

  main.appendChild(grid);
}

function openPhotoViewer(index) {
  const main = document.getElementById("photosMain");
  viewerOpen = true;
  currentPhotoIndex = index;

  main.innerHTML = `
    <div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;gap:15px;">
      <button id="prevBtn" style="font-size:26px;background:rgba(0,0,0,0.6);color:white;border:none;padding:6px 10px;cursor:pointer;border-radius:6px;">‹</button>
      <img id="viewerImg" src="${PHOTOS[currentPhotoIndex]}" style="max-width:80%;max-height:70vh;object-fit:contain;border-radius:4px;">
      <button id="nextBtn" style="font-size:26px;background:rgba(0,0,0,0.6);color:white;border:none;padding:6px 10px;cursor:pointer;border-radius:6px;">›</button>
    </div>
  `;

document.getElementById("prevBtn").onclick = (e) => {
  e.stopPropagation();
  currentPhotoIndex = (currentPhotoIndex - 1 + PHOTOS.length) % PHOTOS.length;
  document.getElementById("viewerImg").src = PHOTOS[currentPhotoIndex];
};
document.getElementById("nextBtn").onclick = (e) => {
  e.stopPropagation();
  currentPhotoIndex = (currentPhotoIndex + 1) % PHOTOS.length;
  document.getElementById("viewerImg").src = PHOTOS[currentPhotoIndex];
};
}

// --------------------
// CHAT
// --------------------
async function openChat(name) {
  currentContact = contacts.find(c => c.name === name);
  if (!currentContact) return;

  document.getElementById("chat-name").textContent = name;
  document.getElementById("chat-name").textContent = name;
setWidgetContext('messages', 'Chatting with ' + name, true);
  const msgContainer = document.getElementById("chat-messages");
  msgContainer.innerHTML = "";
  document.getElementById("chat-screen").classList.remove("hidden");

  document.getElementById("chat-input-field").disabled = false;
  document.querySelector(".chat-input button").disabled = false;

  chatHistories[name].forEach(msg => {
    appendBubble(msg.content, msg.role === "user" ? "sent" : "received");
  });

  if (messageCount[name] >= MAX_MESSAGES) lockChat();
  if (verdicts[name] !== undefined) showVerdictResult(name);

  if (chatHistories[name].length === 0) {
    const botOpener = await sendToGroq([], currentContact.systemPrompt + " Start the conversation with a short, natural opening message. No disclaimers or warnings.");
    chatHistories[name].push({ role: "assistant", content: botOpener });
    appendBubble(botOpener, "received");
  }
}
function closeChat() {
  document.getElementById("chat-screen").classList.add("hidden");
}

function appendBubble(text, type) {
  const msgs = document.getElementById("chat-messages");
  const bubble = document.createElement("div");
  bubble.className = `message ${type}`;
  bubble.textContent = text;
  msgs.appendChild(bubble);
  msgs.scrollTop = msgs.scrollHeight;
}

function lockChat() {
  document.getElementById("chat-input-field").disabled = true;
  document.querySelector(".chat-input button").disabled = true;
  setWidgetContext('messages', 'Chatting with ' + currentContact.name, true);
}

async function sendMessage() {
  if (!currentContact) return;
  const name = currentContact.name;
  if (messageCount[name] >= MAX_MESSAGES) return;

  const input = document.getElementById("chat-input-field");
  const text = input.value.trim();
  if (!text) return;

  input.value = "";
  appendBubble(text, "sent");
  chatHistories[name].push({ role: "user", content: text });
  messageCount[name]++;

  if (messageCount[name] >= MAX_MESSAGES) {
    lockChat();
    return;
  }

  const reply = await sendToGroq(chatHistories[name], currentContact.systemPrompt);
  chatHistories[name].push({ role: "assistant", content: reply });
  appendBubble(reply, "received");
}

// --------------------
// VERDICT
// --------------------
function submitVerdict(isScam) {
  if (!currentContact) return;
  const name = currentContact.name;
  if (verdicts[name] !== undefined) return;

  const correct = isScam === currentContact.isScammer;
  verdicts[name] = isScam;

  if (correct) {
    score += 100;
    showToast("✅ Correct! +100");
  } else {
    hearts = Math.max(0, hearts - 1);
    showToast("❌ Wrong! -1 heart");
  }

  updateHeartsDisplay();
  updateScoreDisplay();
  showVerdictResult(name);

  if (hearts <= 0) setTimeout(() => gameOver(), 1000);

  if (Object.keys(verdicts).length === TOTAL_CONTACTS) {
    setTimeout(() => gameComplete(), 1500);
  }
}

function showVerdictResult(name) {
  const contact = contacts.find(c => c.name === name);
  if (verdicts[name] !== undefined) {
    const correct = verdicts[name] === contact.isScammer;
    document.getElementById('widget-verdict-section').innerHTML = `
      <div style="height:0.5px;background:rgba(255,255,255,0.1);margin-bottom:10px;"></div>
      <div style="font-size:9px;color:rgba(255,255,255,0.45);margin-bottom:7px;">YOUR VERDICT</div>
      <div style="text-align:center;font-size:13px;font-weight:600;color:${correct ? '#30d158' : '#ff3b30'};">
        ${correct ? '✅ Correct!' : '❌ Wrong!'}
      </div>`;
  }
}

function showToast(msg) {
  const toast = document.getElementById("toast");
  toast.textContent = msg;
  toast.classList.remove("hidden");
  setTimeout(() => toast.classList.add("hidden"), 2500);
}

function gameOver() {
  showToast("💀 Game Over! Final score: " + score);
  setTimeout(() => {
    score = 0; hearts = 3;
    generateContacts(); renderContacts();
    updateHeartsDisplay(); updateScoreDisplay();
    document.getElementById("chat-screen").classList.add("hidden");
  }, 3000);
}

function gameComplete() {
  showToast("🎉 All done! Final score: " + score);
}

// --------------------
// CLICK OUTSIDE
// --------------------
document.addEventListener("click", (e) => {
if (e.target.closest(".desktop-icons") || e.target.closest(".window") || e.target.closest("#scam-widget") || e.target.closest("#shutdown-screen") || e.target.closest("[style*='99998']")) return;  document.querySelectorAll(".window:not(.hidden)").forEach(win => {
    win.classList.add("hidden");
    if (win.id === "window-messages") {
      document.getElementById("chat-screen").classList.add("hidden");
    }
  });
});

// --------------------
// KEYBOARD (photos viewer)
// --------------------
window.addEventListener("keydown", (e) => {
  if (!viewerOpen) return;
  const img = document.getElementById("viewerImg");
  if (!img) return;
  if (e.key === "ArrowLeft") {
    currentPhotoIndex = (currentPhotoIndex - 1 + PHOTOS.length) % PHOTOS.length;
    img.src = PHOTOS[currentPhotoIndex];
  }
  if (e.key === "ArrowRight") {
    currentPhotoIndex = (currentPhotoIndex + 1) % PHOTOS.length;
    img.src = PHOTOS[currentPhotoIndex];
  }
  if (e.key === "Escape") {
    viewerOpen = false;
    const main = document.getElementById("photosMain");
    if (main) main.innerHTML = `<p class="hint">Select a device to view photos</p>`;
  }
});

// --------------------
// BUTTON WIRING
// --------------------
window.addEventListener("DOMContentLoaded", () => {
  const loginBtn = document.getElementById("loginBtn");
  if (loginBtn) loginBtn.addEventListener("click", login);

  const signupBtn = document.getElementById("signupBtn");
  if (signupBtn) signupBtn.addEventListener("click", signup);

  const guestBtn = document.getElementById("guestBtn");
  if (guestBtn) guestBtn.addEventListener("click", startGame);

  const macbook = document.getElementById("macbook");
  if (macbook) macbook.addEventListener("click", openPhotoGrid);
});
function toggleScamWidget() {
  const body = document.getElementById('widget-body');
  const btn = document.getElementById('widget-toggle-btn');
  const isCollapsed = body.style.maxHeight === '0px';
  body.style.transition = 'max-height 0.3s ease';
  body.style.maxHeight = isCollapsed ? '400px' : '0px';
  body.style.overflow = 'hidden';
  btn.textContent = isCollapsed ? '−' : '+';
}

function setWidgetContext(app, label, showVerdict = false) {
  document.getElementById('widget-context').textContent = label;
  const section = document.getElementById('widget-verdict-section');
  section.style.display = showVerdict ? 'block' : 'none';
  section.innerHTML = `
    <div style="height:0.5px;background:rgba(255,255,255,0.1);margin-bottom:10px;"></div>
    <div style="font-size:9px;color:rgba(255,255,255,0.45);margin-bottom:7px;">YOUR VERDICT</div>
    <div style="display:flex;gap:7px;">
      <button onclick="event.stopPropagation();submitVerdict(true)" style="flex:1;padding:7px 0;border-radius:10px;border:none;background:#ff3b30;color:white;font-size:11px;font-weight:600;cursor:pointer;">Scam</button>
      <button onclick="event.stopPropagation();submitVerdict(false)" style="flex:1;padding:7px 0;border-radius:10px;border:none;background:#30d158;color:white;font-size:11px;font-weight:600;cursor:pointer;">Legit</button>
    </div>`;
}

function updateWidgetHUD(hearts, score) {
  document.getElementById('widget-hearts').textContent = '❤️'.repeat(hearts) + '🖤'.repeat(3 - hearts);
  document.getElementById('widget-score').textContent = score;
}



// --------------------
// FACETIME STATE
// --------------------
let ftContact = null;
let ftHistory = [];
let ftMessageCount = 0;
const FT_MAX_MESSAGES = 4; // calls are shorter than texts

const FACETIME_SCAM_PROMPTS = [
  "You are a scammer on a FaceTime call pretending to be from Apple Support. Claim their iCloud was hacked and you need their Apple ID to secure it.",
  "You are a scammer pretending to be a grandchild in trouble, calling from a friend's phone. You need bail money urgently.",
  "You are a scammer pretending to be from their bank's fraud department. There's suspicious activity and you need to verify their card number.",
];

const FACETIME_NORMAL_PROMPTS = [
  "You are a friend calling to catch up over FaceTime. Be warm and casual.",
  "You are a family member calling to check in. Keep it natural and warm.",
];

// --------------------
// FACETIME FUNCTIONS
// --------------------
function renderFaceTimeContacts() {
  const container = document.getElementById("facetime-contacts");
  container.innerHTML = "";

  contacts.forEach(c => {
    const row = document.createElement("div");
    row.style.cssText = "display:flex;align-items:center;gap:12px;padding:10px 14px;cursor:pointer;border-bottom:1px solid rgba(255,255,255,0.05);";
    row.onmouseenter = () => row.style.background = "rgba(255,255,255,0.06)";
    row.onmouseleave = () => row.style.background = "transparent";
    row.onclick = () => startFaceTimeCall(c);
    row.innerHTML = `
      <img src="https://i.pravatar.cc/80?img=${c.avatarId}" style="width:40px;height:40px;border-radius:50%;">
      <div style="flex:1;">
        <div style="font-size:13px;font-weight:600;color:white;">${c.name}</div>
        <div style="font-size:11px;color:rgba(255,255,255,0.4);">📹 FaceTime</div>
      </div>
      <div style="font-size:11px;color:#0a84ff;">Call</div>
    `;
    container.appendChild(row);
  });
}

async function startFaceTimeCall(contact) {
  ftContact = contact;
  ftHistory = [];
  ftMessageCount = 0;

  // swap list → call screen
  document.getElementById("facetime-list").style.display = "none";
  const callScreen = document.getElementById("facetime-call");
  callScreen.style.display = "flex";

  document.getElementById("ft-avatar").src = `https://i.pravatar.cc/80?img=${contact.avatarId}`;
  document.getElementById("ft-caller-name").textContent = contact.name;
  document.getElementById("ft-call-status").textContent = "Connecting...";
  document.getElementById("ft-transcript").style.display = "none";
  document.getElementById("ft-transcript").innerHTML = "";
  document.getElementById("ft-input").disabled = true;

  setWidgetContext('facetime', 'FaceTime with ' + contact.name, true);

  // pick system prompt
  const isScammer = contact.isScammer;
  const promptPool = isScammer ? FACETIME_SCAM_PROMPTS : FACETIME_NORMAL_PROMPTS;
  ftContact.ftSystemPrompt = GAME_CONTEXT + " " + shuffle(promptPool)[0] + " Keep responses to 1-2 sentences max, like a real call. No disclaimers.";

  // short fake ring delay
  await new Promise(r => setTimeout(r, 1500));
  document.getElementById("ft-call-status").textContent = "Connected";

  // opener
  const opener = await sendToGroq([], ftContact.ftSystemPrompt + " You just connected. Say a natural opening line.");
  ftHistory.push({ role: "assistant", content: opener });
  appendFTTranscript(contact.name, opener);

  // speak it
  document.getElementById("ft-visualiser").style.display = "flex";
  await speakWithElevenLabs(opener, contact.isScammer);
  document.getElementById("ft-visualiser").style.display = "none";

  document.getElementById("ft-input").disabled = false;
  document.getElementById("ft-transcript").style.display = "block";
}

async function sendFaceTimeMessage() {
  if (!ftContact || ftMessageCount >= FT_MAX_MESSAGES) return;
  const input = document.getElementById("ft-input");
  const text = input.value.trim();
  if (!text) return;

  input.value = "";
  input.disabled = true;
  appendFTTranscript("You", text);
  ftHistory.push({ role: "user", content: text });
  ftMessageCount++;

  if (ftMessageCount >= FT_MAX_MESSAGES) {
    document.getElementById("ft-call-status").textContent = "Call ended — give your verdict";
    input.disabled = true;
    return;
  }

  const reply = await sendToGroq(ftHistory, ftContact.ftSystemPrompt);
  ftHistory.push({ role: "assistant", content: reply });
  appendFTTranscript(ftContact.name, reply);

  document.getElementById("ft-visualiser").style.display = "flex";
  await speakWithElevenLabs(reply, ftContact.isScammer);
  document.getElementById("ft-visualiser").style.display = "none";

  input.disabled = false;
  input.focus();
}

function appendFTTranscript(speaker, text) {
  const t = document.getElementById("ft-transcript");
  t.style.display = "block";
  const line = document.createElement("div");
  line.style.marginBottom = "4px";
  line.innerHTML = `<span style="color:rgba(255,255,255,0.4);font-size:11px;">${speaker}:</span> ${text}`;
  t.appendChild(line);
  t.scrollTop = t.scrollHeight;
}

function endFaceTimeCall() {
  document.getElementById("facetime-call").style.display = "none";
  document.getElementById("facetime-list").style.display = "block";
  ftContact = null;
  ftHistory = [];
}

function closeFaceTime() {
  endFaceTimeCall();
  closeWindow("window-facetime");
}

// expose
window.renderFaceTimeContacts = renderFaceTimeContacts;
window.sendFaceTimeMessage = sendFaceTimeMessage;
window.endFaceTimeCall = endFaceTimeCall;
window.closeFaceTime = closeFaceTime;
// --------------------
// EXPOSE TO HTML
// --------------------
window.openWindow = openWindow;
window.closeWindow = closeWindow;
window.openChat = openChat;
window.closeChat = closeChat;
window.minimizeWindow = minimizeWindow;
window.maximizeWindow = maximizeWindow;
window.toggleFullscreen = toggleFullscreen;
window.shutdown = shutdown;
window.restart = restart;
window.sleep = sleep;
window.sendMessage = sendMessage;
window.submitVerdict = submitVerdict;
window.toggleScamWidget = toggleScamWidget;
window.cancelShutdown = cancelShutdown;
window.confirmShutdown = confirmShutdown;