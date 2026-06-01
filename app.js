const API_BASE = (window.JOLLI_API_BASE || "").replace(/\/$/, "");

const messages = document.getElementById("messages");
const form = document.getElementById("chat-form");
const input = document.getElementById("message-input");
const voiceBtn = document.getElementById("voice-btn");
const statusDot = document.getElementById("status-dot");
const statusText = document.getElementById("status-text");

const newChatBtn = document.getElementById("new-chat-btn");
const newGroupBtn = document.getElementById("new-group-btn");
const refreshHistoryBtn = document.getElementById("refresh-history-btn");
const refreshGroupsBtn = document.getElementById("refresh-groups-btn");

const chatHistory = document.getElementById("chat-history");
const groupHistory = document.getElementById("group-history");

const activeChatTitle = document.getElementById("active-chat-title");
const chatModeLabel = document.getElementById("chat-mode-label");
const saveStatus = document.getElementById("save-status");

const appShell = document.getElementById("app");
const authScreen = document.getElementById("auth-screen");
const sidebar = document.getElementById("mobile-sidebar");
const sidebarOverlay = document.getElementById("sidebar-overlay");
const openSidebarBtn = document.getElementById("open-sidebar-btn");
const closeSidebarBtn = document.getElementById("close-sidebar-btn");

let isBusy = false;
let currentMode = "chat";
let currentChatId = null;
let currentGroupId = null;
let currentChatTitle = "New chat";
let currentGroupTitle = "New group";
let currentUser = null;

/* ---------------------------------------------------------
 * Auth storage
 * --------------------------------------------------------- */

function getToken() {
    return localStorage.getItem("jolli_token");
}

function setToken(token) {
    localStorage.setItem("jolli_token", token);
}

function clearToken() {
    localStorage.removeItem("jolli_token");
}

function isLoggedIn() {
    return !!getToken();
}

/* ---------------------------------------------------------
 * API helper
 * --------------------------------------------------------- */

function apiUrl(path) {
    return `${API_BASE}${path}`;
}

function apiConfigured() {
    return API_BASE.startsWith("https://");
}

async function fetchWithTimeout(url, options = {}, timeoutMs = 15000) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
        return await fetch(url, {
            ...options,
            signal: controller.signal,
        });
    } finally {
        clearTimeout(timeout);
    }
}

async function apiFetch(path, options = {}, timeoutMs = 15000) {
    const token = getToken();

    const headers = {
        ...(options.headers || {}),
    };

    if (!(options.body instanceof FormData)) {
        headers["Content-Type"] = headers["Content-Type"] || "application/json";
    }

    if (token) {
        headers.Authorization = `Bearer ${token}`;
    }

    const response = await fetchWithTimeout(
        apiUrl(path),
        {
            ...options,
            headers,
        },
        timeoutMs
    );

    if (response.status === 401) {
        clearToken();
        currentUser = null;
        showAuthScreen("Your session expired. Please log in again.");
        throw new Error("Not authenticated");
    }

    return response;
}

/* ---------------------------------------------------------
 * iOS shell helpers
 * --------------------------------------------------------- */

function showAppShell() {
    if (authScreen) authScreen.classList.add("hidden");
    if (appShell) appShell.classList.remove("hidden");
}

function hideAppShell() {
    if (appShell) appShell.classList.add("hidden");
    if (authScreen) authScreen.classList.remove("hidden");
}

function openSidebar() {
    if (sidebar) sidebar.classList.add("open");
    if (sidebarOverlay) sidebarOverlay.classList.add("show");
}

function closeSidebar() {
    if (sidebar) sidebar.classList.remove("open");
    if (sidebarOverlay) sidebarOverlay.classList.remove("show");
}

/* ---------------------------------------------------------
 * UI helpers
 * --------------------------------------------------------- */

function setSaveStatus(text) {
    if (saveStatus) saveStatus.textContent = text;
}

function setBackendStatus(text, ok) {
    if (statusText) statusText.textContent = text;

    if (!statusDot) return;

    statusDot.classList.toggle("ok", !!ok);
    statusDot.classList.toggle("bad", !ok);
}

function setMode(mode) {
    currentMode = mode;

    if (chatModeLabel) {
        chatModeLabel.textContent = mode === "group" ? "Current group" : "Current chat";
    }
}

function clearMessages() {
    messages.innerHTML = "";
}

function addMessage(name, text, type) {
    const wrapper = document.createElement("div");
    wrapper.className = `message ${type}`;

    const nameDiv = document.createElement("div");
    nameDiv.className = "name";
    nameDiv.textContent = name;

    const bubble = document.createElement("div");
    bubble.className = "bubble";
    bubble.textContent = text;

    wrapper.appendChild(nameDiv);
    wrapper.appendChild(bubble);
    messages.appendChild(wrapper);
    messages.scrollTop = messages.scrollHeight;

    return bubble;
}

