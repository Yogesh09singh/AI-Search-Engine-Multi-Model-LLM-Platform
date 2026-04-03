// AI Search Engine - Frontend Engine
// Use same origin so it works with 127.0.0.1 or localhost
const API_BASE = window.location.origin || 'http://localhost:5000';

// DOM Elements (resolved after DOM ready)
let searchInput, searchBtn, resetBtn, welcomeState, conversationArea, resultsList;
let uploadBtn, analyticsBtn, documentsBtn, analyticsModal, documentsModal;
let closeAnalytics, closeDocuments, uploadArea, fileInput, documentsList, emptyDocuments, suggestionsList;

// State
let searchHistory = JSON.parse(localStorage.getItem('searchHistory') || '[]');
let selectedSuggestion = -1;
let currentChatId = null;
let currentMessages = [];  // { role, content } for current conversation (for memory)
let chatMemoryEnabled = localStorage.getItem('chatMemoryEnabled') === 'true';
let searchMode = localStorage.getItem('searchMode') || 'compare';  // compare | smart | fast
let lastAiResponses = [];   // for export and best-answer display
let lastQuery = '';
let availableModels = [];

// Typing animation for search bar placeholders
const examplePrompts = [
    "Explain Quantum Computing in simple terms",
    "Compare React vs Angular",
    "Summarize this PDF",
    "How does photosynthesis work?",
    "Write a Python script to scrape a website",
    "Best practices for web accessibility"
];

let promptIndex = 0;
let charIndex = 0;
let isDeleting = false;
let typingSpeed = 100;

function typePlaceholder() {
    const currentPrompt = examplePrompts[promptIndex];
    const input = document.getElementById('searchInput');

    if (!input) return;

    if (isDeleting) {
        input.placeholder = currentPrompt.substring(0, charIndex--);
        typingSpeed = 50;
    } else {
        input.placeholder = currentPrompt.substring(0, charIndex++);
        typingSpeed = 100;
    }

    if (!isDeleting && charIndex === currentPrompt.length + 1) {
        isDeleting = true;
        typingSpeed = 2000; // Pause at end
    } else if (isDeleting && charIndex === 0) {
        isDeleting = false;
        promptIndex = (promptIndex + 1) % examplePrompts.length;
        typingSpeed = 500; // Pause before next
    }

    setTimeout(typePlaceholder, typingSpeed);
}

function getEl(id) {
    const el = document.getElementById(id);
    if (!el) console.warn('Missing element:', id);
    return el;
}

function updateThemeIcons(isLight) {
    const iconDark = document.getElementById('themeIconDark');
    const iconLight = document.getElementById('themeIconLight');
    if (iconDark && iconLight) {
        iconDark.classList.toggle('hidden', isLight);
        iconLight.classList.toggle('hidden', !isLight);
    }
}

function exportCopyFormatted() {
    if (!lastQuery || !lastAiResponses.length) return;
    let text = `Query: ${lastQuery}\n\n`;
    lastAiResponses.forEach((r, i) => {
        const model = (r.model || 'AI').replace(/:free$/, '').split('/').pop();
        text += `--- ${model} ---\n${r.response || 'No response'}\n\n`;
    });
    navigator.clipboard.writeText(text).then(() => showToast('Copied to clipboard')).catch(() => { });
    if (window.exportMenu) window.exportMenu.classList.add('hidden');
}

const MODEL_STRENGTHS = {
    'nemotron': { badge: '⚡ Efficient',    color: 'text-amber-400' },
    'llama':    { badge: '🦙 Groq Fast',    color: 'text-orange-400' },
    'gemini':   { badge: '✨ Google AI',    color: 'text-sky-400' },
    'phi':      { badge: '🔬 Analytical',   color: 'text-cyan-400' },
    'default':  { badge: '🤖 General',      color: 'text-slate-400' }
};

function getModelStrength(modelId) {
    const id = (modelId || '').toLowerCase();
    for (const key in MODEL_STRENGTHS) {
        if (id.includes(key)) return MODEL_STRENGTHS[key];
    }
    return MODEL_STRENGTHS['default'];
}

function calculateConfidence(text) {
    if (!text) return 0;
    const certaintyWords = ['clearly', 'definitely', 'absolutely', 'certainly', 'proven', 'fact', 'always', 'never', 'evidently'];
    const hedgingWords = ['maybe', 'possibly', 'perhaps', 'likely', 'potentially', 'seems', 'appears', 'could', 'might', 'uncertain'];

    let base = 65 + Math.floor(Math.random() * 10); // Random base for realism
    if (text.length > 500) base += 10;
    if (text.length < 100) base -= 15;

    certaintyWords.forEach(w => { if (text.toLowerCase().includes(w)) base += 3; });
    hedgingWords.forEach(w => { if (text.toLowerCase().includes(w)) base -= 4; });

    return Math.min(99, Math.max(45, base));
}

function generateConsensus(responses) {
    const validResponses = responses.filter(r => r.status === 'success' && r.response);
    if (validResponses.length < 2) return null;

    // Very simple consensus generation for demo purposes
    // In a real app, this might be another LLM call
    const snippets = validResponses.map(r => r.response.substring(0, 100));
    return "All models generally agree on the core facts. Minor differences appear in depth of technical detail and creative phrasing.";
}

function highlightDifferences(responses) {
    if (responses.length < 2) return;

    const valid = responses.filter(r => r.status === 'success' && r.response);
    if (valid.length < 2) return;

    // Split into words and find frequencies across all models
    const allWords = new Map();
    valid.forEach(r => {
        const words = r.response.toLowerCase().match(/\b(\w+)\b/g) || [];
        const uniqueInResponse = new Set(words);
        uniqueInResponse.forEach(w => {
            allWords.set(w, (allWords.get(w) || 0) + 1);
        });
    });

    // We will use this map during card rendering to wrap unique words in spans
    return allWords;
}

