/**
 * GLOBAL STATE
 */
let questions = [];
let originalPool = []; // Stores the full, ordered question set
let currentIndex = 0;
let userAnswers = {}; 
let currentMode = 'learner'; 
let isSubmitted = false;
let uploadedFileNames = [];
let flaggedQuestions = new Set();

const PLATFORM_FILES = {
    billing: ['Data/zuora_billing.docx', 'Data/zuora_billing_300.docx'],
    revenue: ['Data/zuora_revenue_questions.docx']
};

/**
 * DOM ELEMENTS
 */
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
const modeSwitcher = document.getElementById('modeSwitcher');
const platformSelect = document.getElementById('platformSelect');
const timerDisplay = document.getElementById('timerDisplay');
const resultModal = document.getElementById('resultModal');
const resultDetails = document.getElementById('resultDetails');
const searchInput = document.getElementById('searchInput');
const searchBtn = document.getElementById('searchBtn');
const fileNameDisplay = document.getElementById('fileNameDisplay');

/**
 * INITIALIZATION
 */
window.addEventListener('DOMContentLoaded', () => {
    addFlagButton();
    addJumpButton();
    restoreProgress(); 
    handlePlatformChange();

    // Mode Switcher Listener
    modeSwitcher.addEventListener('change', () => {
        if (originalPool.length === 0) return;

        if (modeSwitcher.value === 'test') {
            window.QuizLogic.openTestSetup(originalPool.length, (count, useTimer) => {
                // Shuffle, slice, and start
                questions = window.QuizLogic.shuffle([...originalPool]).slice(0, count);
                currentMode = useTimer ? 'timed' : 'test';
                userAnswers = {};
                currentIndex = 0;
                initQuiz();
            });
        } else {
            exitTestSession();
        }
    });
});

/**
 * TEST SESSION MANAGEMENT
 */
function exitTestSession() {
    if (window.QuizLogic.timerInterval) clearInterval(window.QuizLogic.timerInterval);
    window.QuizLogic.toggleExitButton(false);
    questions = [...originalPool]; // Restore full pool in order
    currentMode = 'learner';
    modeSwitcher.value = 'learner';
    initQuiz();
}

function initQuiz() {
    isSubmitted = false;
    welcomeScreen.style.display = 'none';
    questionCard.style.display = 'block';
    resetBtn.style.display = 'block';

    // Visibility
    submitBtn.style.display = (currentMode === 'learner') ? 'none' : 'block';
    timerDisplay.style.display = (currentMode === 'timed') ? 'block' : 'none';

    // Handle Test UI (Timer & Exit Button)
    if (currentMode === 'timed' || currentMode === 'test') {
        window.QuizLogic.toggleExitButton(true, exitTestSession);
        if (currentMode === 'timed') {
            window.QuizLogic.startTimer(questions.length * 60, timerDisplay, calculateResult);
        }
    } else {
        window.QuizLogic.toggleExitButton(false);
        if (window.QuizLogic.timerInterval) clearInterval(window.QuizLogic.timerInterval);
    }

    renderQuestion();
}

/**
 * PARSING LOGIC
 */
async function handlePlatformChange() {
    const selected = platformSelect.value;
    const filesToLoad = PLATFORM_FILES[selected] || [];
    questions = []; uploadedFileNames = [];
    
    for (const filePath of filesToLoad) {
        try {
            const response = await fetch(`${filePath}?t=${Date.now()}`);
            if (!response.ok) continue;
            const arrayBuffer = await response.arrayBuffer();
            const fileName = filePath.split('/').pop();
            if (!uploadedFileNames.includes(fileName)) uploadedFileNames.push(fileName);
            const res = await mammoth.extractRawText({ arrayBuffer: arrayBuffer });
            parseQuestions(res.value, false); 
        } catch (err) { console.error("Load failed", err); }
    }
    if (questions.length > 0) {
        originalPool = [...questions]; // Save the master list
        initQuiz();
    }
}

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
    originalPool = [...questions];
    if (shouldInit && questions.length > 0) initQuiz();
}

/**
 * UI RENDERING
 */