function addTypingMessage() {
    const wrapper = document.createElement("div");
    wrapper.className = "message assistant";

    const nameDiv = document.createElement("div");
    nameDiv.className = "name";
    nameDiv.textContent = "Jolli";

    const bubble = document.createElement("div");
    bubble.className = "bubble typing-bubble";

    const dots = document.createElement("span");
    dots.className = "typing-dots";
    dots.innerHTML = "<span></span><span></span><span></span>";

    bubble.appendChild(dots);
    wrapper.appendChild(nameDiv);
    wrapper.appendChild(bubble);
    messages.appendChild(wrapper);
    messages.scrollTop = messages.scrollHeight;

    return bubble;
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function typeIntoBubble(bubble, text) {
    bubble.classList.remove("typing-bubble");
    bubble.textContent = "";

    for (let i = 0; i < text.length; i++) {
        bubble.textContent += text[i];
        messages.scrollTop = messages.scrollHeight;
        await sleep(text[i].match(/[.!?]/) ? 90 : text[i].match(/[,;]/) ? 45 : 18);
    }
}

function setActiveChatTitle(title) {
    if (currentMode === "group") {
        currentGroupTitle = title || "New group";
    } else {
        currentChatTitle = title || "New chat";
    }

    if (activeChatTitle) {
        activeChatTitle.textContent = title || (currentMode === "group" ? "New group" : "New chat");
    }
}

function makeChatTitle(firstMessage) {
    const clean = firstMessage.trim().replace(/\s+/g, " ");
    if (!clean) return "New chat";
    return clean.length <= 42 ? clean : clean.slice(0, 42) + "...";
}

function getDisplayName(user) {
    return user?.username || user?.email || "User";
}

function renderWelcomeMessage() {
    clearMessages();

    if (currentUser) {
        addMessage("Jolli", `Welcome back, ${getDisplayName(currentUser)}. Ask me something.`, "assistant");
    } else {
        addMessage("Jolli", "Jolli iOS online. Log in or create an account to chat.", "assistant");
    }
}

function markActiveSidebarItems() {
    document.querySelectorAll(".history-item").forEach(item => item.classList.remove("active"));

    if (currentMode === "chat" && currentChatId) {
        const item = document.querySelector(`[data-chat-id="${currentChatId}"]`);
        if (item) item.classList.add("active");
    }

    if (currentMode === "group" && currentGroupId) {
        const item = document.querySelector(`[data-group-id="${currentGroupId}"]`);
        if (item) item.classList.add("active");
    }
}

/* ---------------------------------------------------------
 * Auth UI
 * --------------------------------------------------------- */

function showAuthScreen(message = "") {
    hideAppShell();

    const msg = document.getElementById("auth-message");
    if (msg) {
        msg.textContent = message;
        msg.style.display = message ? "block" : "none";
    }
}

function setAuthMessage(text, ok = false) {
    const msg = document.getElementById("auth-message");
    if (!msg) return;

    msg.style.display = "block";
    msg.classList.toggle("ok", !!ok);
    msg.textContent = text;
}

async function loginFromAuthScreen() {
    const email = document.getElementById("login-username")?.value.trim()
        || document.getElementById("auth-email")?.value.trim()
        || "";

    const password = document.getElementById("login-password")?.value
        || document.getElementById("auth-password")?.value
        || "";

    if (!email || !password) {
        setAuthMessage("Enter email/username and password.");
        return;
    }

    try {
        await login(email, password);
        showAppShell();
        await bootLoggedIn();
    } catch (error) {
        setAuthMessage(error.message || "Login failed.");
    }
}

async function registerFromAuthScreen() {
    const username = document.getElementById("login-username")?.value.trim()
        || document.getElementById("auth-username")?.value.trim()
        || "";

    const email = username.includes("@") ? username : `${username}@jolli.local`;

    const password = document.getElementById("login-password")?.value
        || document.getElementById("auth-password")?.value
        || "";

    if (!username || !password) {
        setAuthMessage("Enter username and password.");
        return;
    }

    try {
        await register(username, email, password);
        showAppShell();
        await bootLoggedIn();
    } catch (error) {
        setAuthMessage(error.message || "Register failed.");
    }
}

async function login(email, password) {
    const response = await fetchWithTimeout(apiUrl("/api/login"), {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
        },
        body: JSON.stringify({ email, password }),
    }, 15000);

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
        throw new Error(data.detail || `Login failed. HTTP ${response.status}`);
    }

    setToken(data.token);
    currentUser = data.user;
    return data.user;
}

async function register(username, email, password) {
    const response = await fetchWithTimeout(apiUrl("/api/register"), {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
        },
        body: JSON.stringify({ username, email, password }),
    }, 15000);

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
        throw new Error(data.detail || `Register failed. HTTP ${response.status}`);
    }

    setToken(data.token);
    currentUser = data.user;
    return data.user;
}

async function loadMe() {
    const response = await apiFetch("/api/me", {}, 10000);

    if (!response.ok) {
        throw new Error(`Could not load user. HTTP ${response.status}`);
    }

    const data = await response.json();
    currentUser = data.user;
    return currentUser;
}

function addLogoutButton() {
    if (!newChatBtn || document.getElementById("logout-btn")) return;

    const logoutBtn = document.createElement("button");
    logoutBtn.id = "logout-btn";
    logoutBtn.className = "new-chat-btn";
    logoutBtn.type = "button";
    logoutBtn.textContent = "Logout";

    logoutBtn.addEventListener("click", () => {
        clearToken();
        currentUser = null;
        currentChatId = null;
        currentGroupId = null;
        setMode("chat");
        setActiveChatTitle("New chat");
        setSaveStatus("Logged out");
        renderWelcomeMessage();
        loadChatHistory();
        loadGroups();
        showAuthScreen();
        closeSidebar();
    });

    newChatBtn.insertAdjacentElement("afterend", logoutBtn);
}

/* ---------------------------------------------------------
 * Backend status
 * --------------------------------------------------------- */

async function checkStatus() {
    if (!apiConfigured()) {
        setBackendStatus(
            "API config missing. Set window.JOLLI_API_BASE in static/config.js.",
            false
        );
        return;
    }

    try {
        const response = await fetchWithTimeout(apiUrl("/api/status"), {}, 10000);

        if (!response.ok) {
            setBackendStatus(`Service error: HTTP ${response.status}`, false);
            return;
        }

        const data = await response.json();

        if (data.service_online) {
            setBackendStatus(data.service_status || "Service online", true);
        } else {
            setBackendStatus("Service offline", false);
        }
    } catch (error) {
        if (error.name === "AbortError") {
            setBackendStatus("Service timed out.", false);
        } else {
            setBackendStatus("Could not reach Jolli service.", false);
        }
    }
}

