let questions = [];
let currentIndex = 0;
let userAnswers = {}; 
let currentMode = 'learner'; 
let timeLeft = 0;
let timerInterval = null;
let isSubmitted = false;
let startTime = 0;
let uploadedFileNames = [];
let flaggedQuestions = new Set();

const PLATFORM_FILES = {
    billing: [
        'Data/zuora_billing.docx',
        'Data/zuora_billing_300.docx'
    ],
    revenue: [
        'Data/zuora_revenue_questions.docx' 
    ]
};

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
const platformSelect = document.getElementById('platformSelect');
const timerDisplay = document.getElementById('timerDisplay');
const resultModal = document.getElementById('resultModal');
const resultDetails = document.getElementById('resultDetails');

window.addEventListener('DOMContentLoaded', () => {
    addFlagButton();
    addJumpButton();
    restoreProgress(); 
    handlePlatformChange();
});

platformSelect.addEventListener('change', () => {
    localStorage.setItem('selected_platform', platformSelect.value);
    userAnswers = {};
    flaggedQuestions = new Set();
    currentIndex = 0;
    localStorage.removeItem('quiz_progress_save');
    handlePlatformChange();
});

async function handlePlatformChange() {
    const selected = platformSelect.value;
    const filesToLoad = PLATFORM_FILES[selected] || [];
    questions = []; 
    uploadedFileNames = [];
    navList.innerHTML = '';
    questionCard.style.display = 'none';
    welcomeScreen.style.display = 'block';
    updateFileNameUI();
    
    for (const filePath of filesToLoad) {
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

function addFlagButton() {
    const flagContainer = document.getElementById('flagContainer');
    const flagBtn = document.createElement('button');
    flagBtn.id = "flagBtn";
    flagBtn.style = "margin-bottom: 15px; background: #f3f4f6; color: #1f2937; border: 1px solid #d1d5db; padding: 6px 14px; font-size: 13px; border-radius: 6px; cursor: pointer; font-weight: 600;";
    flagBtn.onclick = toggleFlag;
    flagContainer.appendChild(flagBtn);
}

function addJumpButton() {
    const controls = document.getElementById('sidebarControls');
    const jumpBtn = document.createElement('button');
    jumpBtn.className = "btn-info";
    jumpBtn.style = "width: 100%; margin-top: 10px; border-color: #f59e0b; color: #b45309;";
    jumpBtn.innerText = "Jump to Unanswered";
    jumpBtn.onclick = () => {
        const nextUnanswered = questions.findIndex((_, i) => !userAnswers[i] || userAnswers[i].length === 0);
        if (nextUnanswered !== -1) { currentIndex = nextUnanswered; renderQuestion(); }
        else { alert("All questions answered!"); }
    };
    controls.prepend(jumpBtn);
}

function toggleFlag() {
    if (flaggedQuestions.has(currentIndex)) flaggedQuestions.delete(currentIndex);
    else flaggedQuestions.add(currentIndex);
    renderNav();
    saveProgress();
}

function saveProgress() {
    const data = { userAnswers, currentIndex, flaggedQuestions: Array.from(flaggedQuestions) };
    localStorage.setItem('quiz_progress_save', JSON.stringify(data));
}

function restoreProgress() {
    const saved = localStorage.getItem('quiz_progress_save');
    const savedPlat = localStorage.getItem('selected_platform');
    if (savedPlat) platformSelect.value = savedPlat;
    if (saved) {
        const d = JSON.parse(saved);
        userAnswers = d.userAnswers || {};
        currentIndex = d.currentIndex || 0;
        flaggedQuestions = new Set(d.flaggedQuestions || []);
    }
}

fileInput.addEventListener('change', handleFile);
prevBtn.addEventListener('click', () => navigate(-1));
nextBtn.addEventListener('click', () => navigate(1));
submitBtn.addEventListener('click', () => calculateResult(false));
resetBtn.addEventListener('click', () => { if(confirm("Wipe all progress?")) { localStorage.clear(); location.reload(); } });

modeSwitcher.addEventListener('change', () => { currentMode = modeSwitcher.value; if(questions.length > 0) initQuiz(); });

async function handleFile(event) {
    const files = event.target.files;
    for (let file of files) {
        if (!uploadedFileNames.includes(file.name)) uploadedFileNames.push(file.name);
        const ext = file.name.split('.').pop().toLowerCase();
        const reader = new FileReader();
        reader.onload = async (e) => {
            let text = "";
            if (ext === 'docx' || ext === 'doc') { const res = await mammoth.extractRawText({ arrayBuffer: e.target.result }); text = res.value; }
            else if (ext === 'pdf') { text = await parsePDF(e.target.result); }
            else { text = e.target.result; }
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
        if (flaggedQuestions.has(index)) div.style.borderRight = "5px solid #dc2626";
        div.innerHTML = `<span>Question ${q.originalNumber}</span>${isAns ? '<span>✓</span>' : ''}`;
        div.onclick = () => { currentIndex = index; renderQuestion(); };
        navList.appendChild(div);
    });
}

function renderQuestion() {
    const q = questions[currentIndex];
    if (!q) return;
    qNumText.innerText = `Question ${currentIndex + 1} of ${questions.length}`;
    qText.innerText = q.text;
    optionsList.innerHTML = '';
    const flagBtn = document.getElementById('flagBtn');
    if(flagBtn) {
        flagBtn.innerText = flaggedQuestions.has(currentIndex) ? "🚩 Unflag" : "🚩 Flag for Review";
        flagBtn.style.background = flaggedQuestions.has(currentIndex) ? "#fee2e2" : "#f3f4f6";
    }
    const ansKeys = q.answer.match(/[A-G]/gi) || [];
    const isMulti = ansKeys.length > 1;
    q.options.forEach((opt, idx) => {
        const label = document.createElement('label');
        label.className = 'option-label';
        const isSel = userAnswers[currentIndex]?.includes(idx);
        const isCorrect = ansKeys.some(k => k.toUpperCase() === String.fromCharCode(65 + idx));
        if ((currentMode === 'learner' || isSubmitted) && isCorrect) { label.style.borderColor = "#059669"; label.style.backgroundColor = "#ecfdf5"; label.style.borderWidth = "2px"; }
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
    let score = 0;
    questions.forEach((q, i) => {
        const correct = (q.answer.match(/[A-G]/gi) || []).map(l => l.toUpperCase()).sort();
        const user = (userAnswers[i] || []).map(idx => String.fromCharCode(65 + idx)).sort();
        if (correct.length > 0 && JSON.stringify(correct) === JSON.stringify(user)) score++;
    });
    const percentage = ((score / questions.length) * 100).toFixed(1);
    resultDetails.innerHTML = `<div style="text-align:left;"><p><strong>Score:</strong> ${score}/${questions.length} (${percentage}%)</p><p><strong>Time:</strong> ${timeTakenStr}</p></div>`;
    resultModal.style.display = 'flex';
    localStorage.removeItem('quiz_progress_save'); 
    renderNav(); renderQuestion(); 
}

function navigate(d) { currentIndex += d; renderQuestion(); saveProgress(); }
