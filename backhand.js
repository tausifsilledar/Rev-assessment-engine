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

const AUTO_LOAD_FILES = ['Data/zuora_billing.docx'];

/**
 * DOM ELEMENTS
 */
const fileInput = document.getElementById('fileInput'),
      fileNameDisplay = document.getElementById('fileNameDisplay'),
      navList = document.getElementById('navList'),
      welcomeScreen = document.getElementById('welcomeScreen'),
      questionCard = document.getElementById('questionCard'),
      qText = document.getElementById('qText'),
      qNumText = document.getElementById('qNumText'),
      optionsList = document.getElementById('optionsList'),
      prevBtn = document.getElementById('prevBtn'),
      nextBtn = document.getElementById('nextBtn'),
      submitBtn = document.getElementById('submitBtn'),
      resetBtn = document.getElementById('resetBtn'),
      progressIndicator = document.getElementById('progressIndicator'),
      modeSwitcher = document.getElementById('modeSwitcher'),
      timerDisplay = document.getElementById('timerDisplay'),
      resultModal = document.getElementById('resultModal'),
      resultDetails = document.getElementById('resultDetails'),
      searchTermInput = document.getElementById('searchTerm');

/**
 * INITIALIZATION
 */
window.addEventListener('DOMContentLoaded', () => {
    if (modeSwitcher) modeSwitcher.value = 'learner';
    autoLoadDataFolder();
});

async function autoLoadDataFolder() {
    for (const filePath of AUTO_LOAD_FILES) {
        try {
            const response = await fetch(filePath);
            if (!response.ok) continue;
            const arrayBuffer = await response.arrayBuffer();
            const res = await mammoth.extractRawText({ arrayBuffer });
            parseQuestions(res.value);
            uploadedFileNames.push(filePath.split('/').pop());
            updateFileNameUI();
        } catch (err) { console.error("Load error:", err); }
    }
}

/**
 * SEARCH LOGIC
 */
searchTermInput.addEventListener('input', () => renderNav());

/**
 * EVENT LISTENERS
 */
fileInput.addEventListener('change', handleFile);
prevBtn.addEventListener('click', () => navigate(-1));
nextBtn.addEventListener('click', () => navigate(1));
submitBtn.addEventListener('click', () => calculateResult());
resetBtn.addEventListener('click', () => { if(confirm("Reset quiz?")) initQuiz(); });
modeSwitcher.addEventListener('change', (e) => {
    currentMode = e.target.value;
    if(questions.length > 0) initQuiz();
});

/**
 * CORE FUNCTIONS
 */
function parseQuestions(rawText) {
    const cleanText = rawText.replace(/\r\n/g, '\n').replace(/\u00a0/g, ' '); 
    const chunks = cleanText.split(/(?=\n\s*\d+\.)|(?=^\s*\d+\.)/g);
    
    chunks.forEach(chunk => {
        const block = chunk.trim();
        if (!block) return;
        const parts = block.split(/(?=\s[A-G]\.\s)|(?=\n[A-G]\.\s)|(?=^[A-G]\.\s)/g);
        if (parts.length > 1) {
            let body = parts[0].replace(/^\s*\d+\.\s*/, '').trim();
            let options = [], correctAns = "";
            for (let i = 1; i < parts.length; i++) {
                let opt = parts[i].trim();
                if (opt.toLowerCase().includes("answer:")) {
                    const s = opt.split(/answer[:\s]+/i);
                    opt = s[0].trim();
                    correctAns = s[1] ? s[1].trim() : "";
                }
                if (opt) options.push(opt);
            }
            if (options.length > 0) questions.push({ originalNumber: questions.length+1, text: body, options, answer: correctAns });
        }
    });
    if (questions.length > 0) initQuiz();
}

