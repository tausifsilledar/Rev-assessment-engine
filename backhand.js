/**
 * GLOBAL STATE
 */
let questions = [];
let currentIndex = 0;
let userAnswers = {}; 
let currentMode = 'learner'; 
let timeLeft = 0;
let timerInterval = null;
let isSubmitted = false;
let startTime = 0;
let uploadedFileNames = [];

/**
 * AUTO-LOAD CONFIGURATION
 */
const AUTO_LOAD_FILES = [
    'Data/zuora_billing.docx',
    'Data/zuora_billing_300.docx'
];

/**
 * DOM ELEMENTS
 */
const fileInput = document.getElementById('fileInput');
const fileNameDisplay = document.getElementById('fileNameDisplay');
const navList = document.getElementById('navList');
const welcomeScreen = document.getElementById('welcomeScreen');
const questionCard = document.getElementById('questionCard');
const qText = document.getElementById('qText');
const qNumText = document.getElementById('qNumText');
const optionsList = document.getElementById('optionsList');
const prevBtn = document.getElementById('prevBtn');
const nextBtn = document.getElementById('nextBtn');
const submitBtn = document.getElementById('submitBtn');
const resetBtn = document.getElementById('resetBtn');
const progressIndicator = document.getElementById('progressIndicator');
const modeSwitcher = document.getElementById('modeSwitcher');
const timerDisplay = document.getElementById('timerDisplay');
const resultModal = document.getElementById('resultModal');
const resultDetails = document.getElementById('resultDetails');

/**
 * INITIALIZATION
 */
window.addEventListener('DOMContentLoaded', () => {
    if (modeSwitcher) modeSwitcher.value = 'learner';
    createAdminDashboard(); // Creates the hidden panel
    autoLoadDataFolder();
    trackVisitors(); 
});

/**
 * SECRET SHORTCUT LISTENER
 * Trigger: Alt + Ctrl + Shift + L
 */
window.addEventListener('keydown', (e) => {
    if (e.altKey && e.ctrlKey && e.shiftKey && e.key === 'L') {
        const panel = document.getElementById('adminDashboard');
        if (panel) {
            // Toggle visibility
            panel.style.display = (panel.style.display === 'none') ? 'block' : 'none';
            refreshLogDisplay();
        }
    }
});

async function autoLoadDataFolder() {
    for (const filePath of AUTO_LOAD_FILES) {
        try {
            const response = await fetch(filePath);
            if (!response.ok) continue;
            const arrayBuffer = await response.arrayBuffer();
            const fileName = filePath.split('/').pop();
            if (!uploadedFileNames.includes(fileName)) uploadedFileNames.push(fileName);
            const res = await mammoth.extractRawText({ arrayBuffer: arrayBuffer });
            parseQuestions(res.value, false); 
            updateFileNameUI();
        } catch (err) { console.error("Auto-load failed", err); }
    }
    if (questions.length > 0) initQuiz();
}

/**
 * HIDDEN ADMIN DASHBOARD
 */