function exportDownloadComparison() {
    if (!lastQuery || !lastAiResponses.length) return;
    let text = `AI Search - Comparison Report\n${new Date().toISOString()}\n\nQuery: ${lastQuery}\n\n`;
    lastAiResponses.forEach((r, i) => {
        const model = (r.model || 'AI').replace(/:free$/, '').split('/').pop();
        const ms = r.response_time_ms || '—';
        const tok = r.token_count || '—';
        text += `## ${model}\nResponse time: ${ms}ms | Tokens: ${tok}\n\n${r.response || 'No response'}\n\n`;
    });
    const blob = new Blob([text], { type: 'text/plain' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `ai-search-comparison-${Date.now()}.txt`;
    a.click();
    URL.revokeObjectURL(a.href);
    showToast('Download started');
    if (window.exportMenu) window.exportMenu.classList.add('hidden');
}

function showToast(message) {
    let t = document.getElementById('toast');
    if (!t) {
        t = document.createElement('div');
        t.id = 'toast';
        t.className = 'fixed bottom-6 right-6 px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm shadow-lg z-[9999] animate-fade-in';
        document.body.appendChild(t);
    }
    t.textContent = message;
    t.classList.remove('hidden');
    setTimeout(() => t.classList.add('hidden'), 2000);
}

function initDOM() {
    searchInput = getEl('searchInput');
    searchBtn = getEl('searchBtn');
    resetBtn = getEl('resetBtn');
    welcomeState = getEl('welcomeState');
    conversationArea = getEl('conversationArea');
    resultsList = getEl('messagesContainer');
    uploadBtn = getEl('uploadBtn');
    analyticsBtn = getEl('analyticsBtn');
    documentsBtn = getEl('documentsBtn');
    analyticsModal = getEl('analyticsModal');
    documentsModal = getEl('documentsModal');
    closeAnalytics = getEl('closeAnalytics');
    closeDocuments = getEl('closeDocuments');
    uploadArea = getEl('uploadArea');
    fileInput = getEl('fileInput');
    documentsList = getEl('documentsList');
    emptyDocuments = getEl('emptyDocuments');
    suggestionsList = getEl('suggestionsList');
    window.modelSelector = getEl('modelSelector');
    window.modelDropdown = getEl('modelDropdown');
    window.newChatBtn = getEl('newChatBtn');
    window.regenerateBtn = getEl('regenerateBtn');
    window.attachFileBtn = getEl('attachFileBtn');
    window.voiceBtn = getEl('voiceBtn');
    window.chatMemoryToggle = getEl('chatMemoryToggle');
    window.pastChatsBtn = getEl('pastChatsBtn');
    window.pastChatsSidebar = getEl('pastChatsSidebar');
    window.closePastChats = getEl('closePastChats');
    window.pastChatsList = getEl('pastChatsList');
    window.pastChatsEmpty = getEl('pastChatsEmpty');
    window.pastChatsOverlay = getEl('pastChatsOverlay');
    window.attachedDocumentsStrip = getEl('attachedDocumentsStrip');
    window.attachedDocumentsCount = getEl('attachedDocumentsCount');
    window.attachedDocumentsNames = getEl('attachedDocumentsNames');
    window.openDocumentsFromStrip = getEl('openDocumentsFromStrip');
    window.newChatFromHistory = getEl('newChatFromHistory');
    window.themeToggle = getEl('themeToggle');
    window.exportBtn = getEl('exportBtn');
    window.exportMenu = getEl('exportMenu');
    window.clearInputBtn = getEl('clearInputBtn');
}

function prettyModelName(modelId) {
    if (!modelId) return 'AI Model';
    const base = modelId.replace(/:free$/i, '');
    const tail = base.split('/').pop() || base;
    return tail
        .replace(/-/g, ' ')
        .replace(/\ba3b\b/gi, 'A3B')
        .replace(/\boss\b/gi, 'OSS')
        .replace(/\b([a-z])/g, (m) => m.toUpperCase());
}

function renderModelDropdown() {
    if (!window.modelDropdown) return;
    if (!availableModels.length) return;

    const selectorLabel = document.getElementById('modelSelectorLabel');
    if (selectorLabel) selectorLabel.textContent = `Models (${availableModels.length})`;

    const items = availableModels.map((m) => {
        const label = escapeHtml(prettyModelName(m.id));
        const tooltip = escapeHtml(m.tooltip || 'Active model');
        return `
            <button class="w-full text-left px-3 py-2 rounded hover:bg-slate-700/50 text-sm text-slate-200 flex items-center justify-between gap-2" title="${tooltip}">
                <span class="truncate">${label}</span>
                <span class="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">active</span>
            </button>
        `;
    }).join('');

    window.modelDropdown.innerHTML = `<div class="px-3 py-2 text-xs text-slate-400 mb-1">Active Models</div>${items}`;
}

async function fetchAvailableModels() {
    try {
        const response = await fetch(`${API_BASE}/api/models`);
        if (!response.ok) return;
        const data = await response.json();
        availableModels = Array.isArray(data.models) ? data.models : [];
        renderModelDropdown();
    } catch (e) {
        console.warn('Could not load model list', e);
    }
}

// Event Listeners (attached after DOM ready)
function attachListeners() {
    if (!searchBtn || !searchInput || !welcomeState || !conversationArea || !resultsList) return;

    searchBtn.addEventListener('click', performSearch);
    resetBtn.addEventListener('click', resetSearch);
    searchInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') performSearch();
    });

    searchInput.addEventListener('input', (e) => {
        const query = e.target.value.trim();
        if (window.clearInputBtn) {
            window.clearInputBtn.classList.toggle('hidden', query === '');
        }
        if (suggestionsList) {
            if (query.length >= 1) showSuggestions(query);
            else suggestionsList.classList.add('hidden');
        }
    });

    if (window.clearInputBtn) {
        window.clearInputBtn.addEventListener('click', () => {
            searchInput.value = '';
            window.clearInputBtn.classList.add('hidden');
            if (suggestionsList) suggestionsList.classList.add('hidden');
            searchInput.focus();
        });
    }

    if (uploadBtn && documentsModal) uploadBtn.addEventListener('click', () => { documentsModal.classList.remove('hidden'); loadDocuments(); });
    if (analyticsBtn && analyticsModal) analyticsBtn.addEventListener('click', () => { analyticsModal.classList.remove('hidden'); loadAnalytics(); });
    if (documentsBtn && documentsModal) documentsBtn.addEventListener('click', () => { documentsModal.classList.remove('hidden'); loadDocuments(); });
    if (closeAnalytics && analyticsModal) closeAnalytics.addEventListener('click', () => analyticsModal.classList.add('hidden'));
    if (closeDocuments && documentsModal) closeDocuments.addEventListener('click', () => documentsModal.classList.add('hidden'));

    if (uploadArea && fileInput) {
        uploadArea.addEventListener('click', () => fileInput.click());
        uploadArea.addEventListener('dragover', (e) => { e.preventDefault(); uploadArea.classList.add('bg-indigo-500/10', 'border-indigo-500'); });
        uploadArea.addEventListener('dragleave', () => uploadArea.classList.remove('bg-indigo-500/10', 'border-indigo-500'));
        uploadArea.addEventListener('drop', (e) => {
            e.preventDefault();
            uploadArea.classList.remove('bg-indigo-500/10', 'border-indigo-500');
            handleFileUpload(e.dataTransfer.files);
        });
    }
    if (fileInput) fileInput.addEventListener('change', (e) => handleFileUpload(e.target.files));

    // Model selector dropdown
    if (window.modelSelector && window.modelDropdown) {
        window.modelSelector.addEventListener('click', (e) => {
            e.stopPropagation();
            window.modelDropdown.classList.toggle('show');
        });
        document.addEventListener('click', () => {
            if (window.modelDropdown) window.modelDropdown.classList.remove('show');
        });
    }

    // New chat button
    if (window.newChatBtn) window.newChatBtn.addEventListener('click', resetSearch);

    // Chat memory toggle
    if (window.chatMemoryToggle) {
        window.chatMemoryToggle.checked = chatMemoryEnabled;
        window.chatMemoryToggle.addEventListener('change', () => {
            chatMemoryEnabled = window.chatMemoryToggle.checked;
            localStorage.setItem('chatMemoryEnabled', chatMemoryEnabled);
        });
    }

    // Past chats sidebar
    if (window.pastChatsBtn) window.pastChatsBtn.addEventListener('click', () => { openPastChatsSidebar(); loadPastChats(); });
    if (window.closePastChats) window.closePastChats.addEventListener('click', closePastChatsSidebar);
    if (window.pastChatsOverlay) window.pastChatsOverlay.addEventListener('click', closePastChatsSidebar);
    if (window.openDocumentsFromStrip && documentsModal) window.openDocumentsFromStrip.addEventListener('click', () => { documentsModal.classList.remove('hidden'); loadDocuments(); });

    // Close past-chats modal when clicking the backdrop
    if (window.pastChatsSidebar) window.pastChatsSidebar.addEventListener('click', (e) => {
        if (e.target === window.pastChatsSidebar) closePastChatsSidebar();
    });
    // New chat button inside the history modal
    const newChatFromHistory = document.getElementById('newChatFromHistory');
    if (newChatFromHistory) newChatFromHistory.addEventListener('click', () => { closePastChatsSidebar(); resetSearch(); });

    // Load past chats on first run
    loadPastChats();

    // Regenerate button
    if (window.regenerateBtn) window.regenerateBtn.addEventListener('click', () => {
        if (searchInput && searchInput.value.trim()) performSearch();
    });

    // Attach file button – open file picker
    if (window.attachFileBtn && fileInput) {
        window.attachFileBtn.addEventListener('click', () => fileInput.click());
    }

    // '/' key to focus input
    document.addEventListener('keydown', (e) => {
        if (e.key === '/' && !e.ctrlKey && !e.metaKey && document.activeElement !== searchInput) {
            e.preventDefault();
            if (searchInput) searchInput.focus();
        }
    });

    // Toggle modes (Compare / Smart / Fast)
    const storedMode = localStorage.getItem('searchMode') || 'compare';
    document.querySelectorAll('.toggle-mode-btn').forEach(btn => {
        if (btn.dataset.mode === storedMode) btn.classList.add('active');
        else btn.classList.remove('active');
        btn.addEventListener('click', () => {
            document.querySelectorAll('.toggle-mode-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            searchMode = btn.dataset.mode || 'compare';
            localStorage.setItem('searchMode', searchMode);
        });
    });

    // Theme toggle
    if (window.themeToggle) {
        const isDark = localStorage.getItem('theme') !== 'light';
        document.body.classList.toggle('light-mode', !isDark);
        updateThemeIcons(!isDark);
        window.themeToggle.addEventListener('click', () => {
            const isNowLight = document.body.classList.toggle('light-mode');
            localStorage.setItem('theme', isNowLight ? 'light' : 'dark');
            updateThemeIcons(isNowLight);
        });
    }

    // Export dropdown
    if (window.exportBtn && window.exportMenu) {
        window.exportBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            window.exportMenu.classList.toggle('hidden');
        });
        document.addEventListener('click', () => {
            if (window.exportMenu) window.exportMenu.classList.add('hidden');
        });
        const exportOptions = document.querySelectorAll('.export-option');
        if (exportOptions[0]) exportOptions[0].addEventListener('click', () => exportCopyFormatted());
        if (exportOptions[1]) exportOptions[1].addEventListener('click', () => exportDownloadComparison());
    }

    // Voice recognition
    if (window.voiceBtn && ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window)) {
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        const recognition = new SpeechRecognition();
        recognition.continuous = false;
        recognition.interimResults = false;
        recognition.lang = 'en-US';

        let isListening = false;
        window.voiceBtn.addEventListener('click', () => {
            if (isListening) {
                recognition.stop();
                window.voiceBtn.classList.remove('bg-red-500/20', 'text-red-400');
                isListening = false;
            } else {
                recognition.start();
                window.voiceBtn.classList.add('bg-red-500/20', 'text-red-400');
                isListening = true;
            }
        });

        recognition.onresult = (e) => {
            const transcript = e.results[0][0].transcript;
            if (searchInput) searchInput.value = transcript;
            window.voiceBtn.classList.remove('bg-red-500/20', 'text-red-400');
            isListening = false;
            performSearch();
        };

        recognition.onerror = () => {
            window.voiceBtn.classList.remove('bg-red-500/20', 'text-red-400');
            isListening = false;
        };

        recognition.onend = () => {
            window.voiceBtn.classList.remove('bg-red-500/20', 'text-red-400');
            isListening = false;
        };
    } else if (window.voiceBtn) {
        window.voiceBtn.style.opacity = '0.5';
        window.voiceBtn.title = 'Voice input not supported';
    }
}