function initQuiz() {
    currentMode = modeSwitcher.value;
    currentIndex = 0; isSubmitted = false; userAnswers = {}; stopTimer();
    welcomeScreen.style.display = 'none';
    questionCard.style.display = 'block';
    resetBtn.style.display = 'block';
    submitBtn.style.display = (currentMode === 'learner') ? 'none' : 'block';
    timerDisplay.style.display = (currentMode === 'timed') ? 'block' : 'none';
    
    if (currentMode === 'timed') startTimer(questions.length * 60); 
    else startTime = Date.now();
    renderNav(); renderQuestion();
}

function renderNav() {
    navList.innerHTML = '';
    const term = searchTermInput.value.toLowerCase();
    questions.forEach((q, i) => {
        if (q.text.toLowerCase().includes(term)) {
            const div = document.createElement('div');
            div.className = `nav-item ${i === currentIndex ? 'active' : ''} ${userAnswers[i] ? 'answered' : ''}`;
            div.innerHTML = `<span>Q${q.originalNumber}</span><span style="font-size:0.7rem; opacity:0.6; white-space:nowrap; overflow:hidden;">${q.text.substring(0,15)}...</span>`;
            div.onclick = () => { currentIndex = i; renderQuestion(); };
            navList.appendChild(div);
        }
    });
}

function renderQuestion() {
    const q = questions[currentIndex];
    qNumText.innerText = `Question ${currentIndex + 1} of ${questions.length}`;
    qText.innerText = q.text;
    optionsList.innerHTML = '';
    
    const ansKeys = q.answer.match(/[A-G]/gi) || [];
    q.options.forEach((opt, idx) => {
        const label = document.createElement('label');
        label.className = 'option-label';
        const isSel = userAnswers[currentIndex]?.includes(idx);
        const isCorrect = ansKeys.some(k => k.toUpperCase() === String.fromCharCode(65 + idx));

        if ((currentMode === 'learner' || isSubmitted) && isCorrect) {
            label.style.borderColor = "var(--success-color)";
            label.style.backgroundColor = "#ecfdf5";
            label.style.borderWidth = "2px";
        }

        label.innerHTML = `<input type="${ansKeys.length > 1 ? 'checkbox' : 'radio'}" name="q" ${isSel ? 'checked' : ''} onchange="handleSelection(${idx}, ${ansKeys.length > 1})"> <span style="margin-left:10px">${opt}</span>`;
        optionsList.appendChild(label);
    });
    
    prevBtn.disabled = currentIndex === 0;
    nextBtn.disabled = currentIndex === questions.length - 1;
    progressIndicator.innerText = `Progress: ${Math.round(((currentIndex+1)/questions.length)*100)}%`;
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

async function handleFile(event) {
    for (let file of event.target.files) {
        const ext = file.name.split('.').pop().toLowerCase();
        const reader = new FileReader();
        reader.onload = async (e) => {
            let text = "";
            if (ext.includes('doc')) {
                const res = await mammoth.extractRawText({ arrayBuffer: e.target.result });
                text = res.value;
            } else text = e.target.result;
            parseQuestions(text);
        };
        if (ext.includes('doc')) reader.readAsArrayBuffer(file); else reader.readAsText(file);
    }
}

function startTimer(s) { timeLeft = s; timerInterval = setInterval(() => { timeLeft--; if(timeLeft <= 0) calculateResult(); }, 1000); }
function stopTimer() { clearInterval(timerInterval); }
function updateFileNameUI() { fileNameDisplay.innerText = uploadedFileNames.join(", "); }
function navigate(d) { currentIndex += d; renderQuestion(); }

function calculateResult() {
    isSubmitted = true; stopTimer();
    let score = 0;
    questions.forEach((q, i) => {
        const correct = (q.answer.match(/[A-G]/gi) || []).map(l => l.toUpperCase()).sort();
        const user = (userAnswers[i] || []).map(idx => String.fromCharCode(65 + idx)).sort();
        if (JSON.stringify(correct) === JSON.stringify(user)) score++;
    });
    resultDetails.innerHTML = `<p>Score: ${score}/${questions.length}</p>`;
    resultModal.style.display = 'flex';
    renderQuestion();
}
