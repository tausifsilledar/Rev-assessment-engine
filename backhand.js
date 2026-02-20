/**
 * GLOBAL STATE
 */
let questions = [];
let currentIndex = 0;
let userAnswers = {}; 
let currentMode = 'learner'; // Default to learner
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
 * INITIALIZATION & AUTO-LOAD
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
            const fileName = filePath.split('/').pop();
            if (!uploadedFileNames.includes(fileName)) uploadedFileNames.push(fileName);

            const res = await mammoth.extractRawText({ arrayBuffer: arrayBuffer });
            parseQuestions(res.value, false); 
            updateFileNameUI();
        } catch (err) {
            console.error("Auto-load failed", err);
        }
    }
    if (questions.length > 0) initQuiz();
}

/**
 * EVENT LISTENERS
 */
fileInput.addEventListener('change', handleFile);
prevBtn.addEventListener('click', () => navigate(-1));
nextBtn.addEventListener('click', () => navigate(1));
submitBtn.addEventListener('click', () => calculateResult(false));
resetBtn.addEventListener('click', resetQuizState);

modeSwitcher.addEventListener('change', (e) => {
    currentMode = e.target.value;
    if(questions.length > 0) initQuiz();
});

/**
 * FILE HANDLING
 */
async function handleFile(event) {
    const files = event.target.files;
    if (!files.length) return;
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
            } else {
                text = e.target.result;
            }
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

function updateFileNameUI() {
    fileNameDisplay.innerText = uploadedFileNames.join(", ");
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
            if (options.length > 0) {
                questions.push({ originalNumber: questions.length + 1, text: body, options, answer: correctAns });
            }
        }
    });
    if (shouldInit && questions.length > 0) initQuiz();
}

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
    
    // Capture the start time for the assessment summary
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

function calculateResult(auto) {
    isSubmitted = true; 
    stopTimer();

    // 1. Calculate Time Taken
    const endTime = Date.now();
    const elapsedTotalSeconds = Math.floor((endTime - startTime) / 1000);
    const mins = Math.floor(elapsedTotalSeconds / 60);
    const secs = elapsedTotalSeconds % 60;
    const timeTakenStr = `${mins}m ${secs}s`;

    // 2. Calculate Score & Attempts
    let score = 0;
    let attempted = 0;
    questions.forEach((q, i) => {
        const correct = (q.answer.match(/[A-G]/gi) || []).map(l => l.toUpperCase()).sort();
        const user = (userAnswers[i] || []).map(idx => String.fromCharCode(65 + idx)).sort();
        
        if (userAnswers[i] && userAnswers[i].length > 0) attempted++;
        if (correct.length > 0 && JSON.stringify(correct) === JSON.stringify(user)) score++;
    });

    const percentage = ((score / questions.length) * 100).toFixed(1);

    // 3. Render Detailed Summary
    resultDetails.innerHTML = `
        <div style="text-align: left; line-height: 1.8; font-size: 1.1em;">
            <p><strong>Score:</strong> ${score} / ${questions.length} (${percentage}%)</p>
            <p><strong>Time Taken:</strong> ${timeTakenStr}</p>
            <p><strong>Attempted:</strong> ${attempted} / ${questions.length}</p>
            <p><strong>Status:</strong> ${percentage >= 70 ? '<span style="color:#059669">PASSED</span>' : '<span style="color:#dc2626">FAILED</span>'}</p>
        </div>
    `;

    resultModal.style.display = 'flex';
    renderNav(); 
    renderQuestion(); 
}

function resetQuizState() { if(confirm("Clear all?")) initQuiz(); }
function navigate(d) { currentIndex += d; renderQuestion(); }