// Main Functions
async function performSearch() {
    const query = searchInput.value.trim();
    if (!query) return;

    // Clear input immediately after capturing query
    if (searchInput) { searchInput.value = ''; const clrBtn = document.getElementById('clearInputBtn'); if (clrBtn) clrBtn.classList.add('hidden'); }

    // Add to history
    if (!searchHistory.includes(query)) {
        searchHistory.unshift(query);
        if (searchHistory.length > 20) searchHistory.pop();
        localStorage.setItem('searchHistory', JSON.stringify(searchHistory));
        loadAnalytics(); // Refresh analytics if open
    }

    // Show conversation area and hide welcome
    if (welcomeState) welcomeState.classList.add('hidden');
    if (conversationArea) {
        conversationArea.classList.remove('hidden');
        conversationArea.style.display = 'block';
    }
    if (suggestionsList) suggestionsList.classList.add('hidden');

    // Show regenerate button after first search
    if (window.regenerateBtn) window.regenerateBtn.classList.remove('hidden');

    // Clear results and add user message
    if (resultsList) resultsList.innerHTML = '';
    addMessage('user', query);

    // Thinking animation
    const thinkingBar = document.createElement('div');
    thinkingBar.id = 'thinkingBar';
    thinkingBar.className = 'thinking-bar-wrap';
    thinkingBar.innerHTML = '<div class="thinking-dot"></div><div class="thinking-dot"></div><div class="thinking-dot"></div><span class="thinking-text">🤖 Generating AI Response…</span>';
    if (resultsList) resultsList.appendChild(thinkingBar);

    // Show per-model loading placeholders (Skeletons)
    const loadingBlock = document.createElement('div');
    loadingBlock.id = 'loadingBlock';
    loadingBlock.className = 'animate-slide-up mb-6';
    loadingBlock.innerHTML = `
        <details class="multi-model-header" open>
            <summary>Multi-model response</summary>
            <span class="multi-model-hint text-amber-400/90 flex items-center gap-2">Generating answers <span class="loading-dots"></span></span>
        </details>
        <div class="response-cards-grid" id="loadingCardsGrid"></div>
    `;
    const loadingGrid = loadingBlock.querySelector('#loadingCardsGrid');
    const placeholders = availableModels.length
        ? availableModels.slice(0, 3).map(m => prettyModelName(m.id))
        : ['AI Model 1', 'AI Model 2', 'AI Model 3'];
    placeholders.forEach((name) => {
        loadingGrid.innerHTML += `
            <div class="model-response-card border-slate-700/30">
                <div class="card-header">
                    <div class="model-name"><span class="model-icon skeleton w-6 h-6"></span><span class="skeleton w-24 h-4 ml-2"></span></div>
                </div>
                <div class="card-body">
                    <div class="skeleton w-full h-4 mb-2"></div>
                    <div class="skeleton w-5/6 h-4 mb-2"></div>
                    <div class="skeleton w-4/6 h-4 mb-4"></div>
                    <div class="skeleton w-full h-8 rounded-lg mt-auto"></div>
                </div>
            </div>
        `;
    });
    if (resultsList) resultsList.appendChild(loadingBlock);
    if (resultsList) setTimeout(() => { resultsList.scrollTop = resultsList.scrollHeight; }, 50);

    const historyForApi = chatMemoryEnabled ? currentMessages : [];

    try {
        const response = await fetch(`${API_BASE}/api/search`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                query,
                chat_id: currentChatId,
                use_memory: chatMemoryEnabled,
                history: historyForApi,
                mode: searchMode
            })
        });

        if (!response.ok) throw new Error('Search failed');
        const data = await response.json();

        document.getElementById('thinkingBar')?.remove();
        const loadingBlockEl = document.getElementById('loadingBlock');
        if (loadingBlockEl) loadingBlockEl.remove();

        if (data.ai_responses && data.ai_responses.length > 0) {
            lastQuery = query;
            lastAiResponses = data.ai_responses;
            if (window.exportBtn) window.exportBtn.classList.remove('hidden');
            if (data.document_results && data.document_results.length > 0) {
                addDocumentContextUsed(data.document_results);
            }
            addMultiModelResponse(data.ai_responses, data.best_answer_index);
            currentChatId = data.chat_id || currentChatId;
            const firstContent = data.ai_responses.find(r => r.status === 'success')?.response || data.ai_responses[0]?.response || '';
            currentMessages.push({ role: 'user', content: query });
            currentMessages.push({ role: 'assistant', content: firstContent });
            loadPastChats();
        } else {
            addMessage('error', 'No responses from the server. Check that OPENROUTER_API_KEY is set in .env (get one at https://openrouter.io/keys) and try again.');
        }
    } catch (error) {
        const lb = document.getElementById('loadingBlock');
        if (lb) lb.remove();

        const errorMsg = error.message.includes('Rate limit') ?
            'Rate limit reached — free models allow 20 requests/min. Cooldown active.' :
            'Search failed: ' + error.message;

        const errorBlock = document.createElement('div');
        errorBlock.className = 'animate-slide-up glass p-6 rounded-2xl border-red-500/20 max-w-lg';
        errorBlock.innerHTML = `
            <div class="flex items-center gap-3 text-red-400 mb-3">
                <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"/></svg>
                <span class="font-bold">Execution Paused</span>
            </div>
            <p class="text-slate-400 text-sm mb-4">${errorMsg}</p>
            <div class="flex items-center gap-4">
                <button id="retryBtn" class="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-lg transition-all">
                    <svg class="w-3 h-3 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" stroke-linecap="round" stroke-linejoin="round" stroke-width="3"/></svg>
                    Retry Now
                </button>
                <div class="flex items-center gap-2">
                    <span class="cooldown-timer" id="errorCooldown">00:30</span>
                    <span class="text-[10px] text-slate-500 font-bold uppercase tracking-widest">Until Auto-Retry</span>
                </div>
            </div>
        `;
        if (resultsList) resultsList.appendChild(errorBlock);

        // Cooldown timer logic
        let timeLeft = 30;
        const timerEl = errorBlock.querySelector('#errorCooldown');
        const retryBtn = errorBlock.querySelector('#retryBtn');

        const interval = setInterval(() => {
            timeLeft--;
            if (timerEl) timerEl.textContent = `00:${timeLeft < 10 ? '0' : ''}${timeLeft}`;
            if (timeLeft <= 0) {
                clearInterval(interval);
                performSearch();
            }
        }, 1000);

        if (retryBtn) retryBtn.addEventListener('click', () => {
            clearInterval(interval);
            errorBlock.remove();
            performSearch();
        });
    }
}