function createAdminDashboard() {
    const adminDiv = document.createElement('div');
    adminDiv.id = 'adminDashboard';
    // Positioned as a fixed overlay so it's easy to see when activated
    adminDiv.style = `
        display: none; 
        position: fixed;
        bottom: 20px;
        right: 20px;
        width: 350px;
        max-height: 500px;
        background: white;
        border: 2px solid #334155;
        box-shadow: 0 10px 25px rgba(0,0,0,0.2);
        z-index: 9999;
        padding: 15px;
        font-family: monospace;
        font-size: 11px;
        border-radius: 8px;
    `;
    adminDiv.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid #eee; padding-bottom:5px; margin-bottom:10px;">
            <strong style="color:#1e293b;">SECRET VISITOR LOGS</strong>
            <button onclick="document.getElementById('adminDashboard').style.display='none'" style="cursor:pointer; border:none; background:none; font-weight:bold;">X</button>
        </div>
        <div id="logContent" style="white-space: pre-wrap; overflow-y: auto; max-height: 350px; background:#f1f5f9; padding:5px; border-radius:4px;">Loading...</div>
        <div style="margin-top:10px; display:flex; gap:5px;">
            <button onclick="saveLogsToTxt()" style="flex:1; cursor:pointer; padding:5px;">Download .txt</button>
            <button onclick="if(confirm('Clear all history?')){localStorage.removeItem('master_visitor_log'); refreshLogDisplay();}" style="cursor:pointer; padding:5px; color:red;">Clear</button>
        </div>
    `;
    document.body.appendChild(adminDiv);
}

function refreshLogDisplay() {
    const logContainer = document.getElementById('logContent');
    const logs = localStorage.getItem('master_visitor_log') || "No history recorded yet.";
    if (logContainer) logContainer.innerText = logs;
}

/**
 * LOGGING SYSTEM (APPEND ONLY)
 */
function appendToPermanentLog(newEntry) {
    let existingLogs = localStorage.getItem('master_visitor_log');
    let updatedLogs = existingLogs ? existingLogs + "\n" + newEntry : newEntry;
    localStorage.setItem('master_visitor_log', updatedLogs);
    refreshLogDisplay();
}

async function trackVisitors() {
    try {
        const response = await fetch('https://api.ipify.org?format=json');
        const data = await response.json();
        const entry = `[VISIT] ${new Date().toLocaleString()} | IP: ${data.ip}`;
        appendToPermanentLog(entry);
    } catch (e) {
        appendToPermanentLog(`[VISIT] ${new Date().toLocaleString()} | IP: Error`);
    }
}

/**
 * REST OF CODE (Unchanged)
 */
function calculateResult(auto) {
    isSubmitted = true; stopTimer();
    const endTime = Date.now();
    const elapsed = Math.floor((endTime - startTime) / 1000);
    const timeTakenStr = `${Math.floor(elapsed / 60)}m ${elapsed % 60}s`;
    let score = 0;
    questions.forEach((q, i) => {
        const correct = (q.answer.match(/[A-G]/gi) || []).map(l => l.toUpperCase()).sort();
        const user = (userAnswers[i] || []).map(idx => String.fromCharCode(65 + idx)).sort();
        if (JSON.stringify(correct) === JSON.stringify(user)) score++;
    });
    const percentage = ((score / questions.length) * 100).toFixed(1);
    resultDetails.innerHTML = `<p><strong>Score:</strong> ${score} / ${questions.length} (${percentage}%)</p>`;
    resultModal.style.display = 'flex';
    appendToPermanentLog(`[RESULT] ${new Date().toLocaleString()} | Score: ${score}/${questions.length} (${percentage}%)`);
    renderNav(); renderQuestion(); 
}

function updateFileNameUI() { fileNameDisplay.innerText = uploadedFileNames.join(", "); }
function parseQuestions(rawText, shouldInit = true) {
    const cleanText = rawText.replace(/\r\n/g, '\n').replace(/\u00a0/g, ' '); 
    const chunks = cleanText.split(/(?=\n\s*\d+\.)|(?=^\s*\d+\.)/g);
    chunks.forEach(chunk => {
        const block = chunk.trim();
        if (!block) return;
        const parts = block.split(/(?=\s[A-G]\.\s)|(?=\n[A-G]\.\s)|(?=^[A-G]\.\s)/g);
        if (parts.length > 1) {
            let body = parts[0].replace(/^\s*\d+\.\s*/, '').trim();
            let options = [];
            let correctAns = "";
            for (let i = 1; i < parts.length; i++) {
                let optText = parts[i].trim();
                if (optText.toLowerCase().includes("answer:")) {
                    const splitArr = optText.split(/answer[:\s]+/i);
                    optText = splitArr[0].trim();
                    correctAns = splitArr[1] ? splitArr[1].trim() : "";
                }
                if (optText) options.push(optText);
            }
            if (options.length > 0) questions.push({ originalNumber: questions.length + 1, text: body, options, answer: correctAns });
        }
    });
    if (shouldInit && questions.length > 0) initQuiz();
}

function initQuiz() {
    currentMode = modeSwitcher.value; 
    currentIndex = 0; isSubmitted = false; userAnswers = {}; 
    stopTimer();
    welcomeScreen.style.display = 'none';
    questionCard.style.display = 'block';
    resetBtn.style.display = 'block';
    submitBtn.style.display = (currentMode === 'learner') ? 'none' : 'block';
    timerDisplay.style.display = (currentMode === 'timed') ? 'block' : 'none';
    startTime = Date.now();
    if (currentMode === 'timed') startTimer(questions.length * 60); 
    renderNav(); renderQuestion();
}

function renderNav() {
    navList.innerHTML = '';
    questions.forEach((q, index) => {
        const isAns = userAnswers[index] && userAnswers[index].length > 0;
        const div = document.createElement('div');
        div.className = `nav-item ${index === currentIndex ? 'active' : ''} ${isAns ? 'answered' : ''}`;
        div.innerHTML = `<span>Question ${q.originalNumber}</span>${isAns ? '<span>✓</span>' : ''}`;
        div.onclick = () => { currentIndex = index; renderQuestion(); };
        navList.appendChild(div);
    });
}

function renderQuestion() {
    const q = questions[currentIndex];
    qNumText.innerText = `Question ${currentIndex + 1} of ${questions.length}`;
    qText.innerText = q.text;
    optionsList.innerHTML = '';
    const ansKeys = q.answer.match(/[A-G]/gi) || [];
    const isMulti = ansKeys.length > 1;
    q.options.forEach((opt, idx) => {
        const label = document.createElement('label');
        label.className = 'option-label';
        const isSel = userAnswers[currentIndex]?.includes(idx);
        const isCorrect = ansKeys.some(k => k.toUpperCase() === String.fromCharCode(65 + idx));
        if ((currentMode === 'learner' || isSubmitted) && isCorrect) {
            label.style.borderColor = "#059669"; label.style.backgroundColor = "#ecfdf5"; label.style.borderWidth = "2px";
        }
        label.innerHTML = `<input type="${isMulti ? 'checkbox' : 'radio'}" name="q_grp" ${isSel ? 'checked' : ''} ${isSubmitted ? 'disabled' : ''} onchange="handleSelection(${idx}, ${isMulti})"><span style="margin-left:10px;">${opt}</span>`;
        optionsList.appendChild(label);
    });
    prevBtn.disabled = currentIndex === 0;
    nextBtn.disabled = currentIndex === questions.length - 1;
    progressIndicator.innerText = `Progress: ${Math.round(((currentIndex + 1) / questions.length) * 100)}%`;
    renderNav();
}

function handleSelection(idx, multi) {
    if (isSubmitted) return;
    if (!userAnswers[currentIndex]) userAnswers[currentIndex] = [];
    if (multi) {
        if (userAnswers[currentIndex].includes(idx)) userAnswers[currentIndex] = userAnswers[currentIndex].filter(i => i !== idx);
        else userAnswers[currentIndex].push(idx);
    } else userAnswers[currentIndex] = [idx];
    renderNav();
}

function startTimer(s) {
    timeLeft = s; 
    timerInterval = setInterval(() => {
        timeLeft--;
        const m = Math.floor(timeLeft/60), sc = timeLeft%60;
        timerDisplay.innerText = `${m.toString().padStart(2,'0')}:${sc.toString().padStart(2,'0')}`;
        if(timeLeft <= 0) calculateResult(true);
    }, 1000);
}

function stopTimer() { clearInterval(timerInterval); timerDisplay.innerText = "00:00"; }
function resetQuizState() { if(confirm("Clear all?")) initQuiz(); }
function navigate(d) { currentIndex += d; renderQuestion(); }

function saveLogsToTxt() {
    const fullData = localStorage.getItem('master_visitor_log');
    if (!fullData) return alert("No history found.");
    const blob = new Blob([fullData], { type: 'text/plain' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `Visitor_History.txt`;
    link.click();
}