/* ---------------------------------------------------------
 * Private chat history API
 * --------------------------------------------------------- */

async function createChat(title) {
    setSaveStatus("Creating chat...");

    const response = await apiFetch("/api/chats", {
        method: "POST",
        body: JSON.stringify({ title: title || "New chat" }),
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
        throw new Error(data.detail || `Failed to create chat. HTTP ${response.status}`);
    }

    const chat = data.chat || data;

    currentChatId = chat.id;
    currentGroupId = null;
    setMode("chat");
    setActiveChatTitle(chat.title || title || "New chat");
    setSaveStatus("Chat created");

    await loadChatHistory();
    return chat;
}

async function loadChatHistory() {
    if (!chatHistory) return;

    if (!apiConfigured()) {
        chatHistory.innerHTML = `<div class="history-empty">API config missing.</div>`;
        return;
    }

    if (!isLoggedIn()) {
        chatHistory.innerHTML = `<div class="history-empty">Log in to see your chats.</div>`;
        return;
    }

    try {
        const response = await apiFetch("/api/chats", {}, 10000);

        if (!response.ok) {
            throw new Error(`Failed to load chat history. HTTP ${response.status}`);
        }

        const data = await response.json();
        const chats = data.chats || [];

        chatHistory.innerHTML = "";

        if (chats.length === 0) {
            chatHistory.innerHTML = `<div class="history-empty">No saved chats yet.</div>`;
            return;
        }

        for (const chat of chats) {
            const item = document.createElement("button");
            item.type = "button";
            item.className = "history-item";
            item.dataset.chatId = chat.id;

            if (currentMode === "chat" && chat.id === currentChatId) {
                item.classList.add("active");
            }

            item.innerHTML = `
                <span class="history-title"></span>
                <span class="history-date"></span>
            `;

            item.querySelector(".history-title").textContent = chat.title || "Untitled chat";
            item.querySelector(".history-date").textContent = chat.updated_at || chat.created_at || "";

            item.addEventListener("click", () => {
                loadChat(chat.id);
                closeSidebar();
            });

            chatHistory.appendChild(item);
        }
    } catch {
        chatHistory.innerHTML = `<div class="history-empty">Could not load chat history.</div>`;
    }
}

async function loadChat(chatId) {
    if (isBusy || !apiConfigured() || !isLoggedIn()) return;

    try {
        setSaveStatus("Loading chat...");

        const response = await apiFetch(`/api/chats/${chatId}`, {}, 10000);

        if (!response.ok) {
            throw new Error(`Failed to load chat. HTTP ${response.status}`);
        }

        const data = await response.json();

        currentChatId = data.id;
        currentGroupId = null;
        setMode("chat");
        setActiveChatTitle(data.title || "Untitled chat");

        clearMessages();

        const chatMessages = data.messages || [];

        if (chatMessages.length === 0) {
            addMessage("Jolli", "This chat is empty.", "assistant");
        } else {
            for (const msg of chatMessages) {
                addMessage(msg.role === "user" ? "You" : "Jolli", msg.content, msg.role === "user" ? "user" : "assistant");
            }
        }

        setSaveStatus("Loaded");
        await loadChatHistory();
        await loadGroups();
        markActiveSidebarItems();
    } catch (error) {
        setSaveStatus("Load failed");
        addMessage("Jolli", "Could not load that chat: " + error.message, "assistant");
    }
}

function startNewChat() {
    if (isBusy) return;

    currentChatId = null;
    currentGroupId = null;
    setMode("chat");
    setActiveChatTitle("New chat");
    setSaveStatus("Ready");
    renderWelcomeMessage();
    loadChatHistory();
    loadGroups();
    closeSidebar();
}

/* ---------------------------------------------------------
 * Groups API
 * --------------------------------------------------------- */

async function createGroup(name) {
    setSaveStatus("Creating group...");

    const response = await apiFetch("/api/groups", {
        method: "POST",
        body: JSON.stringify({ name: name || "New group" }),
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
        throw new Error(data.detail || `Failed to create group. HTTP ${response.status}`);
    }

    const group = data.group || data;

    currentGroupId = group.id;
    currentChatId = null;
    setMode("group");
    setActiveChatTitle(group.name || name || "New group");
    setSaveStatus("Group created");

    await loadGroups();
    await loadGroup(group.id);

    return group;
}

async function loadGroups() {
    if (!groupHistory) return;

    if (!apiConfigured()) {
        groupHistory.innerHTML = `<div class="history-empty">API config missing.</div>`;
        return;
    }

    if (!isLoggedIn()) {
        groupHistory.innerHTML = `<div class="history-empty">Log in to see your groups.</div>`;
        return;
    }

    try {
        const response = await apiFetch("/api/groups", {}, 10000);

        if (!response.ok) {
            throw new Error(`Failed to load groups. HTTP ${response.status}`);
        }

        const data = await response.json();
        const groups = data.groups || [];

        groupHistory.innerHTML = "";

        if (groups.length === 0) {
            groupHistory.innerHTML = `<div class="history-empty">No groups yet.</div>`;
            return;
        }

        for (const group of groups) {
            const item = document.createElement("button");
            item.type = "button";
            item.className = "history-item";
            item.dataset.groupId = group.id;

            if (currentMode === "group" && group.id === currentGroupId) {
                item.classList.add("active");
            }

            item.innerHTML = `
                <span class="history-title"></span>
                <span class="history-date"></span>
            `;

            item.querySelector(".history-title").textContent = group.name || "Untitled group";
            item.querySelector(".history-date").textContent =
                group.role ? `role: ${group.role}` : (group.updated_at || group.created_at || "");

            item.addEventListener("click", () => {
                loadGroup(group.id);
                closeSidebar();
            });

            groupHistory.appendChild(item);
        }
    } catch {
        groupHistory.innerHTML = `<div class="history-empty">Could not load groups.</div>`;
    }
}

async function loadGroup(groupId) {
    if (isBusy || !apiConfigured() || !isLoggedIn()) return;

    try {
        setSaveStatus("Loading group...");

        const response = await apiFetch(`/api/groups/${groupId}`, {}, 10000);

        if (!response.ok) {
            throw new Error(`Failed to load group. HTTP ${response.status}`);
        }

        const data = await response.json();

        currentGroupId = data.id;
        currentChatId = null;
        setMode("group");
        setActiveChatTitle(data.name || "Untitled group");

        clearMessages();

        const groupMessages = data.messages || [];

        if (groupMessages.length === 0) {
            addMessage("Jolli", "This group is empty. Send a message to start.", "assistant");
        } else {
            for (const msg of groupMessages) {
                if (msg.role === "user") {
                    addMessage(msg.username || msg.email || "User", msg.content, "user");
                } else {
                    addMessage("Jolli", msg.content, "assistant");
                }
            }
        }

        setSaveStatus("Group loaded");
        await loadChatHistory();
        await loadGroups();
        markActiveSidebarItems();
    } catch (error) {
        setSaveStatus("Group load failed");
        addMessage("Jolli", "Could not load that group: " + error.message, "assistant");
    }
}

async function startNewGroup() {
    if (isBusy) return;

    if (!isLoggedIn()) {
        showAuthScreen("Please log in before creating a group.");
        return;
    }

    const name = prompt("Group name:");
    if (!name || !name.trim()) return;

    try {
        await createGroup(name.trim());
        closeSidebar();
    } catch (error) {
        addMessage("Jolli", "Could not create group: " + error.message, "assistant");
        setSaveStatus("Group error");
    }
}

async function addMemberToCurrentGroup() {
    if (!currentGroupId) {
        addMessage("Jolli", "Open a group first before adding members.", "assistant");
        return;
    }

    const identifier = prompt("Enter member email or username:");
    if (!identifier || !identifier.trim()) return;

    try {
        const response = await apiFetch(`/api/groups/${currentGroupId}/members`, {
            method: "POST",
            body: JSON.stringify({ identifier: identifier.trim() }),
        });

        const data = await response.json().catch(() => ({}));

        if (!response.ok) {
            throw new Error(data.detail || `Failed to add member. HTTP ${response.status}`);
        }

        addMessage("Jolli", `Member added: ${data.user?.username || data.user?.email || identifier}`, "assistant");
        await loadGroup(currentGroupId);
    } catch (error) {
        addMessage("Jolli", "Could not add member: " + error.message, "assistant");
    }
}

/* ---------------------------------------------------------
 * Send message
 * --------------------------------------------------------- */

async function sendMessage(text) {
    if (isBusy) return;

    if (!apiConfigured()) {
        addMessage("Jolli", "API config missing. Set window.JOLLI_API_BASE in config.js.", "assistant");
        return;
    }

    if (!isLoggedIn()) {
        showAuthScreen("Please log in before chatting.");
        return;
    }

    isBusy = true;
    input.value = "";
    input.disabled = true;
    voiceBtn.disabled = true;

    try {
        if (currentMode === "group") {
            await sendGroupMessage(text);
        } else {
            await sendPrivateMessage(text);
        }
    } catch (error) {
        addMessage("Jolli", "Jolli backend error: " + error.message, "assistant");
        setSaveStatus("Error");
    } finally {
        input.disabled = false;
        voiceBtn.disabled = false;
        input.focus();
        isBusy = false;
    }
}

async function sendPrivateMessage(text) {
    const firstMessageInChat = currentChatId === null;
    const title = firstMessageInChat ? makeChatTitle(text) : currentChatTitle;

    if (!currentChatId) {
        await createChat(title);
    }

    addMessage("You", text, "user");

    const jolliBubble = addTypingMessage();

    const response = await apiFetch("/api/chat", {
        method: "POST",
        body: JSON.stringify({
            message: text,
            chat_id: currentChatId,
            ...getSelectedModelPayload(),
        }),
    }, 120000);

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
        throw new Error(data.detail || `Failed to talk to Jolli backend. HTTP ${response.status}`);
    }

    if (data.chat_id) currentChatId = data.chat_id;

    const reply = data.reply || "I did not get a response.";

    await typeIntoBubble(jolliBubble, reply);
    speakText(reply);

    setSaveStatus("Saved");
    await loadChatHistory();
}

async function sendGroupMessage(text) {
    if (!currentGroupId) {
        throw new Error("Open or create a group first.");
    }

    addMessage(getDisplayName(currentUser), text, "user");

    const jolliBubble = addTypingMessage();

    const response = await apiFetch(`/api/groups/${currentGroupId}/chat`, {
        method: "POST",
        body: JSON.stringify({
            message: text,
            ...getSelectedModelPayload(),
        }),
    }, 120000);

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
        throw new Error(data.detail || `Failed to talk in group. HTTP ${response.status}`);
    }

    const reply = data.reply || "I did not get a response.";

    await typeIntoBubble(jolliBubble, reply);
    speakText(reply);

    setSaveStatus("Group saved");
    await loadGroups();
}

