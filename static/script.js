// ================================
// DOM REFERENCES
// ================================
const uploadArea = document.getElementById('uploadArea');
const resumeInput = document.getElementById('resumeInput');
const analyseBtn = document.getElementById('analyseBtn');

// Chart instance stored globally so it can be destroyed before rebuilding
let scoreTrendChart = null;

// ================================
// HELPER FUNCTIONS
// ================================

// Returns CSS color variable based on score threshold
function getScoreColor(score) {
    if (score >= 70) return 'var(--success)';
    if (score >= 40) return 'var(--warning)';
    return 'var(--danger)';
}

// Returns CSS class name for history score badge
function getScoreClass(score) {
    if (score >= 70) return 'score-high';
    if (score >= 40) return 'score-mid';
    return 'score-low';
}

// Builds keyword tag elements and appends them to a container
function buildTags(keywords, container, type) {
    keywords.forEach(keyword => {
        const tag = document.createElement('span');
        tag.classList.add('tag', type);
        tag.textContent = keyword;
        container.appendChild(tag);
    });
}

// ================================
// ERROR HANDLING
// ================================

// Shows a friendly error message in the right panel
function showError(message) {
    const errorBanner = document.getElementById('errorBanner');
    const errorMessage = document.getElementById('errorMessage');
    errorMessage.textContent = message;
    errorBanner.style.display = 'flex';
    document.getElementById('resultsPanel').style.display = 'none';
    document.getElementById('emptyState').style.display = 'none';
}

// Hides the error banner
function hideError() {
    document.getElementById('errorBanner').style.display = 'none';
}

// ================================
// UPLOAD AREA
// ================================

// Clicking the styled upload area triggers the hidden file input
uploadArea.addEventListener('click', () => {
    resumeInput.click();
});

// When a file is selected, show its name inside the upload area
resumeInput.addEventListener('change', () => {
    const file = resumeInput.files[0];
    if (file) {
        uploadArea.classList.add('selected');
        uploadArea.innerHTML = `
            <p class="upload-hint">📄 ${file.name}</p>
            <p class="upload-hint" style="font-size:12px; margin-top:4px;">Click to change file</p>
        `;
    }
});

// ================================
// ANALYSE BUTTON
// ================================

analyseBtn.addEventListener('click', async () => {
    const file = resumeInput.files[0];
    const jobDescription = document.getElementById('jobInput').value.trim();

    hideError();

    // Frontend validation — catches obvious errors before hitting the server
    if (!file) {
        showError('Please select a PDF resume before analysing.');
        return;
    }
    if (!jobDescription) {
        showError('Please paste a job description before analysing.');
        return;
    }

    // Show loading state — prevents double clicks
    analyseBtn.textContent = 'Analysing...';
    analyseBtn.disabled = true;
    document.getElementById('loadingState').style.display = 'flex';
    document.getElementById('emptyState').style.display = 'none';

    const formData = new FormData();
    formData.append('resume', file);
    formData.append('job_description', jobDescription);

    try {
        const response = await fetch('/upload', {
            method: 'POST',
            body: formData
        });

        const data = await response.json();

        if (data.success) {
            renderResults(data.analysis);
        } else {
            showError(data.error || 'Something went wrong. Please try again.');
        }

    } catch (error) {
        showError('Could not connect to the server. Please check your connection and try again.');
    } finally {
        // Always reset button and hide spinner — runs whether request succeeded or failed
        analyseBtn.textContent = 'Analyse Resume';
        analyseBtn.disabled = false;
        document.getElementById('loadingState').style.display = 'none';
    }
});

// ================================
// RESULTS RENDERING
// ================================

