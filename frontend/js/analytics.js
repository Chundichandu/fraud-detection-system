// Analytics Dashboard JavaScript

let analyticsData = {
    allTransactions: [],
    statusCounts: { approved: 0, review: 0, declined: 0 },
    countryCounts: {},
    amountRanges: { small: 0, medium: 0, large: 0, veryLarge: 0 },
    dailyData: {}
};

let charts = {};

// Check authentication and load data on page load
document.addEventListener('DOMContentLoaded', function() {
    checkAuthentication();
    loadAnalyticsData();
});

function checkAuthentication() {
    const token = localStorage.getItem('auth_token');
    const username = localStorage.getItem('username');
    
    if (!token) {
        window.location.href = 'login.html';
        return;
    }
}

async function loadAnalyticsData() {
    document.getElementById('loading').style.display = 'block';
    document.getElementById('content').style.display = 'none';
    
    const token = localStorage.getItem('auth_token');
    
    try {
        const response = await fetch('http://127.0.0.1:5000/get-history-by-date', {
            headers: {
                'Authorization': 'Bearer ' + token
            }
        });
        const historyByDate = await response.json();
        
        // Flatten data
        analyticsData.allTransactions = [];
        Object.keys(historyByDate).forEach(date => {
            historyByDate[date].forEach(transaction => {
                analyticsData.allTransactions.push(transaction);
            });
        });
        
        if (analyticsData.allTransactions.length === 0) {
            document.getElementById('content').innerHTML = '<p style="text-align: center; color: #999; padding: 40px;">No transactions found. Analyze some transactions first!</p>';
            document.getElementById('loading').style.display = 'none';
            document.getElementById('content').style.display = 'block';
            return;
        }
        
        processAnalyticsData();
        displayStatistics();
        createCharts();
        generateInsights();
        
        document.getElementById('loading').style.display = 'none';
        document.getElementById('content').style.display = 'block';
    } catch (error) {
        console.error('Error loading analytics:', error);
        document.getElementById('loading').innerHTML = '<p style="color: #f44336;">❌ Failed to load data. Make sure the backend is running!</p>';
    }
}

function processAnalyticsData() {
    const transactions = analyticsData.allTransactions;
    
    // Reset counters
    analyticsData.statusCounts = { approved: 0, review: 0, declined: 0 };
    analyticsData.countryCounts = {};
    analyticsData.amountRanges = { small: 0, medium: 0, large: 0, veryLarge: 0 };
    analyticsData.dailyData = {};
    
    transactions.forEach(tx => {
        const status = tx.result.status;
        const country = tx.input.country;
        const amount = tx.input.amount;
        const date = tx.timestamp.split('T')[0];
        
        // Status counts
        analyticsData.statusCounts[status]++;
        
        // Country counts
        if (!analyticsData.countryCounts[country]) {
            analyticsData.countryCounts[country] = 0;
        }
        analyticsData.countryCounts[country]++;
        
        // Amount ranges
        if (amount < 10000) {
            analyticsData.amountRanges.small++;
        } else if (amount < 50000) {
            analyticsData.amountRanges.medium++;
        } else if (amount < 100000) {
            analyticsData.amountRanges.large++;
        } else {
            analyticsData.amountRanges.veryLarge++;
        }
        
        // Daily data
        if (!analyticsData.dailyData[date]) {
            analyticsData.dailyData[date] = { approved: 0, review: 0, declined: 0 };
        }
        analyticsData.dailyData[date][status]++;
    });
}

function displayStatistics() {
    const total = analyticsData.allTransactions.length;
    const approved = analyticsData.statusCounts.approved;
    const review = analyticsData.statusCounts.review;
    const declined = analyticsData.statusCounts.declined;
    
    const approvedPct = ((approved / total) * 100).toFixed(1);
    const reviewPct = ((review / total) * 100).toFixed(1);
    const declinedPct = ((declined / total) * 100).toFixed(1);
    
    document.getElementById('total-stat').textContent = total;
    document.getElementById('approved-stat').textContent = approved;
    document.getElementById('approved-pct').textContent = approvedPct + '%';
    document.getElementById('review-stat').textContent = review;
    document.getElementById('review-pct').textContent = reviewPct + '%';
    document.getElementById('declined-stat').textContent = declined;
    document.getElementById('declined-pct').textContent = declinedPct + '%';
}