/* ---------------------------------------------------------
 * Voice: browser fallback + Expo/Vosk bridge
 * --------------------------------------------------------- */

const JolliVoice = {
    rate: Number(localStorage.getItem("jolli_voice_rate") || "0.95"),
    pitch: Number(localStorage.getItem("jolli_voice_pitch") || "0.9"),
    volume: Number(localStorage.getItem("jolli_voice_volume") || "1"),
    voiceName: localStorage.getItem("jolli_voice_name") || "",

    supported() {
        return "speechSynthesis" in window && "SpeechSynthesisUtterance" in window;
    },

    stop() {
        if (this.supported()) {
            window.speechSynthesis.cancel();
        }
    },

    getVoice() {
        if (!this.supported()) {
            return null;
        }

        const voices = window.speechSynthesis.getVoices();

        if (this.voiceName) {
            const selected = voices.find(voice => voice.name === this.voiceName);
            if (selected) {
                return selected;
            }
        }

        return (
            voices.find(voice => voice.lang.toLowerCase().startsWith("en")) ||
            voices[0] ||
            null
        );
    },

    clean(text) {
        return String(text || "")
            .replace(/```[\s\S]*?```/g, "code block omitted")
            .replace(/https?:\/\/\S+/g, "link omitted")
            .replace(/\s+/g, " ")
            .trim()
            .slice(0, 3000);
    },

    speak(text) {
        if (!this.supported()) {
            return;
        }

        const cleaned = this.clean(text);

        if (!cleaned) {
            return;
        }

        this.stop();

        const utterance = new SpeechSynthesisUtterance(cleaned);
        const voice = this.getVoice();

        if (voice) {
            utterance.voice = voice;
            utterance.lang = voice.lang;
        } else {
            utterance.lang = "en-US";
        }

        utterance.rate = Math.max(0.5, Math.min(2, this.rate));
        utterance.pitch = Math.max(0, Math.min(2, this.pitch));
        utterance.volume = Math.max(0, Math.min(1, this.volume));

        window.speechSynthesis.speak(utterance);
    }
};