// Renders all analysis result components into the right panel
function renderResults(analysis) {
    // Switch from empty state to results panel
    document.getElementById('emptyState').style.display = 'none';
    document.getElementById('resultsPanel').style.display = 'flex';

    // Summary
    document.getElementById('summaryText').textContent = analysis.summary;

    // Improvements list
    const improvementsList = document.getElementById('improvementsList');
    improvementsList.innerHTML = '';
    analysis.improvements.forEach(item => {
        const li = document.createElement('li');
        li.textContent = item;
        improvementsList.appendChild(li);
    });

    // Keyword tags
    const presentTags = document.getElementById('presentTags');
    const missingTags = document.getElementById('missingTags');
    presentTags.innerHTML = '';
    missingTags.innerHTML = '';
    buildTags(analysis.keywords.present, presentTags, 'present');
    buildTags(analysis.keywords.missing, missingTags, 'missing');

    // Section breakdown bars
    renderSections(analysis.sections);

    // Weak bullet points
    renderBullets(analysis.weak_bullets);

    // Animated match score gauge
    animateGauge(analysis.match_score);

    // Refresh history list and chart
    loadHistory();
}

// Renders the five section progress bars
function renderSections(sections) {
    const sectionsList = document.getElementById('sectionsList');
    sectionsList.innerHTML = '';

    // Explicit order ensures consistent display regardless of API response order
    const sectionOrder = ['work_experience', 'skills', 'projects', 'education', 'summary'];
    const sectionLabels = {
        work_experience: 'Work Experience',
        skills: 'Skills',
        projects: 'Projects',
        education: 'Education',
        summary: 'Summary'
    };

    sectionOrder.forEach(key => {
        const score = sections[key] ?? 0;
        const color = getScoreColor(score);

        const row = document.createElement('div');
        row.classList.add('section-row');
        row.innerHTML = `
            <span class="section-name">${sectionLabels[key]}</span>
            <div class="section-bar-track">
                <div class="section-bar-fill" style="background-color: ${color};"></div>
            </div>
            <span class="section-score">${score}</span>
        `;
        sectionsList.appendChild(row);

        // Small delay lets the browser paint the element at width 0
        // before the CSS transition animates it to the target width
        setTimeout(() => {
            row.querySelector('.section-bar-fill').style.width = `${score}%`;
        }, 100);
    });
}

// Renders weak bullet points with individual Rewrite buttons
function renderBullets(weakBullets) {
    const bulletsCard = document.getElementById('bulletsCard');
    const bulletsList = document.getElementById('bulletsList');
    bulletsList.innerHTML = '';

    if (!weakBullets || weakBullets.length === 0) {
        bulletsCard.style.display = 'none';
        return;
    }

    bulletsCard.style.display = 'flex';

    weakBullets.forEach(bullet => {
        const item = document.createElement('div');
        item.classList.add('bullet-item');
        item.innerHTML = `
            <p class="bullet-text">${bullet}</p>
            <p class="bullet-rewritten"></p>
            <button class="rewrite-btn">Rewrite</button>
        `;

        const btn = item.querySelector('.rewrite-btn');
        const bulletText = item.querySelector('.bullet-text');
        const rewrittenText = item.querySelector('.bullet-rewritten');

        // Each button manages its own loading state independently
        btn.addEventListener('click', async () => {
            btn.textContent = 'Rewriting...';
            btn.disabled = true;

            try {
                const response = await fetch('/rewrite', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ bullet: bulletText.textContent })
                });

                const data = await response.json();

                if (data.success) {
                    rewrittenText.textContent = '✓ ' + data.rewritten;
                    rewrittenText.style.display = 'block';
                    btn.textContent = 'Rewritten ✓';
                    btn.disabled = true;
                } else {
                    btn.textContent = 'Rewrite';
                    btn.disabled = false;
                    showError(data.error || 'Rewrite failed. Please try again.');
                }

            } catch (error) {
                btn.textContent = 'Rewrite';
                btn.disabled = false;
                showError('Could not connect to server. Please try again.');
            }
        });

        bulletsList.appendChild(item);
    });
}

// ================================
// GAUGE ANIMATION
// ================================