function createCharts() {
    const chartDefaults = {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
            legend: {
                display: true,
                position: 'bottom'
            }
        }
    };
    
    // Status Distribution Chart
    const statusCtx = document.getElementById('statusChart').getContext('2d');
    charts.status = new Chart(statusCtx, {
        type: 'doughnut',
        data: {
            labels: ['Approved', 'Under Review', 'Declined'],
            datasets: [{
                data: [
                    analyticsData.statusCounts.approved,
                    analyticsData.statusCounts.review,
                    analyticsData.statusCounts.declined
                ],
                backgroundColor: ['#4CAF50', '#ff9800', '#f44336'],
                borderColor: ['#45a049', '#f57c00', '#d32f2f'],
                borderWidth: 2
            }]
        },
        options: chartDefaults
    });
    
    // Fraud Score Distribution
    const scoreRanges = { 'Low (0-40%)': 0, 'Medium (40-75%)': 0, 'High (75-100%)': 0 };
    analyticsData.allTransactions.forEach(tx => {
        const score = tx.result.fraudScore;
        if (score < 0.4) scoreRanges['Low (0-40%)']++;
        else if (score < 0.75) scoreRanges['Medium (40-75%)']++;
        else scoreRanges['High (75-100%)']++;
    });
    
    const scoreCtx = document.getElementById('scoreChart').getContext('2d');
    charts.score = new Chart(scoreCtx, {
        type: 'bar',
        data: {
            labels: Object.keys(scoreRanges),
            datasets: [{
                label: 'Number of Transactions',
                data: Object.values(scoreRanges),
                backgroundColor: ['#4CAF50', '#ff9800', '#f44336'],
                borderColor: ['#45a049', '#f57c00', '#d32f2f'],
                borderWidth: 2
            }]
        },
        options: {
            ...chartDefaults,
            indexAxis: 'y'
        }
    });
    
    // Country Distribution
    const countries = Object.keys(analyticsData.countryCounts).sort((a, b) => analyticsData.countryCounts[b] - analyticsData.countryCounts[a]).slice(0, 8);
    const countryValues = countries.map(c => analyticsData.countryCounts[c]);
    const countryColors = ['#667eea', '#764ba2', '#f093fb', '#4facfe', '#00f2fe', '#43e97b', '#fa709a', '#fee140'];
    
    const countryCtx = document.getElementById('countryChart').getContext('2d');
    charts.country = new Chart(countryCtx, {
        type: 'bar',
        data: {
            labels: countries,
            datasets: [{
                label: 'Transactions',
                data: countryValues,
                backgroundColor: countryColors,
                borderColor: countryColors,
                borderWidth: 1
            }]
        },
        options: chartDefaults
    });
    
    // Amount Range Distribution
    const amountCtx = document.getElementById('amountChart').getContext('2d');
    charts.amount = new Chart(amountCtx, {
        type: 'pie',
        data: {
            labels: ['Small (<10K)', 'Medium (10-50K)', 'Large (50-100K)', 'Very Large (>100K)'],
            datasets: [{
                data: [
                    analyticsData.amountRanges.small,
                    analyticsData.amountRanges.medium,
                    analyticsData.amountRanges.large,
                    analyticsData.amountRanges.veryLarge
                ],
                backgroundColor: ['#81c784', '#ffb74d', '#e57373', '#ba68c8'],
                borderColor: ['#66bb6a', '#ffa726', '#ef5350', '#ab47bc'],
                borderWidth: 2
            }]
        },
        options: chartDefaults
    });
    
    // Timeline Chart - Transactions over days
    const sortedDates = Object.keys(analyticsData.dailyData).sort();
    const dailyTotals = sortedDates.map(date => {
        const day = analyticsData.dailyData[date];
        return day.approved + day.review + day.declined;
    });
    
    const timelineCtx = document.getElementById('timelineChart').getContext('2d');
    charts.timeline = new Chart(timelineCtx, {
        type: 'line',
        data: {
            labels: sortedDates.map(d => new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })),
            datasets: [{
                label: 'Total Transactions',
                data: dailyTotals,
                borderColor: '#667eea',
                backgroundColor: 'rgba(102, 126, 234, 0.1)',
                borderWidth: 2,
                tension: 0.4,
                fill: true,
                pointRadius: 4,
                pointBackgroundColor: '#667eea',
                pointHoverRadius: 6
            }]
        },
        options: {
            ...chartDefaults,
            scales: {
                y: {
                    beginAtZero: true
                }
            }
        }
    });
    
    // Average Fraud Score by Status
    const avgScores = { approved: 0, review: 0, declined: 0 };
    const statusCounts = { approved: 0, review: 0, declined: 0 };
    
    analyticsData.allTransactions.forEach(tx => {
        const status = tx.result.status;
        avgScores[status] += tx.result.fraudScore;
        statusCounts[status]++;
    });
    
    avgScores.approved = (avgScores.approved / (statusCounts.approved || 1) * 100).toFixed(1);
    avgScores.review = (avgScores.review / (statusCounts.review || 1) * 100).toFixed(1);
    avgScores.declined = (avgScores.declined / (statusCounts.declined || 1) * 100).toFixed(1);
    
    const avgCtx = document.getElementById('avgScoreChart').getContext('2d');
    charts.avgScore = new Chart(avgCtx, {
        type: 'bar',
        data: {
            labels: ['Approved', 'Under Review', 'Declined'],
            datasets: [{
                label: 'Average Fraud Score (%)',
                data: [avgScores.approved, avgScores.review, avgScores.declined],
                backgroundColor: ['#4CAF50', '#ff9800', '#f44336'],
                borderColor: ['#45a049', '#f57c00', '#d32f2f'],
                borderWidth: 2
            }]
        },
        options: {
            ...chartDefaults,
            scales: {
                y: {
                    max: 100,
                    beginAtZero: true
                }
            }
        }
    });
}