window.JolliVoice = JolliVoice;

function speakText(text) {
    JolliVoice.speak(text);
}

window.addEventListener("beforeunload", () => {
    JolliVoice.stop();
});

document.addEventListener("click", () => {
    if (JolliVoice.supported()) {
        window.speechSynthesis.getVoices();
    }
}, { once: true });

if ("speechSynthesis" in window) {
    window.speechSynthesis.onvoiceschanged = () => {
        JolliVoice.getVoice();
    };
}


function startVoiceInput() {
    if (isBusy) return;

    if (window.ReactNativeWebView) {
        window.ReactNativeWebView.postMessage(JSON.stringify({
            type: "JOLLI_START_VOSK",
        }));

        addMessage("Jolli", "Listening with Jolli iOS voice...", "assistant");
        return;
    }

    startBrowserSpeechRecognition();
}

function startBrowserSpeechRecognition() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

    if (!SpeechRecognition) {
        addMessage("Jolli", "Voice is not available here. In the iOS app, connect this button to the Vosk bridge.", "assistant");
        return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = "en-US";
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    addMessage("Jolli", "Listening from browser microphone...", "assistant");

    recognition.start();

    recognition.onresult = event => {
        const text = event.results[0][0].transcript;
        sendMessage(text);
    };

    recognition.onerror = event => {
        addMessage("Jolli", "Speech recognition error: " + event.error, "assistant");
    };
}

window.jolliReceiveVoiceText = function(text) {
    if (!text || !text.trim()) return;
    input.value = text.trim();
    sendMessage(text.trim());
};


/* Jolli extra features v1 */

let selectedJolliModel = localStorage.getItem("jolli_selected_model") || "";

function getSelectedModelPayload() {
    if (!selectedJolliModel) {
        return {};
    }

    return {
        model: selectedJolliModel,
    };
}

function createExtraFeaturesPanel() {
    if (document.getElementById("jolli-extra-panel")) {
        return;
    }

    const panel = document.createElement("div");
    panel.id = "jolli-extra-panel";
    panel.className = "jolli-extra-panel";

    panel.innerHTML = `
        <div class="jolli-extra-header">
            <strong>Jolli Tools</strong>
            <span>Memory · Knowledge · Models</span>
        </div>

        <label class="jolli-tool-label">
            Model
            <select id="jolli-model-select">
                <option value="">Default fast model</option>
            </select>
        </label>

        <div class="jolli-tool-row">
            <input id="jolli-memory-query" type="text" placeholder="Search memories..." />
            <button id="jolli-memory-search-btn" type="button">Memory</button>
        </div>

        <div class="jolli-tool-row">
            <input id="jolli-knowledge-query" type="text" placeholder="Search knowledge..." />
            <button id="jolli-knowledge-search-btn" type="button">Knowledge</button>
        </div>

        <div class="jolli-tool-row">
            <button id="jolli-import-knowledge-btn" type="button">Import training_data</button>
            <button id="jolli-clear-tools-btn" type="button">Clear</button>
        </div>

        <div id="jolli-tool-output" class="jolli-tool-output"></div>
    `;

    const target =
        document.querySelector(".commands") ||
        document.querySelector(".sidebar") ||
        document.body;

    target.appendChild(panel);

    wireExtraFeaturesPanel();
}

function setToolOutput(text, ok = true) {
    const out = document.getElementById("jolli-tool-output");
    if (!out) return;

    out.classList.toggle("bad", !ok);
    out.textContent = text || "";
}

async function loadJolliModels() {
    const select = document.getElementById("jolli-model-select");

    if (!select || !apiConfigured() || !isLoggedIn()) {
        return;
    }

    try {
        const response = await apiFetch("/api/models", {}, 15000);
        const data = await response.json().catch(() => ({}));

        if (!response.ok) {
            throw new Error(data.detail || `HTTP ${response.status}`);
        }

        const models = data.models || [];

        select.innerHTML = `<option value="">Default fast model</option>`;

        for (const model of models) {
            const option = document.createElement("option");
            option.value = model;
            option.textContent = model;

            if (model === selectedJolliModel) {
                option.selected = true;
            }

            select.appendChild(option);
        }

        if (models.length > 0) {
            setToolOutput(`Loaded ${models.length} Ollama model(s).`);
        }
    } catch (error) {
        setToolOutput("Could not load models: " + error.message, false);
    }
}

