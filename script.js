import { auth, db } from "./firebase.js";
window._auth = auth;
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
import { sendToGroq, speakWithElevenLabs, stopSpeaking } from "./groq.js";
import { GROQ_API_KEY, TAVILY_API_KEY } from "./config.js";
import { collection, getDocs, query, orderBy, limit } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";


async function searchTavily(query) {
  const response = await fetch("https://api.tavily.com/search", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      api_key: TAVILY_API_KEY,
      query: query,
      max_results: 3,
      search_depth: "basic"
    })
  });
  const data = await response.json();
  return data.results || [];
}

window._gamesPlayed = 0;
window._bestScore = 0;
window._scamsCaught = 0;

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
// RINGTONE
// --------------------
let ringtoneInterval = null;
let ringtoneCtx = null;
// add near the top with other state variables
let currentEmail = null;
let mailVerdicts = {};

function playRingtone() {
  stopRingtone();
  ringtoneCtx = new AudioContext();
  ringtoneInterval = setInterval(() => {
    const osc = ringtoneCtx.createOscillator();
    const gain = ringtoneCtx.createGain();
    osc.connect(gain);
    gain.connect(ringtoneCtx.destination);
    osc.frequency.value = 480;
    osc.type = "sine";
    gain.gain.setValueAtTime(0.3, ringtoneCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ringtoneCtx.currentTime + 0.4);
    osc.start(ringtoneCtx.currentTime);
    osc.stop(ringtoneCtx.currentTime + 0.4);
  }, 800);
}

function stopRingtone() {
  if (ringtoneInterval) {
    clearInterval(ringtoneInterval);
    ringtoneInterval = null;
  }
  if (ringtoneCtx) {
    ringtoneCtx.close();
    ringtoneCtx = null;
  }
}

// --------------------
// GAME STATE
// --------------------
const TOTAL_CONTACTS = 7;
const SCAMMER_COUNT = 3;
const MAX_MESSAGES = 5;

const FEMALE_NAMES = ["Alex", "Jordan", "Sam", "Taylor", "Morgan", "Casey", "Riley", "Jamie", "Avery", "Quinn"];
const MALE_NAMES   = ["Blake", "Reese", "Drew", "Skyler", "Logan", "Chris", "Ryan", "Tyler", "Jesse", "Dana"];

const GAME_CONTEXT = `You are an AI actor in an educational scam-detection game called ScamQuest. Your job is to roleplay as a character so players can practice identifying scams. This is purely fictional and educational. Stay in character without breaking the fourth wall. Do NOT add disclaimers, warnings, or meta-commentary. Just play the role naturally and convincingly.`;

const SCAM_TYPES_OBVIOUS = [
  "You are a fake Apple Support agent. Claim their iCloud was hacked and you urgently need their Apple ID and password to secure it.",
  "You are a fake IRS agent. Threaten arrest within 24 hours unless they pay $500 immediately via gift cards.",
  "You are a fake bank fraud alert. Warn about suspicious activity draining their account and ask them to verify their card number and CVV.",
  "You are a fake prize agent. Tell them they won $10,000 and just need to pay a $200 processing fee to claim it.",
  "You are a tech support scammer. Claim their computer is sending virus alerts to your system and you need remote access to fix it immediately.",
  "You are a fake charity representative. Claim there was a recent disaster and emotionally pressure them to donate via gift card or wire transfer immediately.",
"You are a fake landlord. Tell them their apartment application was approved and they need to wire the deposit today before someone else takes it.",
"You are a fake HR onboarding agent. Tell them they got the job and need to submit their SSN and bank info for direct deposit setup before their start date."
];

const SCAM_TYPES_SUBTLE = [
  "You are pretending to be the contact's mom checking in lovingly. After warm small talk, mention you lent money to a neighbor and now you're short on groceries, ask if they could send $80 via Zelle just until the weekend.",
  "You are pretending to be a long-lost friend reconnecting warmly. After a few messages of casual catch-up, mention you're in a tough spot and need $100 for an emergency car repair. Be vague about details if pressed.",
  "You are pretending to be a college roommate reminiscing about old times. After bonding over memories, mention you're stuck at the airport and lost your wallet and need $150 to get home.",
  "You are pretending to be a coworker being friendly and casual. After normal small talk, mention you're short on rent this month by $200 and ask if they could help just this once via Venmo.",
  "You are pretending to be a family member calling to catch up warmly. After genuine-feeling conversation, mention there's a family emergency and you need $120 sent quickly via gift card because your bank account is frozen.",
  "You are pretending to be an old neighbor reminiscing. After friendly chat, mention your dog needs emergency vet care and you're $90 short — ask if they can help and you'll pay back next week.",
  "You are pretending to be an old friend who just got out of a tough situation. After warm catch-up, mention you're stranded in another city and need $200 wired to get home, promise to pay back immediately.",
"You are pretending to be a romantic interest who matched with them online. After 1 warm message, you MUST clearly ask them to send you gift cards or money for a medical emergency or travel to meet them. The money ask must be obvious and specific.",
"You are pretending to be a family member calling from an unfamiliar number. After establishing warmth, say you're in legal trouble and need bail money sent urgently via wire transfer before morning."
];

const NORMAL_PERSONAS_FEMALE = [
  "You are a friendly female college friend catching up casually. Never ask for money, gift cards, or personal information. Keep it completely normal.",
  "You are a mom checking in on her child and chatting warmly. Never ask for money or anything suspicious. Just normal family chat.",
  "You are a female coworker asking about weekend plans. Keep it light and normal, never suspicious.",
  "You are a female neighbor being friendly and chatty. Normal small talk only.",
  "You are a sister checking in casually. Normal sibling conversation only."
];