function renderNav(filter = "") {
    navList.innerHTML = '';
    const term = filter.toLowerCase().trim();
    questions.forEach((q, index) => {
        if (term !== "" && !q.text.toLowerCase().includes(term)) return;

        const isAns = userAnswers[index] && userAnswers[index].length > 0;
        const div = document.createElement('div');
        div.className = `nav-item ${index === currentIndex ? 'active' : ''} ${isAns ? 'answered' : ''}`;
        if (flaggedQuestions.has(index)) div.style.borderRight = "4px solid #dc2626";
        
        div.innerHTML = `<span>Q${q.originalNumber}</span> <span style="font-size:0.7rem; color:#9ca3af; margin-left:5px;">${q.text.substring(0, 15)}...</span>`;
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
    
    const fBtn = document.getElementById('flagBtn');
    if(fBtn) fBtn.innerText = flaggedQuestions.has(currentIndex) ? "🚩 Unflag" : "🚩 Flag";

    const ansKeys = q.answer.match(/[A-G]/gi) || [];
    const isMulti = ansKeys.length > 1;

    q.options.forEach((opt, idx) => {
        const label = document.createElement('label');
        label.className = 'option-label';
        const isSel = userAnswers[currentIndex]?.includes(idx);
        const isCorrect = ansKeys.some(k => k.toUpperCase() === String.fromCharCode(65 + idx));

        if ((currentMode === 'learner' || isSubmitted) && isCorrect) {
            label.style.borderColor = "#059669"; label.style.backgroundColor = "#ecfdf5";
        }
        label.innerHTML = `<input type="${isMulti ? 'checkbox' : 'radio'}" name="q_grp" ${isSel ? 'checked' : ''} ${isSubmitted ? 'disabled' : ''} onchange="handleSelection(${idx}, ${isMulti})"><span style="margin-left:10px;">${opt}</span>`;
        optionsList.appendChild(label);
    });

    prevBtn.disabled = currentIndex === 0;
    nextBtn.disabled = currentIndex === questions.length - 1;
    renderNav(searchInput.value);
}

function handleSelection(idx, multi) {
    if (isSubmitted) return;
    if (!userAnswers[currentIndex]) userAnswers[currentIndex] = [];
    if (multi) {
        if (userAnswers[currentIndex].includes(idx)) userAnswers[currentIndex] = userAnswers[currentIndex].filter(i => i !== idx);
        else userAnswers[currentIndex].push(idx);
    } else userAnswers[currentIndex] = [idx];
    renderNav(searchInput.value);
}

/**
 * RESULTS & NAVIGATION
 */
function calculateResult() {
    isSubmitted = true;
    if (window.QuizLogic.timerInterval) clearInterval(window.QuizLogic.timerInterval);
    const score = window.QuizLogic.calculateScore(questions, userAnswers);
    resultDetails.innerHTML = `<p><strong>Score:</strong> ${score}/${questions.length} (${((score/questions.length)*100).toFixed(1)}%)</p>`;
    resultModal.style.display = 'flex';
    renderQuestion(); 
}

function navigate(d) { currentIndex += d; renderQuestion(); }
prevBtn.onclick = () => navigate(-1);
nextBtn.onclick = () => navigate(1);
submitBtn.onclick = () => calculateResult();
resetBtn.onclick = () => { if(confirm("Reset all?")) location.reload(); };

// Search logic
searchBtn.onclick = () => renderNav(searchInput.value);
searchInput.onkeypress = (e) => { if (e.key === 'Enter') renderNav(searchInput.value); };

/**
 * FLAG & JUMP BUTTONS
 */
function addFlagButton() {
    const flagContainer = document.getElementById('flagContainer');
    const flagBtn = document.createElement('button');
    flagBtn.id = "flagBtn";
    flagBtn.className = "btn-secondary";
    flagBtn.onclick = () => {
        if (flaggedQuestions.has(currentIndex)) flaggedQuestions.delete(currentIndex);
        else flaggedQuestions.add(currentIndex);
        renderQuestion();
    };
    flagContainer.appendChild(flagBtn);
}

function addJumpButton() {
    const controls = document.getElementById('sidebarControls');
    const jumpBtn = document.createElement('button');
    jumpBtn.className = "btn-info";
    jumpBtn.innerText = "Jump to Unanswered";
    jumpBtn.onclick = () => {
        const next = questions.findIndex((_, i) => !userAnswers[i] || userAnswers[i].length === 0);
        if (next !== -1) { currentIndex = next; renderQuestion(); }
    };
    controls.prepend(jumpBtn);
}

function restoreProgress() { /* ... existing localStorage logic ... */ }