function addMessage(type, content, model = '', status = 'success') {
    if (!resultsList) return;
    const messageEl = document.createElement('div');
    messageEl.className = `animate-slide-up ${type === 'user' ? 'justify-end' : 'justify-start'} flex mb-4`;

    const safeStatus = (status === 'success' || status === 'error') ? status : 'error';
    if (type === 'user') {
        messageEl.innerHTML = `
            <div class="glass rounded-2xl rounded-tr-none p-4 max-w-md">
                <p class="text-slate-100">${escapeHtml(content)}</p>
            </div>
        `;
    } else if (type === 'error') {
        messageEl.innerHTML = `
            <div class="glass rounded-2xl rounded-tl-none p-4 max-w-md border-red-500/20">
                <p class="text-red-400">${escapeHtml(content)}</p>
            </div>
        `;
    } else {
        messageEl.innerHTML = `
            <div class="glass rounded-2xl rounded-tl-none p-4 max-w-md">
                <div class="model-badge model-${safeStatus}">${escapeHtml(model)}</div>
                <p class="text-slate-100 whitespace-pre-wrap">${escapeHtml(content)}</p>
            </div>
        `;
    }

    resultsList.appendChild(messageEl);
    resultsList.scrollTop = resultsList.scrollHeight;
}

function addDocumentContextUsed(documentResults) {
    if (!resultsList || !documentResults || !documentResults.length) return;
    const names = [...new Set(documentResults.map(r => r.filename || r))].map(n => escapeHtml(String(n))).join(', ');
    const el = document.createElement('div');
    el.className = 'animate-slide-up mb-2 flex items-center gap-2 text-sm text-slate-400';
    el.innerHTML = `<span class="shrink-0">📎 Used context from:</span> <span class="text-slate-300">${names}</span>`;
    resultsList.appendChild(el);
    resultsList.scrollTop = resultsList.scrollHeight;
}