async function searchJolliMemory() {
    const input = document.getElementById("jolli-memory-query");
    const query = input?.value.trim() || "";

    try {
        const response = await apiFetch("/api/memory/search", {
            method: "POST",
            body: JSON.stringify({
                query,
                limit: 8,
                include_archived: false,
            }),
        }, 20000);

        const data = await response.json().catch(() => ({}));

        if (!response.ok) {
            throw new Error(data.detail || `HTTP ${response.status}`);
        }

        const memories = data.memories || [];

        if (memories.length === 0) {
            setToolOutput("No memories found.");
            return;
        }

        const text = memories.map((memory, index) => {
            const content = memory.content || String(memory);
            return `${index + 1}. ${content}`;
        }).join("\n\n");

        setToolOutput(text);
    } catch (error) {
        setToolOutput("Memory search failed: " + error.message, false);
    }
}

async function searchJolliKnowledge() {
    const input = document.getElementById("jolli-knowledge-query");
    const query = input?.value.trim() || "";

    if (!query) {
        setToolOutput("Enter a knowledge search query.", false);
        return;
    }

    try {
        const response = await apiFetch("/api/knowledge/search", {
            method: "POST",
            body: JSON.stringify({
                query,
                limit: 5,
            }),
        }, 60000);

        const data = await response.json().catch(() => ({}));

        if (!response.ok) {
            throw new Error(data.detail || `HTTP ${response.status}`);
        }

        const matches = data.matches || [];

        if (matches.length === 0) {
            setToolOutput("No knowledge matches found.");
            return;
        }

        const text = matches.map((item, index) => {
            const title = item.title || "Untitled";
            const source = item.source || "unknown";
            const score = typeof item.score === "number" ? item.score.toFixed(4) : "n/a";
            const content = String(item.content || "").slice(0, 500);

            return `${index + 1}. ${title}\nSource: ${source}\nScore: ${score}\n${content}`;
        }).join("\n\n---\n\n");

        setToolOutput(text);
    } catch (error) {
        setToolOutput("Knowledge search failed: " + error.message, false);
    }
}

async function importJolliKnowledge() {
    try {
        setToolOutput("Importing training_data...");

        const response = await apiFetch("/api/knowledge/import", {
            method: "POST",
            body: JSON.stringify({
                clear_first: false,
            }),
        }, 120000);

        const data = await response.json().catch(() => ({}));

        if (!response.ok) {
            throw new Error(data.detail || `HTTP ${response.status}`);
        }

        const imported = data.imported ?? 0;
        const total = data.stats?.total_chunks ?? "unknown";

        setToolOutput(`Imported ${imported} chunk(s). Total knowledge chunks: ${total}.`);
    } catch (error) {
        setToolOutput("Knowledge import failed: " + error.message, false);
    }
}

function wireExtraFeaturesPanel() {
    const modelSelect = document.getElementById("jolli-model-select");
    const memoryBtn = document.getElementById("jolli-memory-search-btn");
    const knowledgeBtn = document.getElementById("jolli-knowledge-search-btn");
    const importBtn = document.getElementById("jolli-import-knowledge-btn");
    const clearBtn = document.getElementById("jolli-clear-tools-btn");

    if (modelSelect) {
        modelSelect.addEventListener("change", () => {
            selectedJolliModel = modelSelect.value || "";
            localStorage.setItem("jolli_selected_model", selectedJolliModel);
            setToolOutput(selectedJolliModel ? `Using model: ${selectedJolliModel}` : "Using default fast model.");
        });
    }

    if (memoryBtn) {
        memoryBtn.addEventListener("click", searchJolliMemory);
    }

    if (knowledgeBtn) {
        knowledgeBtn.addEventListener("click", searchJolliKnowledge);
    }

    if (importBtn) {
        importBtn.addEventListener("click", importJolliKnowledge);
    }

    if (clearBtn) {
        clearBtn.addEventListener("click", () => setToolOutput(""));
    }
}



/* Jolli voice call screen v1 */

let jolliCallActive = false;
let jolliCallListening = false;
let jolliCallRecognition = null;

function createJolliCallScreen() {
    if (document.getElementById("jolli-call-screen")) {
        return;
    }

    const callBtn = document.createElement("button");
    callBtn.id = "jolli-call-open-btn";
    callBtn.type = "button";
    callBtn.className = "jolli-call-open-btn";
    callBtn.textContent = "Call Jolli";

    const callScreen = document.createElement("div");
    callScreen.id = "jolli-call-screen";
    callScreen.className = "jolli-call-screen hidden";

    callScreen.innerHTML = `
        <div class="jolli-call-bg"></div>

        <div class="jolli-call-card">
            <div class="jolli-call-top">
                <button id="jolli-call-close-btn" type="button" class="jolli-call-icon-btn">×</button>
                <div>
                    <div class="jolli-call-label">Voice call</div>
                    <h2>Jolli</h2>
                </div>
                <div id="jolli-call-state" class="jolli-call-state">Disconnected</div>
            </div>

            <div class="jolli-call-orb-wrap">
                <div id="jolli-call-orb" class="jolli-call-orb idle"></div>
                <div id="jolli-call-pulse" class="jolli-call-pulse"></div>
            </div>

            <div id="jolli-call-status" class="jolli-call-status">
                Tap connect to start speaking with Jolli.
            </div>

            <div id="jolli-call-transcript" class="jolli-call-transcript"></div>

            <div class="jolli-call-controls">
                <button id="jolli-call-connect-btn" type="button" class="jolli-call-main-btn">
                    Connect
                </button>

                <button id="jolli-call-mic-btn" type="button" class="jolli-call-secondary-btn" disabled>
                    Speak
                </button>

                <button id="jolli-call-stop-voice-btn" type="button" class="jolli-call-secondary-btn">
                    Stop voice
                </button>

                <button id="jolli-call-end-btn" type="button" class="jolli-call-end-btn" disabled>
                    End
                </button>
            </div>
        </div>
    `;

    const target =
        document.querySelector(".chat-header") ||
        document.querySelector(".sidebar-top") ||
        document.body;

    target.appendChild(callBtn);
    document.body.appendChild(callScreen);

    wireJolliCallScreen();
}