const NORMAL_PERSONAS_MALE = [
  "You are a friendly male college friend catching up casually. Never ask for money, gift cards, or personal information. Keep it completely normal.",
  "You are a dad checking in on his child and chatting warmly. Never ask for money or anything suspicious. Just normal family chat.",
  "You are a male coworker asking about weekend plans. Keep it light and normal, never suspicious.",
  "You are a male neighbor being friendly and chatty. Normal small talk only.",
  "You are a brother checking in casually. Normal sibling conversation only."
];

const FACETIME_NORMAL_PROMPTS_FEMALE = [
  "You are a female friend calling to catch up over FaceTime. Be warm and casual.",
  "You are a mom calling to check in on her child. Keep it warm and natural.",
  "You are a sister calling to chat casually. Be friendly and relaxed."
];

const FACETIME_NORMAL_PROMPTS_MALE = [
  "You are a male friend calling to catch up over FaceTime. Be warm and casual.",
  "You are a dad calling to check in on his child. Keep it warm and natural.",
  "You are a brother calling to chat casually. Be friendly and relaxed."
];

let contacts = [];
let currentContact = null;
let chatHistories = {};
let messageCount = {};
let msgVerdicts = {};   // verdicts from iMessage
let ftVerdicts = {};    // verdicts from FaceTime
let score = 0;
let hearts = 3;
let openedContacts = new Set();

// --------------------
// FACETIME PERSISTENT STATE (per contact)
// --------------------
let ftContact = null;
let ftHistories = {};
let ftSystemPrompts = {};
let ftMessageCounts = {};
let ftFromIncoming = false;

// --------------------
// INCOMING CALL STATE
// --------------------
let incomingContact = null;

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
// AVATAR HELPER
// --------------------
function getAvatarUrl(name, gender) {
  const style = gender === 'female' ? 'lorelei' : 'adventurer';
  return `https://api.dicebear.com/7.x/${style}/svg?seed=${name}`;
}

// --------------------
// CONTACTS
// --------------------
function generateContacts() {
  const femaleNames = shuffle(FEMALE_NAMES).slice(0, 4);
  const maleNames   = shuffle(MALE_NAMES).slice(0, 3);
  const allNames    = shuffle([...femaleNames, ...maleNames]);

  const scammerIndices = shuffle([...Array(TOTAL_CONTACTS).keys()]).slice(0, SCAMMER_COUNT);

  contacts = allNames.map((name, i) => {
    const isScammer = scammerIndices.includes(i);
    const isFemale  = FEMALE_NAMES.includes(name);
    const gender    = isFemale ? 'female' : 'male';

    const isSubtle = Math.random() > 0.5;
    const scamPool = isSubtle ? SCAM_TYPES_SUBTLE : SCAM_TYPES_OBVIOUS;
    const subtleInstruction = isSubtle
  ? " Start warm and normal. You MUST mention the money or scam ask by the 3rd message. The ask must be clearly stated before MAX_MESSAGES is reached. Never break character."
  : " Get to the point quickly but stay convincing. Never break character.";

   return {
  name,
  isScammer,
  gender,
  unknown: isScammer && Math.random() > 0.4,
  systemPrompt: isScammer
    ? GAME_CONTEXT + " Your name is " + name + ". " + shuffle(scamPool)[0] + subtleInstruction + " Keep messages short and casual. Never admit you are a scammer."
    : GAME_CONTEXT + " Your name is " + name + ". " + shuffle(isFemale ? NORMAL_PERSONAS_FEMALE : NORMAL_PERSONAS_MALE)[0] + " Keep messages casual and short like a real text. You are NOT a scammer. Never mention money, payments, gift cards, emergencies, or anything suspicious.",
  preview: "..."
};
  }); 
  
  openedContacts = new Set();  // ← closes the .map()

  chatHistories   = {};
  messageCount    = {};
 msgVerdicts = {};
ftVerdicts  = {};
  ftHistories     = {};
  ftSystemPrompts = {};
  ftMessageCounts = {};
  ftContact       = null;

  contacts.forEach(c => {
    chatHistories[c.name]   = [];
    messageCount[c.name]    = 0;
    ftHistories[c.name]     = [];
    ftMessageCounts[c.name] = 0;
  });
}
async function initializePreviews() {
  for (const contact of contacts) {
    try {
      const opener = await sendToGroq([], contact.systemPrompt + " Start the conversation with a short, natural opening message. No disclaimers or warnings.");
      contact.preview = opener;
      chatHistories[contact.name].push({ role: "assistant", content: opener });
    } catch(e) {
      contact.preview = "Hey, how's it going?";
      chatHistories[contact.name].push({ role: "assistant", content: contact.preview });
    }
    renderContacts();
    await new Promise(r => setTimeout(r, 5000));// 2s between each call
  }
}

