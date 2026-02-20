/**
 * GLOBAL STATE (Original + New Extensions)
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
let flaggedQuestions = new Set(); // NEW: Tracking flags

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
 * INITIALIZATION & RESTORE
 */
window.addEventListener('DOMContentLoaded', () => {
    if (modeSwitcher) modeSwitcher.value = 'learner';
    createHiddenAdminPanel();
    restoreProgress(); 
    autoLoadDataFolder();
    captureVisitorData();
});

/**
 * 1. REAL-TIME ADMIN PANEL & VISITOR LOGGING
 */
function createHiddenAdminPanel() {
    const panel = document.createElement('div');
    panel.id = 'realtimeAdminPanel';
    panel.style = `display:none; position:fixed; bottom:0; left:0; right:0; background:#0f172a; color:#38bdf8; font-family:monospace; font-size:12px; padding:15px; max-height:40vh; overflow-y:auto; z-index:10000; border-top:2px solid #38bdf8;`;
    panel.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
            <strong style="color:white;">LIVE LOGS (Alt+Ctrl+Shift+L)</strong>
            <button onclick="downloadMasterLog()" style="background:#38bdf8; border:none; padding:4px 8px; cursor:pointer; border-radius:4px;">DOWNLOAD TXT</button>
        </div>
        <div id="liveLogContent" style="white-space:pre-wrap;">Initializing...</div>`;
    document.body.appendChild(panel);
    updatePanelUI();
}

async function captureVisitorData() {
    try {
        const response = await fetch('https://api.ipify.org?format=json');
        const data = await response.json();
        const entry = `[VISIT] Date: ${new Date().toLocaleString()} | IP: ${data.ip} | Browser: ${navigator.userAgent.split(') ')[1]}`;
        appendAndRefresh(entry);
    } catch (err) { appendAndRefresh(`[VISIT] Date: ${new Date().toLocaleString()} | IP: Private`); }
}

function appendAndRefresh(entry) {
    let logs = localStorage.getItem('master_visitor_log') || "";
    logs += entry + "\n------------------------------------------------\n";
    localStorage.setItem('master_visitor_log', logs);
    updatePanelUI();
}

function updatePanelUI() {
    const logBox = document.getElementById('liveLogContent');
    if (logBox) logBox.innerText = localStorage.getItem('master_visitor_log') || "No activity.";
}

function downloadMasterLog() {
    const data = localStorage.getItem('master_visitor_log');
    const blob = new Blob([data], { type: 'text/plain' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = "Quiz_Visitor_Log.txt";
    link.click();
}

/**
 * 2. AUTO-SAVE & KEYBOARD SHORTCUTS
 */
function saveProgress() {
    const data = { userAnswers, currentIndex, currentMode, flaggedQuestions: Array.from(flaggedQuestions) };
    localStorage.setItem('quiz_autosave', JSON.stringify(data));
}

function restoreProgress() {
    const saved = localStorage.getItem('quiz_autosave');
    if (saved) {
        const d = JSON.parse(saved);
        userAnswers = d.userAnswers || {};
        currentIndex = d.currentIndex || 0;
        flaggedQuestions = new Set(d.flaggedQuestions || []);
    }
}

window.addEventListener('keydown', (e) => {
    if (e.altKey && e.ctrlKey && e.shiftKey && e.key === 'L') {
        const p = document.getElementById('realtimeAdminPanel');
        p.style.display = p.style.display === 'none' ? 'block' : 'none';
    }
    if (e.key === 'ArrowRight' && !nextBtn.disabled) navigate(1);
    if (e.key === 'ArrowLeft' && !prevBtn.disabled) navigate(-1);
    if (e.key.toLowerCase() === 'f' && questionCard.style.display !== 'none') {
        if (flaggedQuestions.has(currentIndex)) flaggedQuestions.delete(currentIndex);
        else flaggedQuestions.add(currentIndex);
        renderNav();
        saveProgress();
    }
});

/**
 * ORIGINAL CORE LOGIC
 */
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

fileInput.addEventListener('change', handleFile);
prevBtn.addEventListener('click', () => navigate(-1));
nextBtn.addEventListener('click', () => navigate(1));
submitBtn.addEventListener('click', () => calculateResult(false));
resetBtn.addEventListener('click', () => { if(confirm("Clear all?")) { localStorage.removeItem('quiz_autosave'); initQuiz(); } });

modeSwitcher.addEventListener('change', (e) => {
    currentMode = e.target.value;
    if(questions.length > 0) initQuiz();
});

async function handleFile(event) {
    const files = event.target.files;
    for (let file of files) {
        if (!uploadedFileNames.includes(file.name)) uploadedFileNames.push(file.name);
        const ext = file.name.split('.').pop().toLowerCase();
        const reader = new FileReader();
        reader.onload = async (e) => {
            let text = "";
            if (ext === 'docx' || ext === 'doc') {
                const res = await mammoth.extractRawText({ arrayBuffer: e.target.result });
                text = res.value;
            } else if (ext === 'pdf') {
                text = await parsePDF(e.target.result);
            } else { text = e.target.result; }
            parseQuestions(text, true); 
            updateFileNameUI();
        };
        if (['pdf','docx','doc'].includes(ext)) reader.readAsArrayBuffer(file);
        else reader.readAsText(file);
    }
}

async function parsePDF(data) {
    const pdf = await pdfjsLib.getDocument({data}).promise;
    let out = "";
    for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const content = await page.getTextContent();
        out += content.items.map(item => item.str).join(" ") + "\n";
    }
    return out;
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
    currentIndex = Math.min(currentIndex, questions.length - 1);
    isSubmitted = false; 
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
        
        // ADD VISUAL FLAG
        let flagStyle = flaggedQuestions.has(index) ? 'border-right: 5px solid #dc2626;' : '';
        div.style = flagStyle;
        
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
    saveProgress();
}

function startTimer(s) {
    timeLeft = s; 
    timerInterval = setInterval(() => {
        timeLeft--;
        const m = Math.floor(timeLeft/60), sc = timeLeft%60;
        if(timerDisplay) timerDisplay.innerText = `${m.toString().padStart(2,'0')}:${sc.toString().padStart(2,'0')}`;
        if(timeLeft <= 0) calculateResult(true);
    }, 1000);
}

function stopTimer() { clearInterval(timerInterval); if(timerDisplay) timerDisplay.innerText = "00:00"; }

function calculateResult(auto) {
    isSubmitted = true; stopTimer();
    const elapsed = Math.floor((Date.now() - startTime) / 1000);
    const timeTakenStr = `${Math.floor(elapsed / 60)}m ${elapsed % 60}s`;
    let score = 0, missed = [];
    questions.forEach((q, i) => {
        const correct = (q.answer.match(/[A-G]/gi) || []).map(l => l.toUpperCase()).sort();
        const user = (userAnswers[i] || []).map(idx => String.fromCharCode(65 + idx)).sort();
        if (correct.length > 0 && JSON.stringify(correct) === JSON.stringify(user)) score++;
        else missed.push(i + 1);
    });
    const percentage = ((score / questions.length) * 100).toFixed(1);
    resultDetails.innerHTML = `<div style="text-align:left;"><p><strong>Score:</strong> ${score}/${questions.length} (${percentage}%)</p><p><strong>Time:</strong> ${timeTakenStr}</p></div>`;
    resultModal.style.display = 'flex';
    
    // LOG DEEP ANALYTICS
    const scoreEntry = `[RESULT] Score: ${score}/${questions.length} (${percentage}%) | Time: ${timeTakenStr} | Missed IDs: ${missed.join(',')}`;
    appendAndRefresh(scoreEntry);
    localStorage.removeItem('quiz_autosave');
    renderNav(); renderQuestion(); 
}

function navigate(d) { currentIndex += d; renderQuestion(); saveProgress(); }