function setJolliCallStatus(text) {
    const status = document.getElementById("jolli-call-status");
    if (status) status.textContent = text;
}

function setJolliCallState(text) {
    const state = document.getElementById("jolli-call-state");
    if (state) state.textContent = text;
}

function setJolliCallOrb(mode) {
    const orb = document.getElementById("jolli-call-orb");
    if (!orb) return;

    orb.classList.remove("idle", "listening", "thinking", "speaking", "error");
    orb.classList.add(mode || "idle");
}

function addJolliCallTranscript(name, text, type) {
    const transcript = document.getElementById("jolli-call-transcript");
    if (!transcript) return;

    const item = document.createElement("div");
    item.className = `jolli-call-line ${type || ""}`;

    const who = document.createElement("strong");
    who.textContent = name;

    const body = document.createElement("span");
    body.textContent = text;

    item.appendChild(who);
    item.appendChild(body);

    transcript.appendChild(item);
    transcript.scrollTop = transcript.scrollHeight;
}

function openJolliCallScreen() {
    const screen = document.getElementById("jolli-call-screen");
    if (screen) screen.classList.remove("hidden");
}

function closeJolliCallScreen() {
    endJolliCall();

    const screen = document.getElementById("jolli-call-screen");
    if (screen) screen.classList.add("hidden");
}

function updateJolliCallButtons() {
    const connectBtn = document.getElementById("jolli-call-connect-btn");
    const micBtn = document.getElementById("jolli-call-mic-btn");
    const endBtn = document.getElementById("jolli-call-end-btn");

    if (connectBtn) connectBtn.disabled = jolliCallActive;
    if (micBtn) micBtn.disabled = !jolliCallActive || jolliCallListening;
    if (endBtn) endBtn.disabled = !jolliCallActive;
}

function connectJolliCall() {
    if (!apiConfigured()) {
        setJolliCallStatus("API config missing. Jolli cannot connect.");
        setJolliCallOrb("error");
        return;
    }

    if (!isLoggedIn()) {
        setJolliCallStatus("Please log in before calling Jolli.");
        setJolliCallOrb("error");
        showAuthScreen("Please log in before calling Jolli.");
        return;
    }

    jolliCallActive = true;
    setJolliCallState("Connected");
    setJolliCallStatus("Connected. Tap Speak and talk to Jolli.");
    setJolliCallOrb("idle");
    updateJolliCallButtons();

    addJolliCallTranscript("Jolli", "Voice call connected.", "assistant");
    speakText("Voice call connected. Tap speak and talk to me.");
}

function endJolliCall() {
    jolliCallActive = false;
    jolliCallListening = false;

    if (jolliCallRecognition) {
        try {
            jolliCallRecognition.stop();
        } catch {
            // ignore
        }

        jolliCallRecognition = null;
    }

    if (window.JolliVoice && typeof window.JolliVoice.stop === "function") {
        window.JolliVoice.stop();
    } else if ("speechSynthesis" in window) {
        window.speechSynthesis.cancel();
    }

    setJolliCallState("Disconnected");
    setJolliCallStatus("Call ended.");
    setJolliCallOrb("idle");
    updateJolliCallButtons();
}

function getSpeechRecognitionEngine() {
    return window.SpeechRecognition || window.webkitSpeechRecognition || null;
}

function startJolliCallListening() {
    if (!jolliCallActive || jolliCallListening) {
        return;
    }

    const SpeechRecognition = getSpeechRecognitionEngine();

    if (!SpeechRecognition) {
        setJolliCallStatus("Speech recognition is not available in this browser.");
        setJolliCallOrb("error");
        addJolliCallTranscript("Jolli", "Speech recognition is not available in this browser.", "assistant");
        return;
    }

    const recognition = new SpeechRecognition();

    recognition.lang = "en-US";
    recognition.interimResults = false;
    recognition.continuous = false;
    recognition.maxAlternatives = 1;

    jolliCallRecognition = recognition;
    jolliCallListening = true;

    setJolliCallState("Listening");
    setJolliCallStatus("Listening...");
    setJolliCallOrb("listening");
    updateJolliCallButtons();

    recognition.start();

    recognition.onresult = event => {
        const text = event.results?.[0]?.[0]?.transcript || "";

        if (!text.trim()) {
            setJolliCallStatus("I did not hear anything clearly.");
            setJolliCallOrb("idle");
            return;
        }

        addJolliCallTranscript("You", text, "user");
        sendJolliCallMessage(text.trim());
    };

    recognition.onerror = event => {
        jolliCallListening = false;
        setJolliCallState("Connected");
        setJolliCallStatus("Mic error: " + event.error);
        setJolliCallOrb("error");
        updateJolliCallButtons();
    };

    recognition.onend = () => {
        jolliCallListening = false;

        if (jolliCallActive) {
            setJolliCallState("Connected");
            updateJolliCallButtons();
        }
    };
}