function generateInsights() {
    const container = document.getElementById('insights-container');
    const insights = [];
    
    const total = analyticsData.allTransactions.length;
    const approved = analyticsData.statusCounts.approved;
    const review = analyticsData.statusCounts.review;
    const declined = analyticsData.statusCounts.declined;
    const approvedRate = ((approved / total) * 100).toFixed(1);
    const declinedRate = ((declined / total) * 100).toFixed(1);
    
    // Insight 1: Overall fraud rate
    insights.push({
        type: declinedRate > 20 ? 'danger' : declinedRate > 10 ? 'warning' : 'success',
        text: `📊 Fraud decline rate is ${declinedRate}% (${declined} declined out of ${total} transactions). ${declinedRate > 20 ? 'This is elevated - review your risk rules!' : declinedRate < 5 ? 'Good acceptance rate.' : 'Moderate fraud detection.'}`
    });
    
    // Insight 2: Countries with most fraud
    const countryStats = Object.entries(analyticsData.countryCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3);
    
    insights.push({
        type: 'info',
        text: `🌍 Top countries by transaction volume: ${countryStats.map(([c, count]) => `${c} (${count})`).join(', ')}`
    });
    
    // Insight 3: Amount analysis
    const largeTransactions = analyticsData.amountRanges.large + analyticsData.amountRanges.veryLarge;
    const largeRate = ((largeTransactions / total) * 100).toFixed(1);
    
    insights.push({
        type: largeRate > 30 ? 'warning' : 'success',
        text: `💰 ${largeRate}% of transactions are large amounts (>50K). ${largeRate > 30 ? 'Monitor high-value transactions carefully.' : 'Good distribution of transaction sizes.'}`
    });
    
    // Insight 4: Under review percentage
    const reviewRate = ((review / total) * 100).toFixed(1);
    
    insights.push({
        type: reviewRate > 20 ? 'warning' : 'success',
        text: `⚠️ ${reviewRate}% of transactions are under review. ${reviewRate > 20 ? 'You may want to review your threshold settings.' : 'Good balance between approved and flagged transactions.'}`
    });
    
    // Insight 5: Most suspicious transaction
    const sortedByScore = analyticsData.allTransactions.sort((a, b) => b.result.fraudScore - a.result.fraudScore);
    if (sortedByScore.length > 0) {
        const highest = sortedByScore[0];
        insights.push({
            type: 'danger',
            text: `🚨 Highest fraud score: ${(highest.result.fraudScore * 100).toFixed(1)}% for transaction by ${highest.input.name} from ${highest.input.country}. Status: ${highest.result.status.toUpperCase()}`
        });
    }
    
    // Render insights
    container.innerHTML = insights.map(insight => `
        <div class="insight-item ${insight.type}">
            ${insight.text}
        </div>
    `).join('');
}

function refreshAnalytics() {
    loadAnalyticsData();
}
