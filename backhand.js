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
      resultDetails = document.getElementById('resultDetails');

// We add the search bar listener here
const searchTermInput = document.getElementById('searchTerm');

/**
 * INITIALIZATION
 */
window.addEventListener('DOMContentLoaded', () => {
    console.log("App Initialized. Mode: Learner");
    if (modeSwitcher) modeSwitcher.value = 'learner';
    autoLoadDataFolder();
});

async function autoLoadDataFolder() {
    console.log("Starting Auto-load...");
    for (const filePath of AUTO_LOAD_FILES) {
        try {
            const response = await fetch(filePath);
            if (!response.ok) {
                console.error("File not found:", filePath);
                continue;
            }
            const arrayBuffer = await response.arrayBuffer();
            const res = await mammoth.extractRawText({ arrayBuffer });
            
            // Append questions from this file
            parseQuestions(res.value, false); 
            
            const fileName = filePath.split('/').pop();
            if (!uploadedFileNames.includes(fileName)) uploadedFileNames.push(fileName);
            console.log("Loaded:", fileName);
        } catch (err) {
            console.error("Fetch error for " + filePath, err);
        }
    }
    
    if (questions.length > 0) {
        updateFileNameUI();
        initQuiz();
    } else {
        console.warn("No questions were parsed from the auto-load files.");
    }
}

/**
 * PARSING ENGINE
 */
function parseQuestions(rawText, shouldInit = true) {
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
            if (options.length > 0) {
                questions.push({ 
                    originalNumber: questions.length + 1, 
                    text: body, 
                    options, 
                    answer: correctAns 
                });
            }
        }
    });
    if (shouldInit && questions.length > 0) initQuiz();
}

/**
 * UI RENDERING
 */
function initQuiz() {
    currentMode = modeSwitcher.value;
    currentIndex = 0; 
    isSubmitted = false; 
    userAnswers = {}; 
    stopTimer();

    welcomeScreen.style.display = 'none';
    questionCard.style.display = 'block';
    resetBtn.style.display = 'block';
    
    submitBtn.style.display = (currentMode === 'learner') ? 'none' : 'block';
    timerDisplay.style.display = (currentMode === 'timed') ? 'block' : 'none';
    
    if (currentMode === 'timed') startTimer(questions.length * 60); 
    else startTime = Date.now();
    
    renderNav(); 
    renderQuestion();
}

function renderNav() {
    navList.innerHTML = '';
    const term = searchTermInput ? searchTermInput.value.toLowerCase() : "";
    
    questions.forEach((q, index) => {
        if (q.text.toLowerCase().includes(term)) {
            const isAns = userAnswers[index] && userAnswers[index].length > 0;
            const div = document.createElement('div');
            div.className = `nav-item ${index === currentIndex ? 'active' : ''} ${isAns ? 'answered' : ''}`;
            div.innerHTML = `<span>Question ${q.originalNumber}</span>${isAns ? '<span>✓</span>' : ''}`;
            div.onclick = () => { currentIndex = index; renderQuestion(); };
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
    const isMulti = ansKeys.length > 1;

    q.options.forEach((opt, idx) => {
        const label = document.createElement('label');
        label.className = 'option-label';
        const isSel = userAnswers[currentIndex]?.includes(idx);
        const isCorrect = ansKeys.some(k => k.toUpperCase() === String.fromCharCode(65 + idx));

        if ((currentMode === 'learner' || isSubmitted) && isCorrect) {
            label.style.borderColor = "#059669";
            label.style.backgroundColor = "#ecfdf5";
            label.style.borderWidth = "2px";
        }

        label.innerHTML = `
            <input type="${isMulti ? 'checkbox' : 'radio'}" name="q_grp" ${isSel ? 'checked' : ''} ${isSubmitted ? 'disabled' : ''}
                onchange="handleSelection(${idx}, ${isMulti})">
            <span style="margin-left:10px;">${opt}</span>
        `;
        optionsList.appendChild(label);
    });
    prevBtn.disabled = currentIndex === 0;
    nextBtn.disabled = currentIndex === questions.length - 1;
    progressIndicator.innerText = `Progress: ${Math.round(((currentIndex + 1) / questions.length) * 100)}%`;
    renderNav();
}

/**
 * HELPERS & HANDLERS
 */
function handleSelection(idx, multi) {
    if (isSubmitted) return;
    if (!userAnswers[currentIndex]) userAnswers[currentIndex] = [];
    if (multi) {
        if (userAnswers[currentIndex].includes(idx)) userAnswers[currentIndex] = userAnswers[currentIndex].filter(i => i !== idx);
        else userAnswers[currentIndex].push(idx);
    } else userAnswers[currentIndex] = [idx];
    renderNav();
}

if(searchTermInput) {
    searchTermInput.addEventListener('input', renderNav);
}

fileInput.addEventListener('change', handleFile);
prevBtn.addEventListener('click', () => navigate(-1));
nextBtn.addEventListener('click', () => navigate(1));
submitBtn.addEventListener('click', () => calculateResult(false));
resetBtn.addEventListener('click', resetQuizState);
modeSwitcher.addEventListener('change', (e) => {
    currentMode = e.target.value;
    if(questions.length > 0) initQuiz();
});

async function handleFile(event) {
    const files = event.target.files;
    for (let file of files) {
        const ext = file.name.split('.').pop().toLowerCase();
        const reader = new FileReader();
        reader.onload = async (e) => {
            let text = (ext === 'docx' || ext === 'doc') ? 
                (await mammoth.extractRawText({ arrayBuffer: e.target.result })).value : e.target.result;
            parseQuestions(text, true);
        };
        if (['docx','doc'].includes(ext)) reader.readAsArrayBuffer(file);
        else reader.readAsText(file);
    }
}

function startTimer(s) {
    timeLeft = s;
    timerInterval = setInterval(() => {
        timeLeft--;
        if(timeLeft <= 0) calculateResult(true);
    }, 1000);
}

function stopTimer() { clearInterval(timerInterval); }
function updateFileNameUI() { fileNameDisplay.innerText = uploadedFileNames.join(", "); }
function resetQuizState() { if(confirm("Clear all?")) initQuiz(); }
function navigate(d) { currentIndex += d; renderQuestion(); }

function calculateResult(auto) {
    isSubmitted = true; stopTimer();
    let score = 0;
    questions.forEach((q, i) => {
        const correct = (q.answer.match(/[A-G]/gi) || []).map(l => l.toUpperCase()).sort();
        const user = (userAnswers[i] || []).map(idx => String.fromCharCode(65 + idx)).sort();
        if (correct.length > 0 && JSON.stringify(correct) === JSON.stringify(user)) score++;
    });
    resultDetails.innerHTML = `<p><strong>Score:</strong> ${score} / ${questions.length}</p>`;
    resultModal.style.display = 'flex';
    renderQuestion(); 
}