async function sendJolliCallMessage(text) {
    if (!jolliCallActive) {
        return;
    }

    try {
        setJolliCallState("Thinking");
        setJolliCallStatus("Jolli is thinking...");
        setJolliCallOrb("thinking");
        updateJolliCallButtons();

        if (!currentChatId) {
            const title = makeChatTitle(text);
            await createChat(title);
        }

        const response = await apiFetch("/api/chat", {
            method: "POST",
            body: JSON.stringify({
                message: text,
                chat_id: currentChatId,
                ...(typeof getSelectedModelPayload === "function" ? getSelectedModelPayload() : {}),
            }),
        }, 120000);

        const data = await response.json().catch(() => ({}));

        if (!response.ok) {
            throw new Error(data.detail || `HTTP ${response.status}`);
        }

        if (data.chat_id) {
            currentChatId = data.chat_id;
        }

        const reply = data.reply || "I did not get a response.";

        addJolliCallTranscript("Jolli", reply, "assistant");

        setJolliCallState("Speaking");
        setJolliCallStatus("Jolli is speaking...");
        setJolliCallOrb("speaking");

        speakText(reply);

        // Also mirror the voice call into the normal chat UI.
        addMessage("You", text, "user");
        addMessage("Jolli", reply, "assistant");

        setSaveStatus("Saved");
        await loadChatHistory();

        setTimeout(() => {
            if (jolliCallActive) {
                setJolliCallState("Connected");
                setJolliCallStatus("Tap Speak to continue.");
                setJolliCallOrb("idle");
                updateJolliCallButtons();
            }
        }, 1000);

    } catch (error) {
        addJolliCallTranscript("Jolli", "Call error: " + error.message, "assistant");
        setJolliCallStatus("Call error: " + error.message);
        setJolliCallOrb("error");
        updateJolliCallButtons();
    }
}

function wireJolliCallScreen() {
    const openBtn = document.getElementById("jolli-call-open-btn");
    const closeBtn = document.getElementById("jolli-call-close-btn");
    const connectBtn = document.getElementById("jolli-call-connect-btn");
    const micBtn = document.getElementById("jolli-call-mic-btn");
    const endBtn = document.getElementById("jolli-call-end-btn");
    const stopVoiceBtn = document.getElementById("jolli-call-stop-voice-btn");

    if (openBtn) {
        openBtn.addEventListener("click", openJolliCallScreen);
    }

    if (closeBtn) {
        closeBtn.addEventListener("click", closeJolliCallScreen);
    }

    if (connectBtn) {
        connectBtn.addEventListener("click", connectJolliCall);
    }

    if (micBtn) {
        micBtn.addEventListener("click", startJolliCallListening);
    }

    if (endBtn) {
        endBtn.addEventListener("click", endJolliCall);
    }

    if (stopVoiceBtn) {
        stopVoiceBtn.addEventListener("click", () => {
            if (window.JolliVoice && typeof window.JolliVoice.stop === "function") {
                window.JolliVoice.stop();
            } else if ("speechSynthesis" in window) {
                window.speechSynthesis.cancel();
            }

            setJolliCallStatus(jolliCallActive ? "Voice stopped. Tap Speak to continue." : "Voice stopped.");
            setJolliCallOrb(jolliCallActive ? "idle" : "idle");
        });
    }

    updateJolliCallButtons();
}

/* ---------------------------------------------------------
 * Events
 * --------------------------------------------------------- */

form.addEventListener("submit", event => {
    event.preventDefault();

    const text = input.value.trim();
    if (!text) return;

    sendMessage(text);
});

voiceBtn.addEventListener("click", startVoiceInput);

if (newChatBtn) {
    newChatBtn.addEventListener("click", startNewChat);
}

if (newGroupBtn) {
    newGroupBtn.addEventListener("click", startNewGroup);

    newGroupBtn.addEventListener("contextmenu", event => {
        event.preventDefault();
        addMemberToCurrentGroup();
    });
}

if (refreshHistoryBtn) {
    refreshHistoryBtn.addEventListener("click", loadChatHistory);
}

if (refreshGroupsBtn) {
    refreshGroupsBtn.addEventListener("click", loadGroups);
}

if (openSidebarBtn) {
    openSidebarBtn.addEventListener("click", openSidebar);
}

if (closeSidebarBtn) {
    closeSidebarBtn.addEventListener("click", closeSidebar);
}

if (sidebarOverlay) {
    sidebarOverlay.addEventListener("click", closeSidebar);
}

const loginBtn = document.getElementById("login-btn");
const createAccountBtn = document.getElementById("create-account-btn");

if (loginBtn) {
    loginBtn.addEventListener("click", loginFromAuthScreen);
}

if (createAccountBtn) {
    createAccountBtn.addEventListener("click", registerFromAuthScreen);
}

["login-username", "login-password"].forEach(id => {
    const el = document.getElementById(id);
    if (el) {
        el.addEventListener("keydown", event => {
            if (event.key === "Enter") {
                loginFromAuthScreen();
            }
        });
    }
});

/* ---------------------------------------------------------
 * Boot
 * --------------------------------------------------------- */

async function bootLoggedIn() {
    showAppShell();
    addLogoutButton();
    createJolliCallScreen();
    createExtraFeaturesPanel();
    renderWelcomeMessage();
    await checkStatus();
    await loadJolliModels();
    await loadChatHistory();
    await loadGroups();
}

async function boot() {
    hideAppShell();

    if (!apiConfigured()) {
        renderWelcomeMessage();
        await checkStatus();
        showAuthScreen("API config missing. Set window.JOLLI_API_BASE in config.js.");
        return;
    }

    await checkStatus();

    if (!isLoggedIn()) {
        renderWelcomeMessage();
        showAuthScreen();
        await loadChatHistory();
        await loadGroups();
        return;
    }

    try {
        await loadMe();
        await bootLoggedIn();
    } catch {
        clearToken();
        currentUser = null;
        renderWelcomeMessage();
        showAuthScreen("Please log in again.");
    }
}

boot();
setInterval(checkStatus, 10000);