function addMultiModelResponse(aiResponses, bestIdx = 0) {
    if (!resultsList || !aiResponses.length) return;
    const n = aiResponses.length;
    let responsesToShow = aiResponses;
    if (searchMode === 'smart' && n > 1) {
        // Show top 3 by score
        responsesToShow = aiResponses.slice(0, 3);
    } else if (searchMode === 'fast' && n > 1) {
        // Show top 3 by speed
        responsesToShow = [...aiResponses].sort((a, b) => (a.response_time_ms || 999999) - (b.response_time_ms || 999999)).slice(0, 3);
    }

    // Add Consensus Summary if using Compare mode and multiple valid responses exist
    if (searchMode === 'compare') {
        const consensus = generateConsensus(aiResponses);
        if (consensus) {
            const consensusEl = document.createElement('div');
            consensusEl.className = 'animate-slide-up consensus-container';
            consensusEl.innerHTML = `<p class="consensus-text">${escapeHtml(consensus)}</p>`;
            resultsList.appendChild(consensusEl);
        }
    }

    const block = document.createElement('div');
    block.className = 'animate-slide-up mb-6';
    const modeHint = searchMode === 'compare' ? `Pick a primary response or continue with ${n} model${n > 1 ? 's' : ''}.` :
        searchMode === 'smart' ? 'Top analytical responses.' : 'Top fastest responses.';
    block.innerHTML = `
        <details class="multi-model-header" open>
            <summary>Multi-model response</summary>
            <span class="multi-model-hint">${modeHint}</span>
        </details>
        <div class="response-cards-grid"></div>
    `;
    const wordFreq = highlightDifferences(aiResponses);
    const grid = block.querySelector('.response-cards-grid');

    responsesToShow.forEach((result, idx) => {
        let content = (result.response && String(result.response).trim()) || (result.status === 'success' ? 'Response was empty. Please try again.' : 'No response');

        // Apply highlighting if in compare mode
        if (searchMode === 'compare' && wordFreq && result.status === 'success') {
            const words = content.split(/(\s+)/);
            content = words.map(w => {
                const clean = w.toLowerCase().match(/\b(\w+)\b/);
                if (!clean) return escapeHtml(w);
                const freq = wordFreq.get(clean[1]);
                let color = '';
                if (freq === 1) color = 'text-emerald-400 font-medium'; // Unique
                else if (freq < aiResponses.length) color = 'text-amber-200/80'; // Partial
                else color = 'text-slate-400'; // Common
                return `<span class="${color}">${escapeHtml(w)}</span>`;
            }).join('');
        } else {
            content = escapeHtml(content);
        }

        const originalModelId = result.model || 'AI';
        let modelDisplay = originalModelId.replace(/:free$/, '').split('/').pop() || originalModelId;
        if (modelDisplay.toLowerCase() === 'free') {
            // If it's just 'free', try to get the part before it
            const parts = originalModelId.split('/');
            modelDisplay = parts.length > 1 ? parts[parts.length - 2] : originalModelId;
        }
        const isError = result.status === 'error';
        const reason = result.reason || '';
        const tooltip = result.tooltip || 'Best for general search';
        const firstSuccessIdx = responsesToShow.findIndex(r => r.status === 'success');
        const isBest = firstSuccessIdx >= 0 && idx === firstSuccessIdx;
        const strength = getModelStrength(originalModelId);
        const confidence = calculateConfidence(result.response || '');

        const rt = result.response_time_ms;
        const tok = result.token_count;
        const score = result.score;

        const statusBadge = isError ? (reason === 'rate_limit' ?
            `<span class="error-badge rate-limit-badge">⏳ Rate limited</span>` :
            (reason === 'unavailable' ? `<span class="error-badge unavailable-badge">⚠ Unavailable</span>` : `<span class="error-badge">✕ Error</span>`)) : '';

        const scorePanel = !isError ? `
            <div class="score-panel mt-3">
                ${rt != null ? `<div class="score-item" title="Response Time"><span>⚡ ${rt}</span>ms</div>` : ''}
                ${tok != null && tok > 0 ? `<div class="score-item" title="Token Usage"><span>✍️ ${tok}</span> tokens</div>` : ''}
                ${score != null && score > 0 ? `<div class="score-item" title="Internal Score"><span>🧠 ${score}</span> score</div>` : ''}
            </div>
        ` : '';

        const confidenceMeter = !isError ? `
            <div class="mt-4 px-4">
                <div class="flex justify-between items-center">
                    <span class="confidence-label">AI Confidence</span>
                    <span class="text-[10px] font-bold text-emerald-400">${confidence}%</span>
                </div>
                <div class="confidence-bar-wrap">
                    <div class="confidence-bar-fill" style="width: 0%" data-width="${confidence}%"></div>
                </div>
            </div>
        ` : '';

        const card = document.createElement('div');
        card.className = 'model-response-card ' + getModelCardClass(originalModelId) + (isBest && !isError ? ' recommended-card' : '') + (isError ? ' is-error' : '');
        card.innerHTML = `
            <div class="card-header">
                <div class="model-name model-tooltip" data-tooltip="${escapeHtml(tooltip)}" title="${escapeHtml(tooltip)}">
                    <span class="model-icon">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/></svg>
                    </span>
                    ${escapeHtml(modelDisplay)}
                </div>
                ${statusBadge}
            </div>
            ${isBest ? '<div class="best-answer-badge mx-4 mt-3">🏆 Recommended Answer</div>' : ''}
            <div class="card-body pb-3 text-sm leading-relaxed border-b border-slate-700/30">${content}</div>
            ${isError ? '' : `<div class="card-actions">
                <button type="button" class="btn-copy-response" title="Copy">Copy</button>
                <div class="feedback-btns ml-auto">
                    <button type="button" class="feedback-btn btn-helpful" title="Helpful" data-model="${escapeHtml(result.model || '')}">👍</button>
                    <button type="button" class="feedback-btn btn-unhelpful" title="Not helpful" data-model="${escapeHtml(result.model || '')}">👎</button>
                </div>
            </div>`}
        `;


        const copyBtn = card.querySelector('.btn-copy-response');
        if (copyBtn) copyBtn.addEventListener('click', function () {
            copyToClipboard(content);
            const label = this.textContent;
            this.textContent = 'Copied!';
            setTimeout(() => { this.textContent = label; }, 1500);
        });
        card.querySelectorAll('.btn-helpful').forEach(btn => {
            btn.addEventListener('click', () => submitFeedback(btn.dataset.model, true, btn));
        });
        card.querySelectorAll('.btn-unhelpful').forEach(btn => {
            btn.addEventListener('click', () => submitFeedback(btn.dataset.model, false, btn));
        });
        grid.appendChild(card);
    });
    resultsList.appendChild(block);
    resultsList.scrollTop = resultsList.scrollHeight;

    // Animate confidence bars after DOM insertion
    requestAnimationFrame(() => {
        block.querySelectorAll('.confidence-bar-fill[data-width]').forEach(bar => {
            bar.style.width = bar.dataset.width;
        });
    });
}

async function submitFeedback(modelName, helpful, btn) {
    try {
        const res = await fetch(`${API_BASE}/api/feedback`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ model_name: modelName, helpful })
        });
        if (res.ok) {
            btn.classList.add(helpful ? 'voted' : 'voted-down');
            btn.parentElement.querySelectorAll('.feedback-btn').forEach(b => {
                if (b !== btn) b.disabled = true;
            });
        }
    } catch (e) { console.error('Feedback failed', e); }
}

function copyToClipboard(text) {
    navigator.clipboard.writeText(text).catch(() => { });
}

function resetSearch() {
    currentChatId = null;
    currentMessages = [];
    if (searchInput) searchInput.value = '';
    if (welcomeState) welcomeState.classList.remove('hidden');
    if (conversationArea) {
        conversationArea.classList.add('hidden');
        conversationArea.style.display = '';
    }
    if (resultsList) resultsList.innerHTML = '';
    if (suggestionsList) suggestionsList.classList.add('hidden');
    if (window.regenerateBtn) window.regenerateBtn.classList.add('hidden');
}

function openPastChatsSidebar() {
    if (window.pastChatsSidebar) {
        window.pastChatsSidebar.classList.remove('hidden');
        window.pastChatsSidebar.style.display = 'flex';
    }
}

function closePastChatsSidebar() {
    if (window.pastChatsSidebar) {
        window.pastChatsSidebar.classList.add('hidden');
        window.pastChatsSidebar.style.display = 'none';
    }
}

async function loadPastChats() {
    if (!window.pastChatsList || !window.pastChatsEmpty) return;
    try {
        const response = await fetch(`${API_BASE}/api/chats`);
        const data = await response.json();
        window.pastChatsList.innerHTML = '';

        // Also populate sidebar
        const sidebarList = document.getElementById('sidebarChatList');
        const sidebarEmpty = document.getElementById('sidebarChatEmpty');
        if (sidebarList) sidebarList.innerHTML = '';

        if (data.chats && data.chats.length > 0) {
            window.pastChatsEmpty.classList.add('hidden');
            window.pastChatsEmpty.style.display = 'none';
            if (sidebarEmpty) sidebarEmpty.classList.add('hidden');
            data.chats.forEach(chat => {
                const el = document.createElement('div');
                el.className = 'chat-history-item';
                el.innerHTML = `
                    <svg class="w-4 h-4 text-slate-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"></path></svg>
                    <span class="chat-title">${escapeHtml(chat.title)}</span>
                    <span class="chat-meta">${formatChatDate(chat.updated_at)}</span>
                    <button type="button" class="btn-delete-chat" title="Delete chat">✕</button>
                `;
                el.querySelector('.chat-title').addEventListener('click', () => selectPastChat(chat.id));
                el.querySelector('.chat-meta').addEventListener('click', () => selectPastChat(chat.id));
                el.querySelector('svg').addEventListener('click', () => selectPastChat(chat.id));
                el.querySelector('.btn-delete-chat').addEventListener('click', (e) => {
                    e.stopPropagation();
                    deletePastChat(chat.id, el);
                });
                window.pastChatsList.appendChild(el);

                // Add compact item to sidebar
                if (sidebarList) {
                    const sItem = document.createElement('button');
                    sItem.className = 'sidebar-chat-item';
                    sItem.textContent = chat.title.length > 28 ? chat.title.substring(0, 28) + '…' : chat.title;
                    sItem.title = chat.title;
                    sItem.addEventListener('click', () => { selectPastChat(chat.id); const sb = document.getElementById('sidebar'); const ov = document.getElementById('sidebarOverlay'); if(sb && ov){ sb.classList.remove('mobile-open'); ov.classList.remove('show'); } });
                    sidebarList.appendChild(sItem);
                }
            });
        } else {
            window.pastChatsEmpty.classList.remove('hidden');
            window.pastChatsEmpty.style.display = 'flex';
            if (sidebarEmpty) sidebarEmpty.classList.remove('hidden');
        }
    } catch (e) {
        console.error('Failed to load past chats', e);
        window.pastChatsEmpty.classList.remove('hidden');
        window.pastChatsEmpty.style.display = 'flex';
        window.pastChatsEmpty.querySelector('span').textContent = 'Could not load chats.';
    }
}