function animateGauge(score) {
    const circumference = 314; // 2 * π * r (r = 50)
    const gaugeFill = document.getElementById('gaugeFill');
    const gaugeNumber = document.getElementById('gaugeNumber');

    // Offset controls how much of the circle stroke is hidden
    const offset = circumference - (score / 100) * circumference;

    // Color reflects score quality — CSS transition handles the animation
    gaugeFill.style.stroke = getScoreColor(score);
    gaugeFill.style.strokeDashoffset = offset;

    // Count the number up from 0 to score (~60 frames at 16ms each)
    let current = 0;
    const increment = score / 60;
    const counter = setInterval(() => {
        current += increment;
        if (current >= score) {
            current = score;
            clearInterval(counter);
        }
        gaugeNumber.textContent = Math.round(current);
    }, 16);
}

// ================================
// HISTORY & CHART
// ================================

// Fetches all saved analyses from the backend and renders them
async function loadHistory() {
    try {
        const response = await fetch('/history');
        const data = await response.json();
        if (data.success) {
            renderHistory(data.analyses);
        }
    } catch (error) {
        console.error('Could not load history:', error);
    }
}

// Renders history entries in the left panel and updates the chart
function renderHistory(analyses) {
    const historyList = document.getElementById('historyList');

    if (analyses.length === 0) {
        historyList.innerHTML = '<p class="empty-state">No analyses yet.</p>';
        renderChart(analyses);
        return;
    }

    historyList.innerHTML = '';
    analyses.forEach(item => {
        const entry = document.createElement('div');
        entry.classList.add('history-entry');
        entry.innerHTML = `
            <div class="history-top">
                <span class="history-version">v${item.version}</span>
                <span class="history-score ${getScoreClass(item.match_score)}">${item.match_score}%</span>
                <button class="delete-btn" data-id="${item.id}">×</button>
            </div>
            <p class="history-job">${item.job_title}</p>
            <p class="history-time">${item.timestamp}</p>
        `;

        // Delete button — sends DELETE request then refreshes history
        const deleteBtn = entry.querySelector('.delete-btn');
        deleteBtn.addEventListener('click', async (e) => {
            e.stopPropagation(); // Prevent triggering any parent click handlers
            try {
                await fetch(`/history/${item.id}`, { method: 'DELETE' });
                loadHistory(); // Refresh list and chart after deletion
            } catch (error) {
                console.error('Could not delete entry:', error);
            }
        });

        historyList.appendChild(entry);
    });
    renderChart(analyses);
}

// Builds or rebuilds the Chart.js score trend line chart
function renderChart(analyses) {
    const chartCard = document.getElementById('chartCard');

    // Chart needs at least 2 points to show a meaningful trend
    if (analyses.length < 2) {
        chartCard.style.display = 'none';
        return;
    }

    chartCard.style.display = 'flex';

    // Reverse a copy so oldest version appears on the left
    const sorted = [...analyses].reverse();
    const labels = sorted.map(item => `v${item.version}`);
    const scores = sorted.map(item => item.match_score);

    const ctx = document.getElementById('scoreTrendChart').getContext('2d');

    // Destroy previous chart instance before creating a new one
    // Without this, charts stack on top of each other on the same canvas
    if (scoreTrendChart) {
        scoreTrendChart.destroy();
    }

    scoreTrendChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: 'Match Score',
                data: scores,
                borderColor: '#6c8bff',
                backgroundColor: 'rgba(108, 139, 255, 0.08)',
                pointBackgroundColor: '#6c8bff',
                pointRadius: 5,
                pointHoverRadius: 7,
                fill: true,
                tension: 0.4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false }
            },
            scales: {
                y: {
                    min: 0,
                    max: 100,
                    ticks: { color: '#8b91b0', stepSize: 20 },
                    grid: { color: '#2a2f45' }
                },
                x: {
                    ticks: { color: '#8b91b0' },
                    grid: { color: '#2a2f45' }
                }
            }
        }
    });
}

// ================================
// INITIALISATION
// ================================

// Load history immediately when the page opens
loadHistory();