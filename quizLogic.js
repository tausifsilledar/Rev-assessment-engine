/**
 * quizLogic.js - Global Logic Engine
 * Handles Shuffling, Scoring, Timer, and Test Setup UI
 */
window.QuizLogic = {
    timerInterval: null,

    // Randomizes the question pool
    shuffle: function(array) {
        let currentIndex = array.length;
        while (currentIndex != 0) {
            let randomIndex = Math.floor(Math.random() * currentIndex);
            currentIndex--;
            [array[currentIndex], array[randomIndex]] = [array[randomIndex], array[currentIndex]];
        }
        return array;
    },

    // Calculates the score based on exact letter matches
    calculateScore: function(questions, userAnswers) {
        let score = 0;
        questions.forEach((q, i) => {
            const correct = (q.answer.match(/[A-G]/gi) || []).map(l => l.toUpperCase()).sort();
            const user = (userAnswers[i] || []).map(idx => String.fromCharCode(65 + idx)).sort();
            if (correct.length > 0 && JSON.stringify(correct) === JSON.stringify(user)) score++;
        });
        return score;
    },

    // Handles the countdown timer internally
    startTimer: function(duration, displayElement, onFinish) {
        if (this.timerInterval) clearInterval(this.timerInterval);
        let timeLeft = duration;
        
        this.timerInterval = setInterval(() => {
            timeLeft--;
            const m = Math.floor(timeLeft / 60);
            const s = timeLeft % 60;
            if (displayElement) {
                displayElement.innerText = `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
            }
            if (timeLeft <= 0) {
                clearInterval(this.timerInterval);
                onFinish(true); // Auto-submit
            }
        }, 1000);
    },

    // Generates the Test Setup Modal
    openTestSetup: function(poolSize, onStart) {
        let setupModal = document.getElementById('setupModal');
        if (!setupModal) {
            const modalHtml = `
                <div id="setupModal" style="display:none; position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.6); z-index:10000; align-items:center; justify-content:center; backdrop-filter: blur(2px);">
                    <div style="background:white; padding:30px; border-radius:15px; width:350px; font-family: sans-serif; box-shadow: 0 10px 25px rgba(0,0,0,0.1);">
                        <h2 style="margin:0 0 15px 0; color: #1e293b;">Test Settings</h2>
                        <label style="display:block; margin-bottom:15px;">
                            <span style="font-weight:600;">Question Count:</span><br>
                            <input type="number" id="setupCount" value="${poolSize}" min="1" max="${poolSize}" style="width:100%; padding:10px; margin-top:8px; border:1px solid #ddd; border-radius:6px;">
                        </label>
                        <label style="display:flex; align-items:center; margin-bottom:25px; cursor:pointer;">
                            <input type="checkbox" id="setupTimer" style="margin-right:10px; width:18px; height:18px;">
                            <span style="font-weight:600;">Enable Timer (1 min/Q)</span>
                        </label>
                        <button id="startTestBtn" style="width:100%; background:#2563eb; color:white; border:none; padding:14px; border-radius:8px; cursor:pointer; font-weight:bold; font-size:1rem;">START TEST</button>
                    </div>
                </div>`;
            document.body.insertAdjacentHTML('beforeend', modalHtml);
            setupModal = document.getElementById('setupModal');
        }
        setupModal.style.display = 'flex';
        document.getElementById('startTestBtn').onclick = () => {
            const count = parseInt(document.getElementById('setupCount').value);
            const useTimer = document.getElementById('setupTimer').checked;
            setupModal.style.display = 'none';
            onStart(count, useTimer);
        };
    },

    // Adds/Removes the Exit Test button in the sidebar
    toggleExitButton: function(show, onExit) {
        let exitBtn = document.getElementById('exitTestBtn');
        if (show) {
            if (!exitBtn) {
                const navHeader = document.querySelector('.sidebar-header') || document.getElementById('navList').parentNode;
                exitBtn = document.createElement('button');
                exitBtn.id = "exitTestBtn";
                exitBtn.innerText = "✖ Exit Test";
                exitBtn.style = "width:100%; background:#fee2e2; color:#b91c1c; border:1px solid #fecaca; padding:10px; border-radius:6px; cursor:pointer; margin-bottom:15px; font-weight:bold;";
                exitBtn.onclick = () => { if(confirm("Discard test and return to Learner mode?")) onExit(); };
                navHeader.prepend(exitBtn);
            }
        } else if (exitBtn) {
            exitBtn.remove();
        }
    }
};