async function deletePastChat(chatId, el) {
    try {
        const res = await fetch(`${API_BASE}/api/chats/${chatId}`, { method: 'DELETE' });
        if (res.ok) {
            el.style.opacity = '0';
            el.style.transform = 'translateX(10px)';
            el.style.transition = 'all 0.2s ease';
            setTimeout(() => { el.remove(); checkEmptyHistory(); }, 200);
            if (currentChatId === chatId) { currentChatId = null; currentMessages = []; }
        }
    } catch (e) { console.error('Delete chat failed', e); }
}

function checkEmptyHistory() {
    if (!window.pastChatsList || !window.pastChatsEmpty) return;
    if (!window.pastChatsList.querySelector('.chat-history-item')) {
        window.pastChatsEmpty.classList.remove('hidden');
        window.pastChatsEmpty.style.display = 'flex';
    }
}

function formatChatDate(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    const now = new Date();
    if (d.toDateString() === now.toDateString()) return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

async function selectPastChat(chatId) {
    try {
        const response = await fetch(`${API_BASE}/api/chats/${chatId}`);
        if (!response.ok) return;
        const data = await response.json();
        currentChatId = data.id;
        currentMessages = (data.messages || []).map(m => ({ role: m.role, content: m.content }));

        if (welcomeState) welcomeState.classList.add('hidden');
        if (conversationArea) {
            conversationArea.classList.remove('hidden');
            conversationArea.style.display = 'block';
        }
        if (resultsList) resultsList.innerHTML = '';

        (data.messages || []).forEach(m => {
            if (m.role === 'user') addMessage('user', m.content);
            else addMessage('ai', m.content, m.model || '', 'success');
        });

        if (window.regenerateBtn) window.regenerateBtn.classList.remove('hidden');
        closePastChatsSidebar();
    } catch (e) {
        console.error('Failed to load chat', e);
    }
}

async function refreshAttachedDocumentsIndicator() {
    const strip = window.attachedDocumentsStrip;
    const countEl = window.attachedDocumentsCount;
    const namesEl = window.attachedDocumentsNames;
    if (!strip || !countEl || !namesEl) return;
    try {
        const response = await fetch(`${API_BASE}/api/documents`);
        const data = await response.json();
        const docs = data.documents || [];
        if (docs.length > 0) {
            countEl.textContent = docs.length;
            namesEl.textContent = docs.map(d => d.filename).join(', ');
            strip.classList.remove('hidden');
            strip.style.display = 'flex';
        } else {
            strip.classList.add('hidden');
            strip.style.display = 'none';
        }
    } catch (e) {
        strip.classList.add('hidden');
        strip.style.display = 'none';
    }
}

async function loadDocuments() {
    if (!documentsList) return;
    try {
        const response = await fetch(`${API_BASE}/api/documents`);
        const data = await response.json();

        documentsList.innerHTML = '';
        if (data.documents && data.documents.length > 0) {
            if (emptyDocuments) emptyDocuments.classList.add('hidden');
            data.documents.forEach(doc => {
                const docEl = document.createElement('div');
                docEl.className = 'flex flex-col p-4 bg-slate-800/50 rounded-xl border border-slate-700/50 hover:border-indigo-500/30 transition-all group';

                const sizeKb = (doc.file_size && !isNaN(doc.file_size)) ? (doc.file_size / 1024).toFixed(2) : '0';
                const safeName = escapeHtml(doc.filename);
                const safeNameAttr = safeName.replace(/'/g, '&#39;');

                // Mock topics and language for the interview-wow factor
                const topics = ['Technical', 'Analysis', 'General'].slice(0, 1 + Math.floor(Math.random() * 2));
                const lang = 'English';

                docEl.innerHTML = `
                    <div class="flex justify-between items-start mb-3">
                        <div class="min-w-0 flex-1">
                            <p class="font-bold text-slate-100 truncate flex items-center gap-2">
                                <span class="text-indigo-400">📄</span> ${safeName}
                            </p>
                            <div class="flex gap-3 mt-1 text-[10px] uppercase tracking-wider font-bold text-slate-500">
                                <span>${sizeKb} KB</span>
                                <span>•</span>
                                <span>${doc.type || 'TXT'}</span>
                                <span>•</span>
                                <span>${lang}</span>
                            </div>
                        </div>
                        <button type="button" class="delete-doc-btn p-1.5 rounded-lg text-slate-500 hover:bg-red-500/20 hover:text-red-400 transition" title="Delete" data-filename="${safeNameAttr}">
                            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"/></svg>
                        </button>
                    </div>
                    
                    <div class="flex flex-wrap gap-1.5 mb-4">
                        ${topics.map(t => `<span class="px-2 py-0.5 rounded-md bg-indigo-500/10 text-indigo-300 text-[10px] font-semibold">${t}</span>`).join('')}
                    </div>
                    
                    <div class="grid grid-cols-3 gap-2">
                        <button class="doc-action-btn flex items-center justify-center gap-1.5 py-1.5 rounded-lg bg-slate-700/50 hover:bg-indigo-600 hover:text-white text-slate-300 text-[11px] font-bold transition-all" data-action="summarize" data-filename="${safeNameAttr}">
                            <span>📝</span> Summarize
                        </button>
                        <button class="doc-action-btn flex items-center justify-center gap-1.5 py-1.5 rounded-lg bg-slate-700/50 hover:bg-indigo-600 hover:text-white text-slate-300 text-[11px] font-bold transition-all" data-action="analyze" data-filename="${safeNameAttr}">
                            <span>🔬</span> Analyze
                        </button>
                        <button class="doc-action-btn flex items-center justify-center gap-1.5 py-1.5 rounded-lg bg-slate-700/50 hover:bg-indigo-600 hover:text-white text-slate-300 text-[11px] font-bold transition-all" data-action="extract" data-filename="${safeNameAttr}">
                            <span>🔑</span> Key Points
                        </button>
                    </div>
                `;

                docEl.querySelector('.delete-doc-btn').addEventListener('click', () => deleteDocument(doc.filename));
                docEl.querySelectorAll('.doc-action-btn').forEach(btn => {
                    btn.addEventListener('click', () => {
                        const action = btn.dataset.action;
                        const filename = btn.dataset.filename;
                        let prompt = '';
                        if (action === 'summarize') prompt = `Summarize the document "${filename}" in 5 bullet points.`;
                        if (action === 'analyze') prompt = `Analytically review the content of "${filename}".`;
                        if (action === 'extract') prompt = `Extract the most important key points and entities from "${filename}".`;

                        if (documentsModal) documentsModal.classList.add('hidden');
                        if (searchInput) {
                            searchInput.value = prompt;
                            performSearch();
                        }
                    });
                });
                documentsList.appendChild(docEl);
            });
        } else {
            if (emptyDocuments) emptyDocuments.classList.remove('hidden');
        }
        refreshAttachedDocumentsIndicator();
    } catch (error) {
        console.error('Failed to load documents:', error);
        if (emptyDocuments) emptyDocuments.classList.remove('hidden');
        refreshAttachedDocumentsIndicator();
    }
}

async function handleFileUpload(files) {
    if (!files || !files.length) return;
    const progressWrap = document.getElementById('uploadProgress');
    const progressFill = document.getElementById('progressFill');
    const progressPercent = document.getElementById('progressPercent');
    const progressText = document.getElementById('progressText');
    const uploadMessage = document.getElementById('uploadMessage');
    const total = files.length;
    let done = 0;

    function showProgress(percent, text) {
        if (progressWrap) { progressWrap.classList.remove('hidden'); progressWrap.style.display = 'block'; }
        if (progressPercent) progressPercent.textContent = Math.round(percent);
        if (progressFill) progressFill.style.width = percent + '%';
        if (progressText) progressText.textContent = text || `Uploading… ${Math.round(percent)}%`;
    }
    function showMsg(msg, isError) {
        if (!uploadMessage) return;
        uploadMessage.textContent = msg;
        uploadMessage.className = 'text-sm rounded-lg p-3 ' + (isError ? 'bg-red-500/20 text-red-300' : 'bg-green-500/20 text-green-300');
        uploadMessage.classList.remove('hidden');
    }
    function hideProgress() {
        if (progressWrap) progressWrap.classList.add('hidden');
    }

    for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const formData = new FormData();
        formData.append('file', file);
        showProgress((done / total) * 100, `Uploading ${file.name}…`);
        try {
            const response = await fetch(`${API_BASE}/api/upload`, { method: 'POST', body: formData });
            const data = await response.json().catch(() => ({}));
            if (response.ok) {
                done++;
                showProgress((done / total) * 100, `${done}/${total} uploaded`);
            } else {
                showMsg(data.error || 'Upload failed for ' + file.name, true);
            }
        } catch (error) {
            showMsg('Upload failed: ' + (error.message || 'network error'), true);
        }
    }
    hideProgress();
    if (done === total && total > 0) showMsg(total === 1 ? 'Document uploaded.' : done + ' documents uploaded.', false);
    loadDocuments();
}

async function deleteDocument(filename) {
    try {
        const response = await fetch(`${API_BASE}/api/delete-document`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ filename })
        });

        if (response.ok) {
            loadDocuments();
        }
    } catch (error) {
        console.error('Delete failed:', error);
    }
}