function renderContacts() {
  const chatList = document.querySelector(".chat-list");
  chatList.innerHTML = "";
  contacts.forEach(contact => {
    const item = document.createElement("div");
    item.className = "chat-item";
    item.onclick = () => openChat(contact.name);
  item.innerHTML = `
  <img src="${contact.unknown ? 'https://api.dicebear.com/7.x/bottts/svg?seed=unknown' : getAvatarUrl(contact.name, contact.gender)}">
  <div class="chat-info">
    <span class="name" style="color:${contact.unknown ? '#8e8e93' : ''}">${contact.unknown ? 'Unknown Number' : contact.name}</span>
    <div class="preview" style="font-size:11px;color:#8e8e93;">${contact.unknown ? '+1 (' + Math.floor(Math.random()*900+100) + ') ' + Math.floor(Math.random()*900+100) + '-' + Math.floor(Math.random()*9000+1000) : ''}</div>
    <div class="preview">${contact.preview}</div>
    <div class="unread-dot" style="${openedContacts.has(contact.name) ? 'display:none;' : ''}"></div>
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

  const sidebarName = document.getElementById('settings-display-name');
  if (sidebarName) sidebarName.textContent = auth.currentUser?.displayName || 'Guest';
  generateContacts();
  renderContacts();
  initializePreviews();
  updateHeartsDisplay();
  updateScoreDisplay();
  document.getElementById('scam-widget').style.display = 'block';
  scheduleFirstCall();
setTimeout(() => generateMailInbox(), 30000);
}

// --------------------
// AI MAIL GENERATION
// --------------------
// Renders a safe email body from plain text fields — no AI HTML injected
function buildEmailBody(email) {
  const paragraphs = (email.bodyText || "")
    .split('\n')
    .filter(p => p.trim())
    .map(p => `<p style="margin-top:10px;">${escapeHtml(p)}</p>`)
    .join('');

const button = email.scam && email.buttonText
  ? `<div style="margin:16px 0;">
      <a href="#" onclick="event.preventDefault();clickedScamButton();return false;" style="background:#0a84ff;color:white;padding:10px 20px;border-radius:8px;text-decoration:none;font-size:13px;display:inline-block;">
        ${escapeHtml(email.buttonText)} →
      </a>
     </div>`
  : '';

  const showExternalWarning = email.scam && Math.random() > 0.5;
  const externalBanner = showExternalWarning
    ? `<div style="background:#fff8e8;border:1px solid #f0c040;border-radius:8px;padding:8px 12px;margin-bottom:12px;display:flex;align-items:center;gap:8px;">
        <span style="font-size:14px;">⚠️</span>
        <span style="font-size:12px;color:#7a5c00;">This sender is from outside your organization.</span>
       </div>`
    : '';

  return `${externalBanner}${paragraphs}${button}`;
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

async function generateMailInbox() {
  const prompt = `Generate exactly 12 emails for a scam detection game: 5 scam, 7 legit, in random order.
Return ONLY a valid JSON array with no markdown, no backticks, no extra text.

Each object must have ONLY these fields (all strings/booleans, NO nested objects, NO HTML):
- from: sender display name
- email: sender email address (scam emails use suspicious domains like .ru .biz .net)
- subject: email subject line
- preview: preview text under 70 characters
- time: date string like "9/14/21"
- unread: true or false
- scam: true or false
- bodyText: plain text body of the email, use \\n for line breaks, NO HTML tags at all
- buttonText: for scam emails only, the text for the suspicious CTA button (e.g. "Verify Now" or "Claim Refund"). Empty string for legit emails.

Vary scam types: fake Apple/Google security alert, fake IRS refund, fake bank fraud, fake prize win, fake delivery fee, fake Netflix payment, fake job offer, fake friend/family in urgent trouble needing money wired, fake romance interest gradually asking for gift cards, fake charity after a disaster asking for donations, fake landlord asking for wire transfer deposit, fake HR onboarding asking for SSN and bank info.
Vary legit types: family catching up, friend making plans, work email, receipt/order confirmation, doctor appointment, school notification, real brand newsletter.`;

  try {
    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${GROQ_API_KEY}`
      },
      body: JSON.stringify({
        model: "llama-3.1-8b-instant",
        messages: [
          { role: "system", content: "You are a JSON generator. Output ONLY a valid JSON array. No markdown, no explanation, no backticks." },
          { role: "user", content: prompt }
        ],
        max_tokens: 3000,
        temperature: 0.9
      })
    });

    if (response.status === 429) {
  console.warn("⚠️ Rate limited, retrying in 15s...");
  setTimeout(() => generateMailInbox(), 15000);
  return;
}
const data = await response.json();
const raw = data.choices?.[0]?.message?.content || "";

    // extract the array
    
let cleaned = raw.replace(/```json/g, '').replace(/```/g, '').trim();
const match = cleaned.match(/\[[\s\S]*\]/);
if (!match) throw new Error("No JSON array found in response");
const emails = JSON.parse(match[0]);

    if (!Array.isArray(emails) || emails.length === 0) throw new Error("Invalid array");

    // validate each email has required fields, drop malformed ones
   const clean = emails.filter(e =>
  typeof e.from === 'string' &&
  typeof e.email === 'string' &&
  typeof e.subject === 'string' &&
  e.scam !== undefined
).map((e, i) => ({
  id: i,
  from: e.from || "Unknown",
  email: e.email || "unknown@unknown.com",
  subject: e.subject || "(no subject)",
  preview: e.preview || "",
  time: e.time || "9/14/21",
  unread: e.unread === true || e.unread === 'true',
  scam: e.scam === true || e.scam === 'true',
  bodyText: e.bodyText || "",
  buttonText: e.buttonText || "",
  body: null
}));

    if (clean.length === 0) throw new Error("No valid emails after filtering");

    // attach body builder so index.html rendering functions can use it
if (clean.length === 0) throw new Error("No valid emails after filtering");

    window.mailData.inbox = clean;

    const mailWin = document.getElementById("window-mail");
    if (mailWin && !mailWin.classList.contains("hidden")) {
      if (typeof window.showMailFolder === 'function') {
        window.showMailFolder('inbox', document.querySelector('.mail-folder'));
      }
    }

    console.log("✅ AI mail inbox generated:", clean.length, "emails");
  } catch (err) {
    console.warn("⚠️ Mail generation failed, keeping static emails:", err.message);
  }
}