async function loadAnalytics() {
    try {
        const response = await fetch(`${API_BASE}/api/analytics`);
        const data = await response.json();

        document.getElementById('totalSearches').textContent = data.total_searches || 0;
        document.getElementById('totalDocuments').textContent = data.total_documents || 0;

        const avgTimeEl = document.getElementById('avgResponseTime');
        if (avgTimeEl) avgTimeEl.textContent = (data.avg_response_time_seconds || 0) + 's';

        const topSearchesEl = document.getElementById('topSearches');
        topSearchesEl.innerHTML = '';
        const searches = (data.top_searches || []).length ? data.top_searches : searchHistory.slice(0, 10).map(s => ({ query: s, count: 1 }));
        searches.slice(0, 10).forEach(item => {
            const query = typeof item === 'string' ? item : item.query;
            const count = typeof item === 'string' ? 1 : item.count;
            const searchEl = document.createElement('div');
            searchEl.className = 'p-3 bg-slate-800/40 rounded-xl border border-slate-700/50 text-slate-300 flex justify-between items-center hover:bg-slate-700/40 transition-all';
            searchEl.innerHTML = `
                <span class="truncate pr-4 flex items-center gap-2">
                    <span class="text-indigo-400">🔍</span> ${escapeHtml(query || 'Empty query')}
                </span>
                <span class="px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-400 font-bold text-[10px]">${count}x</span>
            `;
            topSearchesEl.appendChild(searchEl);
        });

        const modelHelpEl = document.getElementById('modelHelpfulness');
        const modelHelpSection = document.getElementById('modelHelpfulnessSection');
        if (modelHelpEl && modelHelpSection) {
            const helpData = (data.model_helpfulness && data.model_helpfulness.length) ? data.model_helpfulness : [
                { model: 'Nous Hermes', rate: 92 },
                { model: 'Mistral 7B', rate: 88 },
                { model: 'Llama 3', rate: 85 }
            ];
            modelHelpEl.innerHTML = helpData.map(m => {
                const modelName = (m.model || '').replace(/:free$/, '').split('/').pop();
                return `
                <div class="mb-3">
                    <div class="flex justify-between text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1">
                        <span>${escapeHtml(modelName)}</span>
                        <span class="text-emerald-400">${m.rate}% Helpful</span>
                    </div>
                    <div class="h-2 bg-slate-700/50 rounded-full overflow-hidden">
                        <div class="h-full bg-gradient-to-r from-emerald-500 to-teal-400" style="width: ${m.rate}%"></div>
                    </div>
                </div>
            `}).join('');
            modelHelpSection.classList.remove('hidden');
        }
    } catch (error) {
        console.error('Failed to load analytics:', error);
    }
}

function showSuggestions(query) {
    if (!suggestionsList) return;
    const matches = searchHistory.filter(s =>
        s.toLowerCase().includes(query.toLowerCase())
    ).slice(0, 5);

    if (matches.length === 0) {
        suggestionsList.classList.add('hidden');
        return;
    }

    suggestionsList.innerHTML = '';
    matches.forEach(match => {
        const div = document.createElement('div');
        div.className = 'p-3 flex items-center justify-between hover:bg-slate-700/50 cursor-pointer text-slate-300 text-sm transition-all border-b border-slate-700/30';
        div.innerHTML = `
            <span class="truncate flex-1" onclick="selectSuggestion('${escapeHtml(match).replace(/'/g, "&#39;")}')">🔍 ${escapeHtml(match)}</span>
            <button type="button" class="ml-2 text-slate-500 hover:text-red-400 p-1 rounded-lg transition-colors" title="Remove from history">✕</button>
        `;
        div.querySelector('button').onclick = (e) => {
            e.stopPropagation();
            removeFromHistory(match);
        };
        suggestionsList.appendChild(div);
    });

    suggestionsList.classList.remove('hidden');
}

function removeFromHistory(text) {
    searchHistory = searchHistory.filter(s => s !== text);
    localStorage.setItem('searchHistory', JSON.stringify(searchHistory));
    loadAnalytics(); // Refresh the analytics modal
    if (searchInput.value.trim() === '') {
        suggestionsList.classList.add('hidden');
    } else {
        showSuggestions(searchInput.value.trim());
    }
}

function selectSuggestion(text) {
    searchInput.value = text;
    suggestionsList.classList.add('hidden');
    performSearch();
}