// --------------------
// WINDOW MANAGEMENT
// --------------------
function openWindow(id) {
  const win = document.getElementById(id);
  if (win) win.classList.remove("hidden");
  updateDockIndicator(id, true);
  if (id === 'window-notes') setTimeout(() => { if (typeof initNotes === 'function') initNotes(); }, 50);
  if (id === 'window-appstore') setTimeout(() => { if (typeof showCategory === 'function') showCategory('discover', document.querySelector('.as-cat')); }, 50);
  if (id === 'window-files') setTimeout(() => { if (typeof showFilesSection === 'function') showFilesSection('myfiles', document.querySelector('.files-nav-item')); }, 50);
  if (id === 'window-mail') setTimeout(() => { if (typeof initMail === 'function') initMail(); }, 50);
  if (id === 'window-facetime') {
    const callActive = document.getElementById("facetime-call").style.display === "flex";
    if (callActive && ftContact) {
      setWidgetContext('facetime', 'FaceTime with ' + ftContact.name, true);
     if (ftVerdicts[ftContact.name] !== undefined) showVerdictResult(ftContact.name, 'facetime');
    } else {
      document.getElementById("facetime-list").style.display = "block";
      document.getElementById("facetime-call").style.display = "none";
      renderFaceTimeContacts();
    }
  }
}