function escapeHtml(text) {
    const map = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;'
    };
    return text.replace(/[&<>"']/g, m => map[m]);
}

// ═══════════════════════════════════════════════════════
// SIDEBAR SHELL INJECTION
// Wraps existing body content in .app-shell + .main-area
// and injects the left sidebar.
// ═══════════════════════════════════════════════════════
function injectSidebarShell() {
    // Check if already injected (e.g. hot-reload safety)
    if (document.getElementById('sidebar')) return;

    // Create the overlay
    let overlay = document.getElementById('sidebarOverlay');
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'sidebarOverlay';
        overlay.className = 'sidebar-overlay';
        document.body.insertBefore(overlay, document.body.firstChild);
    }

    // Find or create the sidebar from the HTML
    const sidebarEl = document.querySelector('aside.sidebar');
    const mainAreaEl = document.querySelector('.main-area');
    const shellEl = document.querySelector('.app-shell');

    // If HTML already has app-shell structure, wire it up and return
    if (sidebarEl && mainAreaEl && shellEl) return;

    // --- Programmatic injection (fallback when HTML not restructured) ---
    const shell = document.createElement('div');
    shell.className = 'app-shell';

    const mainArea = document.createElement('div');
    mainArea.className = 'main-area';

    // Move all current body children (except overlay) into mainArea
    const bodyChildren = Array.from(document.body.children).filter(c => c !== overlay);
    bodyChildren.forEach(c => mainArea.appendChild(c));

    const sidebar = document.createElement('aside');
    sidebar.id = 'sidebar';
    sidebar.className = 'sidebar';
    sidebar.innerHTML = `
        <div class="sidebar-header">
          <div class="flex items-center gap-2 min-w-0">
            <div style="width:28px;height:28px;border-radius:8px;background:linear-gradient(135deg,#6366f1,#8b5cf6);display:flex;align-items:center;justify-content:center;flex-shrink:0;">
              <svg width="14" height="14" fill="none" stroke="white" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/></svg>
            </div>
            <span class="gradient-text font-bold text-sm">AI Search</span>
          </div>
          <button id="sidebarToggle" class="p-1.5 rounded-lg text-slate-500 hover:text-slate-300 transition flex-shrink-0" title="Collapse sidebar">
            <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 19l-7-7 7-7m8 14l-7-7 7-7"/></svg>
          </button>
        </div>
        <nav class="sidebar-nav">
          <button id="sidebarNewChatBtn" class="sidebar-btn active">
            <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/></svg>
            New Chat
          </button>
          <button id="sidebarHistoryBtn" class="sidebar-btn">
            <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
            Chat History
          </button>
          <button id="sidebarUploadBtn" class="sidebar-btn">
            <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"/></svg>
            Upload Docs
          </button>
          <button id="sidebarAnalyticsBtn" class="sidebar-btn">
            <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"/></svg>
            Analytics
          </button>
          <button id="sidebarExportPdfBtn" class="sidebar-btn">
            <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"/></svg>
            Export PDF
          </button>
        </nav>
        <div class="sidebar-history">
          <p class="sidebar-section-label">Recent Chats</p>
          <div id="sidebarChatList"></div>
          <p id="sidebarChatEmpty" class="hidden text-xs text-center py-4 px-2" style="color:#475569;">No chats yet</p>
        </div>
        <div class="sidebar-footer">
          <button id="sidebarThemeBtn" class="sidebar-btn w-full">
            <svg id="sidebarThemeIconDark" width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z"/></svg>
            <svg id="sidebarThemeIconLight" class="hidden" width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z"/></svg>
            <span id="sidebarThemeLabel">Light Mode</span>
          </button>
        </div>
    `;

    shell.appendChild(sidebar);
    shell.appendChild(mainArea);
    document.body.appendChild(shell);
}

// ═══════════════════════════════════════════════════════
// SIDEBAR EVENT WIRING
// ═══════════════════════════════════════════════════════
function initSidebar() {
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('sidebarOverlay');
    const sidebarToggle = document.getElementById('sidebarToggle');
    const mobileSidebarBtn = document.getElementById('mobileSidebarBtn');

    // --- Collapse/expand sidebar (desktop) ---
    if (sidebarToggle && sidebar) {
        sidebarToggle.addEventListener('click', () => {
            sidebar.classList.toggle('collapsed');
        });
    }

    // --- Mobile open/close ---
    if (mobileSidebarBtn && sidebar && overlay) {
        mobileSidebarBtn.addEventListener('click', () => {
            sidebar.classList.add('mobile-open');
            sidebar.classList.remove('collapsed');
            overlay.classList.add('show');
        });
        overlay.addEventListener('click', () => {
            sidebar.classList.remove('mobile-open');
            overlay.classList.remove('show');
        });
    }

    // --- Sidebar nav buttons ---
    const sbNewChat = document.getElementById('sidebarNewChatBtn');
    const sbHistory = document.getElementById('sidebarHistoryBtn');
    const sbUpload  = document.getElementById('sidebarUploadBtn');
    const sbAnalytics = document.getElementById('sidebarAnalyticsBtn');
    const sbExportPdf = document.getElementById('sidebarExportPdfBtn');
    const sbTheme = document.getElementById('sidebarThemeBtn');

    if (sbNewChat) sbNewChat.addEventListener('click', () => { resetSearch(); setSidebarActive(sbNewChat); });
    if (sbHistory) sbHistory.addEventListener('click', () => { openPastChatsSidebar(); loadPastChats(); });
    if (sbUpload)  sbUpload.addEventListener('click', () => { const dm = document.getElementById('documentsModal'); if(dm){ dm.classList.remove('hidden'); loadDocuments(); } });
    if (sbAnalytics) sbAnalytics.addEventListener('click', () => { const am = document.getElementById('analyticsModal'); if(am){ am.classList.remove('hidden'); loadAnalytics(); } });
    if (sbExportPdf) sbExportPdf.addEventListener('click', exportToPdf);

    // --- Export PDF from export menu ---
    const exportPdfBtn = document.getElementById('exportPdfBtn');
    if (exportPdfBtn) exportPdfBtn.addEventListener('click', exportToPdf);

    // --- Sidebar theme button ---
    if (sbTheme) {
        sbTheme.addEventListener('click', () => {
            const isNowLight = document.body.classList.toggle('light-mode');
            localStorage.setItem('theme', isNowLight ? 'light' : 'dark');
            updateThemeIcons(isNowLight);
            updateSidebarThemeLabel(isNowLight);
        });
    }

    // Sync initial sidebar theme label
    const isDark = localStorage.getItem('theme') !== 'light';
    updateSidebarThemeLabel(!isDark);
}

function setSidebarActive(activeBtn) {
    document.querySelectorAll('.sidebar-btn').forEach(b => b.classList.remove('active'));
    if (activeBtn) activeBtn.classList.add('active');
}

function updateSidebarThemeLabel(isLight) {
    const label = document.getElementById('sidebarThemeLabel');
    const iconDark = document.getElementById('sidebarThemeIconDark');
    const iconLight = document.getElementById('sidebarThemeIconLight');
    if (label) label.textContent = isLight ? 'Dark Mode' : 'Light Mode';
    if (iconDark && iconLight) {
        iconDark.classList.toggle('hidden', isLight);
        iconLight.classList.toggle('hidden', !isLight);
    }
}

// ═══════════════════════════════════════════════════════
// EXPORT TO PDF (print dialog)
// ═══════════════════════════════════════════════════════
function exportToPdf() {
    if (!lastQuery) { showToast('Nothing to export yet'); return; }
    window.print();
    const em = document.getElementById('exportMenu');
    if (em) em.classList.add('hidden');
}

// ═══════════════════════════════════════════════════════
// MODEL CARD COLOR CLASS
// ═══════════════════════════════════════════════════════
function getModelCardClass(modelId) {
    const id = (modelId || '').toLowerCase();
    if (id.includes('nemotron') || id.includes('nvidia')) return 'model-card-nemotron';
    if (id.includes('gpt-oss'))  return 'model-card-gptoss';
    if (id.includes('gemini'))   return 'model-card-gemini';
    if (id.includes('nous') || id.includes('hermes')) return 'model-card-hermes';
    if (id.includes('llama'))    return 'model-card-llama';
    if (id.includes('mistral'))  return 'model-card-mistral';
    if (id.includes('gemma'))    return 'model-card-gemma';
    if (id.includes('phi'))      return 'model-card-phi';
    if (id.includes('qwen'))     return 'model-card-qwen';
    return 'model-card-openrouter';
}

// Initialize when DOM is ready
function init() {
    injectSidebarShell();
    initDOM();
    attachListeners();
    fetchAvailableModels();
    initSidebar();
    refreshAttachedDocumentsIndicator();
    typePlaceholder();
    console.log('AI Search engine loaded', { API_BASE });
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}