function closeWindow(id) {
  const win = document.getElementById(id);
  if (win) win.classList.add("hidden");
  updateDockIndicator(id, false);
  if (id === "window-messages") {
    currentContact = null;
    document.getElementById("chat-screen").classList.add("hidden");
    document.getElementById("chat-messages").innerHTML = "";
  }
  if (id === "window-photos") {
    viewerOpen = false;
  }
  const anyOpen = document.querySelectorAll(".window:not(.hidden)").length > 0;
  if (!anyOpen) {
    currentContact = null;
    document.getElementById('widget-context').textContent = "Nothing open yet...";
    document.getElementById('widget-verdict-section').style.display = 'none';
  }
  if (id === "window-mail") {
  currentEmail = null;
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
    currentEmail = null;
  currentContact = contacts.find(c => c.name === name);
  if (!currentContact) return;

  ftContact = null;

  const chatContact = contacts.find(c => c.name === name);
document.getElementById("chat-name").textContent = chatContact?.unknown ? 'Unknown Number' : name;
  setWidgetContext('messages', 'Chatting with ' + name, true);

  const msgContainer = document.getElementById("chat-messages");
  msgContainer.innerHTML = "";
  document.getElementById("chat-screen").classList.remove("hidden");
  // remove unread dot from this contact in the list
openedContacts.add(name);
document.querySelectorAll(".chat-item").forEach(item => {
  if (item.querySelector(".name")?.textContent === name || 
      item.querySelector(".name")?.textContent === 'Unknown Number') {
    const dot = item.querySelector(".unread-dot");
    if (dot) dot.style.display = "none";
  }
});

  document.getElementById("chat-input-field").disabled = false;
  document.querySelector(".chat-input button").disabled = false;

  chatHistories[name].forEach(msg => {
    appendBubble(msg.content, msg.role === "user" ? "sent" : "received");
  });

  if (messageCount[name] >= MAX_MESSAGES) lockChat();
if (msgVerdicts[name] !== undefined) showVerdictResult(name, 'messages');

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

  if (currentContact && msgVerdicts[currentContact.name] === undefined) {
    setWidgetContext('messages', 'Chatting with ' + currentContact.name, true);
  } else if (currentContact && msgVerdicts[currentContact.name] !== undefined) {
    showVerdictResult(currentContact.name, 'messages');
  }
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
  const ftCallVisible = document.getElementById("facetime-call")?.style.display === "flex";
  const isFaceTime = ftCallVisible && ftContact;
  const active = isFaceTime ? ftContact : currentContact;

  if (!active && !currentEmail) return;
  if (currentEmail && !active) { submitMailVerdict(isScam); return; }
  if (!active) return;

  const name = active.name;
  const verdictStore = isFaceTime ? ftVerdicts : msgVerdicts;

  if (verdictStore[name] !== undefined) return;

  const correct = isScam === active.isScammer;
  verdictStore[name] = isScam;

  if (correct) { score += 100; showToast("✅ Correct! +100"); }
  else { hearts = Math.max(0, hearts - 1); showToast("❌ Wrong! -1 heart"); }

  updateHeartsDisplay();
  updateScoreDisplay();
  showVerdictResult(name, isFaceTime ? 'facetime' : 'messages');

  if (isFaceTime) {
    setTimeout(() => { endFaceTimeCall(); ftContact = null; }, 1200);
  }

  if (hearts <= 0) setTimeout(() => gameOver(), 1000);

  // game complete when every contact has been judged in at least one channel
  const judged = new Set([...Object.keys(msgVerdicts), ...Object.keys(ftVerdicts)]);
  if (judged.size >= TOTAL_CONTACTS) setTimeout(() => gameComplete(), 1500);
}

function showVerdictResult(name, channel) {
  const contact = contacts.find(c => c.name === name);
  if (!contact) return;

  const store = channel === 'facetime' ? ftVerdicts : msgVerdicts;
  if (store[name] === undefined) return;

  const correct = store[name] === contact.isScammer;

  document.getElementById('widget-verdict-section').innerHTML = `
    <div style="height:0.5px;background:rgba(255,255,255,0.1);margin-bottom:10px;"></div>
    <div style="font-size:9px;color:rgba(255,255,255,0.45);margin-bottom:7px;">YOUR VERDICT</div>
    <div style="text-align:center;font-size:13px;font-weight:600;color:${correct ? '#30d158' : '#ff3b30'};">
      ${correct ? '✅ Correct!' : '❌ Wrong!'}
    </div>
    <button onclick="event.stopPropagation();showLearnMore('${name}')" style="margin-top:10px;width:100%;padding:7px 0;border-radius:10px;border:none;background:rgba(255,255,255,0.12);color:white;font-size:11px;cursor:pointer;">🔍 Learn More</button>
    <div id="learn-more-results" style="margin-top:8px;font-size:11px;color:rgba(255,255,255,0.7);max-height:150px;overflow-y:auto;"></div>`;
}

async function showLearnMore(name) {
  const contact = contacts.find(c => c.name === name);
  const resultsDiv = document.getElementById('learn-more-results');
  if (!resultsDiv) return;

  resultsDiv.innerHTML = `<div style="color:rgba(255,255,255,0.4);font-style:italic;">Searching...</div>`;

  try {
    const history = chatHistories[name] || [];
    const conversation = history.map(m => `${m.role === 'user' ? 'Player' : name}: ${m.content}`).join('\n');

    let query;

    if (contact?.isScammer) {
      const scamType = await sendToGroq(
        [{ role: "user", content: `Based on this conversation, identify in 5 words or less what type of scam this is. Only output the scam type name, nothing else.\n\n${conversation}` }],
        "You are a scam identification expert. Respond with only a short scam type label like 'romance scam' or 'emergency money scam' or 'fake friend car repair scam'. No explanation, no punctuation."
      );
      query = `how to recognize and avoid ${scamType} warning signs`;
    } else {
      query = "how to recognize social engineering and scam tactics";
    }

    const results = await searchTavily(query);
    if (results.length === 0) {
      resultsDiv.innerHTML = `<div style="color:rgba(255,255,255,0.4);">No results found.</div>`;
      return;
    }

    openWindow('window-safari');
safariNavigate(query);
resultsDiv.innerHTML = `<div style="color:rgba(255,255,255,0.5);font-style:italic;font-size:11px;">Opened in Safari ↗</div>`;

  } catch (err) {
    resultsDiv.innerHTML = `<div style="color:#ff3b30;">Search failed. Try again.</div>`;
  }
}



window.showLearnMore = showLearnMore;

function showToast(msg) {
 
}



function gameComplete() {
  showToast("🎉 All done! Final score: " + score);
}

// --------------------
// CLICK OUTSIDE
// --------------------
document.addEventListener("click", (e) => {
  if (
    e.target.closest(".desktop-icons") ||
    e.target.closest(".window") ||
    e.target.closest("#scam-widget") ||
    e.target.closest("#shutdown-screen") ||
    e.target.closest("#incoming-call") ||
    e.target.closest("#safari-suggestions") ||
    e.target.closest("#learn-more-modal") ||    // ← ADD THIS LINE
    e.target.closest("[style*='99998']") ||
    e.target.closest(".desktop-file-item")
  ) return;
  document.querySelectorAll(".window:not(.hidden)").forEach(win => {
    win.classList.add("hidden");
    if (win.id === "window-messages") {
      document.getElementById("chat-screen").classList.add("hidden");
    }
  });
  currentContact = null;
  document.getElementById('widget-context').textContent = "Nothing open yet...";
  document.getElementById('widget-verdict-section').style.display = 'none';
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

// --------------------
// SCAM WIDGET
// --------------------
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

function updateWidgetHUD(h, s) {
  const heartsEl = document.getElementById('widget-hearts');
  const scoreEl = document.getElementById('widget-score');
  if (heartsEl) heartsEl.textContent = '❤️'.repeat(Math.max(0,h)) + '🖤'.repeat(Math.max(0, 3 - h));
  if (scoreEl) scoreEl.textContent = s;
}

// --------------------
// FACETIME STATE
// --------------------
const FT_MAX_MESSAGES = 4;

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
  <img src="${c.unknown ? 'https://api.dicebear.com/7.x/bottts/svg?seed=unknown' : getAvatarUrl(c.name, c.gender)}" style="width:40px;height:40px;border-radius:50%;">
  <div style="flex:1;">
    <div style="font-size:13px;font-weight:600;color:${c.unknown ? 'rgba(255,255,255,0.4)' : 'white'};">${c.unknown ? 'Unknown Number' : c.name}</div>
    <div style="font-size:11px;color:rgba(255,255,255,0.4);">📹 FaceTime</div>
  </div>
  <div style="font-size:11px;color:#0a84ff;">Call</div>
`;
    container.appendChild(row);
  });
}

async function startFaceTimeCall(contact) {
    currentEmail = null;  
  ftContact = contact;
  currentContact = null;

  document.getElementById("facetime-list").style.display = "none";
  const callScreen = document.getElementById("facetime-call");
  callScreen.style.display = "flex";

  document.getElementById("ft-avatar").src = getAvatarUrl(contact.name, contact.gender);
  document.getElementById("ft-caller-name").textContent = contact.unknown ? 'Unknown Number' : contact.name;

  const transcript = document.getElementById("ft-transcript");
  transcript.innerHTML = "";
  ftHistories[contact.name].forEach(msg => {
    appendFTTranscript(msg.speaker, msg.text);
  });

  setWidgetContext('facetime', 'FaceTime with ' + contact.name, true);

  if (ftVerdicts[contact.name] !== undefined) {
    document.getElementById("ft-call-status").textContent = "Call ended";
    document.getElementById("ft-input").disabled = true;
    transcript.style.display = ftHistories[contact.name].length > 0 ? "block" : "none";
    showVerdictResult(contact.name, 'facetime');
    return;
  }

  if (ftHistories[contact.name].length > 0) {
    const callOver = ftMessageCounts[contact.name] >= FT_MAX_MESSAGES;
    document.getElementById("ft-call-status").textContent = callOver ? "Call ended — give your verdict" : "Connected";
    document.getElementById("ft-input").disabled = callOver;
    transcript.style.display = "block";
    return;
  }

  document.getElementById("ft-call-status").textContent = "Connecting...";
  transcript.style.display = "none";
  document.getElementById("ft-input").disabled = true;

  let promptPool;
  let subtleInstruction = "";

  if (contact.isScammer) {
    const isSubtle = Math.random() > 0.5;
    promptPool = isSubtle ? SCAM_TYPES_SUBTLE : SCAM_TYPES_OBVIOUS;
    subtleInstruction = isSubtle
  ? " Start with ONE warm message maximum, then you MUST clearly and specifically ask for money, gift cards, or personal information. The scam ask must be unmistakable — use a specific dollar amount or explicitly ask for gift card codes. Never break character."
  : " Get to the point quickly but stay convincing.";
  } else {
    promptPool = contact.gender === 'female' ? FACETIME_NORMAL_PROMPTS_FEMALE : FACETIME_NORMAL_PROMPTS_MALE;
  }

  ftSystemPrompts[contact.name] = GAME_CONTEXT + " Your name is " + contact.name + ". " + shuffle(promptPool)[0] + subtleInstruction + " Keep responses to 1-2 sentences max, like a real call. No disclaimers.";

  await new Promise(r => setTimeout(r, 1500));
  document.getElementById("ft-call-status").textContent = "Connected";

  const opener = await sendToGroq([], ftSystemPrompts[contact.name] + " You just connected. Say a natural opening line.");
  ftHistories[contact.name].push({ speaker: contact.name, text: opener, role: "assistant" });
  appendFTTranscript(contact.name, opener);

  document.getElementById("ft-visualiser").style.display = "flex";
try {
  await speakWithElevenLabs(opener, contact.gender === 'female');
} catch(e) {
  console.warn("TTS failed:", e);
}
document.getElementById("ft-visualiser").style.display = "none";

document.getElementById("ft-input").disabled = false;
transcript.style.display = "block";
}

async function sendFaceTimeMessage() {
  if (!ftContact) return;
  const name = ftContact.name;
  if (ftMessageCounts[name] >= FT_MAX_MESSAGES) return;

  const input = document.getElementById("ft-input");
  const text = input.value.trim();
  if (!text) return;

  input.value = "";
  input.disabled = true;
  appendFTTranscript("You", text);
  ftHistories[name].push({ speaker: "You", text, role: "user" });
  ftMessageCounts[name]++;

  if (ftMessageCounts[name] >= FT_MAX_MESSAGES) {
    document.getElementById("ft-call-status").textContent = "Call ended — give your verdict";
    input.disabled = true;
    return;
  }

  const messages = ftHistories[name]
    .filter(m => m.role === "user" || m.role === "assistant")
    .map(m => ({ role: m.role, content: m.text }));

  const reply = await sendToGroq(messages, ftSystemPrompts[name]);
  ftHistories[name].push({ speaker: name, text: reply, role: "assistant" });
  appendFTTranscript(name, reply);

  document.getElementById("ft-visualiser").style.display = "flex";
try {
  await speakWithElevenLabs(reply, ftContact.gender === 'female');
} catch(e) {
  console.warn("TTS failed:", e);
}
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
  stopSpeaking();
  document.getElementById("facetime-call").style.display = "none";
  if (ftFromIncoming) {
    ftFromIncoming = false;
    closeWindow("window-facetime");
  } else {
    document.getElementById("facetime-list").style.display = "block";
  }
}

function closeFaceTime() {
  ftFromIncoming = false;
  endFaceTimeCall();
  closeWindow("window-facetime");
}

// --------------------
// INCOMING CALLS
// --------------------
function triggerIncomingCall() {
  const desktopVisible = !document.getElementById("desktop").classList.contains("hidden");
  const noActiveCall = document.getElementById("facetime-call").style.display !== "flex";
  const noBannerShowing = document.getElementById("incoming-call").style.display === "none" || document.getElementById("incoming-call").style.display === "";
  if (desktopVisible && noActiveCall && noBannerShowing && contacts.length > 0) {
    const unjudged = contacts.filter(c => ftVerdicts[c.name] === undefined && msgVerdicts[c.name] === undefined);
    if (unjudged.length > 0) {
      incomingContact = shuffle(unjudged)[0];
      showIncomingCall(incomingContact);
    }
  }
}

function scheduleFirstCall() {
  const delay = (Math.random() * 60000) + 60000; // 1-2 minutes
  setTimeout(() => {
    triggerIncomingCall();
    scheduleIncomingCall();
  }, delay);
}

function scheduleIncomingCall() {
  const delay = (Math.random() * 900000) + 300000; // 5-20 minutes
  setTimeout(() => {
    triggerIncomingCall();
    scheduleIncomingCall();
  }, delay);
}

function showIncomingCall(contact) {
  document.getElementById("incoming-avatar").src = getAvatarUrl(contact.name, contact.gender);
  document.getElementById("incoming-name").textContent = contact.name;
  const banner = document.getElementById("incoming-call");
  banner.style.display = "block";
  playRingtone();

  setTimeout(() => {
    if (banner.style.display !== "none") declineIncomingCall();
  }, 10000);
}

function acceptIncomingCall() {
  stopRingtone();
  document.getElementById("incoming-call").style.display = "none";
  if (!incomingContact) return;
  const contact = incomingContact;
  incomingContact = null;
  ftFromIncoming = true;
  setTimeout(() => {
    openWindow("window-facetime");
    setTimeout(() => startFaceTimeCall(contact), 50);
  }, 10);
}

function declineIncomingCall() {
  stopRingtone();
  document.getElementById("incoming-call").style.display = "none";
  incomingContact = null;
}

// --------------------
// DOCK INDICATORS
// --------------------
const WINDOW_TO_DOCK = {
  'window-messages': 'dock-messages',
  'window-notes':    'dock-notes',
  'window-safari':   'dock-safari',
  'window-photos':   'dock-photos',
  'window-settings': 'dock-settings',
  'window-files':    'dock-files',
  'window-recycle':  'dock-recycle',
  'window-appstore': 'dock-appstore',
  'window-mail':     'dock-mail',
  'window-facetime': 'dock-facetime',
};

function updateDockIndicator(windowId, isOpen) {
  try {
    const dockId = WINDOW_TO_DOCK[windowId];
    if (!dockId) return;
    const icon = document.getElementById(dockId);
    if (!icon) return;
    icon.classList.toggle('running', isOpen);
  } catch(e) {}
}

function submitMailVerdict(isScam) {
  if (!currentEmail) return;
  const key = 'mail_' + currentEmail.email + '_' + currentEmail.subject;
  if (mailVerdicts[key] !== undefined) return;
  mailVerdicts[key] = isScam;

  const correct = isScam === currentEmail.scam;

  if (correct) {
    score += 100;
    showToast("✅ Correct! +100");
  } else {
    hearts = Math.max(0, hearts - 1);
    showToast("❌ Wrong! -1 heart");
  }

  updateHeartsDisplay();
  updateScoreDisplay();

  const searchQuery = currentEmail.scam
    ? "how to identify and avoid " + currentEmail.subject
    : "common email scam tactics to watch out for";

  document.getElementById('widget-verdict-section').innerHTML = `
    <div style="height:0.5px;background:rgba(255,255,255,0.1);margin-bottom:10px;"></div>
    <div style="font-size:9px;color:rgba(255,255,255,0.45);margin-bottom:7px;">YOUR VERDICT</div>
    <div style="text-align:center;font-size:13px;font-weight:600;color:${correct ? '#30d158' : '#ff3b30'};">
      ${correct ? '✅ Correct!' : '❌ Wrong!'}
    </div>
    <button onclick="event.stopPropagation();showMailLearnMore()" style="margin-top:10px;width:100%;padding:7px 0;border-radius:10px;border:none;background:rgba(255,255,255,0.12);color:white;font-size:11px;cursor:pointer;">🔍 Learn More</button>
    <div id="learn-more-results" style="margin-top:8px;font-size:11px;color:rgba(255,255,255,0.7);max-height:150px;overflow-y:auto;"></div>`;

  if (hearts <= 0) setTimeout(() => gameOver(), 1000);
}

async function showMailLearnMore() {
  if (!currentEmail) return;
  const resultsDiv = document.getElementById('learn-more-results');
  if (!resultsDiv) return;

  resultsDiv.innerHTML = `<div style="color:rgba(255,255,255,0.4);font-style:italic;">Searching...</div>`;

  const query = currentEmail.scam
    ? "warning signs of scam: " + currentEmail.from + " " + currentEmail.subject + " fraud"
    : "how to stay safe from phishing emails";

  try {
    const results = await searchTavily(query);
    if (results.length === 0) {
      resultsDiv.innerHTML = `<div style="color:rgba(255,255,255,0.4);">No results found.</div>`;
      return;
    }

    openWindow('window-safari');
safariNavigate(query);

  } catch (err) {
    resultsDiv.innerHTML = `<div style="color:#ff3b30;">Search failed. Try again.</div>`;
  }
}

window.showMailLearnMore = showMailLearnMore;

function clickedScamButton() {
  hearts = Math.max(0, hearts - 1);
  showToast("❌ You clicked a scam link! -1 heart");
  updateHeartsDisplay();
  updateScoreDisplay();
  if (hearts <= 0) setTimeout(() => gameOver(), 1000);
}

window.clickedScamButton = clickedScamButton;
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
window.renderFaceTimeContacts = renderFaceTimeContacts;
window.sendFaceTimeMessage = sendFaceTimeMessage;
window.endFaceTimeCall = endFaceTimeCall;
window.closeFaceTime = closeFaceTime;
window.acceptIncomingCall = acceptIncomingCall;
window.declineIncomingCall = declineIncomingCall;
window.setCurrentEmail = function(email) {
  currentEmail = email;
  if (email) {
    const key = 'mail_' + email.email + '_' + email.subject;
    const alreadyVoted = mailVerdicts[key] !== undefined;
    setWidgetContext('mail', 'From: ' + email.from, !alreadyVoted);
    if (alreadyVoted) {
      const correct = mailVerdicts[key] === email.scam;
      document.getElementById('widget-verdict-section').style.display = 'block';
      document.getElementById('widget-verdict-section').innerHTML = `
        <div style="height:0.5px;background:rgba(255,255,255,0.1);margin-bottom:10px;"></div>
        <div style="font-size:9px;color:rgba(255,255,255,0.45);margin-bottom:7px;">YOUR VERDICT</div>
        <div style="text-align:center;font-size:13px;font-weight:600;color:${correct ? '#30d158' : '#ff3b30'};">
          ${correct ? '✅ Correct!' : '❌ Wrong!'}
        </div>`;
    }
  }
};

async function gameOver() {
  const allVerdicts = { ...msgVerdicts, ...ftVerdicts };
  const correct = Object.keys(allVerdicts).filter(name => {
    const contact = contacts.find(c => c.name === name);
    return contact && allVerdicts[name] === contact.isScammer;
  }).length;
  const wrong = Object.keys(allVerdicts).length - correct;

  // Save score to Firestore
  const user = auth.currentUser;
  if (user) {
    const displayName = user.displayName || 'Guest';
    await setDoc(doc(db, 'leaderboard', user.uid), {
      name: displayName,
      score: score,
      timestamp: Date.now()
    }, { merge: true }); // merge:true keeps their best score if you want
  }
window._gamesPlayed = (window._gamesPlayed || 0) + 1;
window._bestScore = Math.max(window._bestScore || 0, score);
window._scamsCaught = (window._scamsCaught || 0) + correct;
  setTimeout(() => triggerGameOver(score, correct, wrong, 3 - hearts), 1000);
}

window.generateContacts = generateContacts;
window.renderContacts = renderContacts;
window.updateHeartsDisplay = updateHeartsDisplay;
window.updateScoreDisplay = updateScoreDisplay;

function resetGame() {
  score = 0;
  hearts = 3;
  generateContacts();
  renderContacts();
  initializePreviews();
  updateHeartsDisplay();
  updateScoreDisplay();
  updateWidgetHUD(3, 0); // 👈 add this
  document.getElementById("gameover-screen").style.display = "none";
  document.getElementById("go-phase-3").style.display = "none";
  document.getElementById("go-phase-1").style.display = "none";
  document.getElementById("go-phase-2").style.display = "none";
}

window.resetGame = resetGame;

function openLearnMoreModal(results, title) {
  const existing = document.getElementById('learn-more-modal');
  if (existing) { existing.remove(); return; }

  const modal = document.createElement('div');
  modal.id = 'learn-more-modal';
  modal.className = 'window';
  modal.style.cssText = `
    position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);
    width:540px;height:480px;z-index:99999;display:flex;flex-direction:column;
  `;

  modal.innerHTML = `
    <div class="window-bar" style="display:flex;align-items:center;gap:8px;padding:0 12px;">
      <div class="mac-buttons" style="display:flex;gap:6px;">
        <span class="dot red" onclick="document.getElementById('learn-more-modal').remove()" style="cursor:pointer;"></span>
        <span class="dot yellow" onclick="minimizeWindow('learn-more-modal')" style="cursor:pointer;"></span>
        <span class="dot green" onclick="maximizeWindow('learn-more-modal')" style="cursor:pointer;"></span>
      </div>
      <span style="font-size:12px;color:#1c1c1e;font-weight:500;flex:1;text-align:center;margin-right:52px;">🔍 Learn More</span>
    </div>
    <div style="flex:1;overflow-y:auto;padding:16px 20px;background:white;border-radius:0 0 12px 12px;display:flex;flex-direction:column;gap:12px;">
      <div style="font-size:11px;color:#8e8e93;margin-bottom:4px;">${title}</div>
      ${results.map(r => `
        <a href="${r.url}" target="_blank" rel="noopener noreferrer"
          style="display:block;background:#f5f5f7;border:0.5px solid #e0e0e0;
          border-radius:10px;padding:14px;text-decoration:none;"
          onmouseover="this.style.background='#ebebed'"
          onmouseout="this.style.background='#f5f5f7'">
          <div style="font-size:13px;font-weight:600;color:#0a84ff;margin-bottom:4px;">${r.title}</div>
          <div style="font-size:11px;color:#8e8e93;margin-bottom:6px;">${r.url}</div>
          <div style="font-size:12px;color:#3a3a3c;line-height:1.5;">${r.content?.slice(0, 220)}...</div>
        </a>
      `).join('')}
    </div>
  `;

  document.body.appendChild(modal);
  makeDraggable(modal);
  makeResizable(modal);
  focusWindow(modal);
}

async function loadNotesLeaderboard() {
  const el = document.getElementById('notes-leaderboard-content');
  if (!el) return;
  try {

    const snapshot = await getDocs(query(collection(db, 'leaderboard'), orderBy('score', 'desc'), limit(10)));
    if (snapshot.empty) { el.innerHTML = '<div style="color:#aaa;">No scores yet.</div>'; return; }
    const medals = ['🥇','🥈','🥉'];
    el.innerHTML = snapshot.docs.map((d, i) => {
      const { name, score } = d.data();
      return `<div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid #f0f0f0;">
        <span>${medals[i] || (i+1)+'.'} ${name}</span>
        <span style="color:#c8930a;font-weight:600;">⭐ ${score}</span>
      </div>`;
    }).join('');
  } catch(e) {
    const el2 = document.getElementById('notes-leaderboard-content');
    if (el2) el2.innerHTML = '<div style="color:#aaa;">Could not load scores.</div>';
  }
}

window.loadNotesLeaderboard = loadNotesLeaderboard;

let deathLeaderboardLoaded = false;

async function toggleDeathLeaderboard() {
  const panel = document.getElementById('death-leaderboard');
  const isHidden = panel.style.display === 'none';
  panel.style.display = isHidden ? 'block' : 'none';

  if (isHidden && !deathLeaderboardLoaded) {
    deathLeaderboardLoaded = true;
    try {
     
      const snapshot = await getDocs(query(collection(db, 'leaderboard'), orderBy('score', 'desc'), limit(10)));
      const medals = ['🥇','🥈','🥉'];
      const rows = document.getElementById('death-leaderboard-rows');
      if (snapshot.empty) { rows.innerHTML = 'No scores yet.'; return; }
      rows.innerHTML = snapshot.docs.map((d, i) => {
        const { name, score } = d.data();
        return `<div style="display:flex;justify-content:space-between;padding:5px 0;border-bottom:1px solid rgba(0,255,0,0.15);font-family:'Courier New',monospace;">
          <span style="color:${i<3?'#00ff00':'#aaa'};">${medals[i] || (i+1)+'.'} ${name}</span>
          <span style="color:#ffd60a;">⭐ ${score}</span>
        </div>`;
      }).join('');
    } catch(e) {
      document.getElementById('death-leaderboard-rows').innerHTML = 'Could not load scores.';
    }
  }
}

window.toggleDeathLeaderboard = toggleDeathLeaderboard;