let allTransactions = [];
let filteredTransactions = [];
let lastTransactionCount = 0;
let autoRefreshInterval = null;

// Check authentication and load history on page load
document.addEventListener('DOMContentLoaded', function() {
    checkAuthentication();
    loadHistory();
    setupEventListeners();
    startAutoRefresh(); // Start polling for new transactions
});

function checkAuthentication() {
    const token = localStorage.getItem('auth_token');
    const username = localStorage.getItem('username');
    
    if (!token) {
        window.location.href = 'login.html';
        return;
    }
    
    // Display user info in history page header if available
    const userInfo = document.getElementById('user-info');
    if (userInfo && username) {
        userInfo.textContent = '👤 ' + username;
    }
}

function setupEventListeners() {
    const statusFilterEl = document.getElementById('status-filter');
    if (statusFilterEl) {
        statusFilterEl.addEventListener('change', function(e) {
            console.log(`📊 Status filter changed to: "${e.target.value}"`);
            filterHistory();
        });
    }
    
    document.getElementById('search-input').addEventListener('input', (e) => {
        saveSearch(e.target.value);
        filterHistory();
    });
    
    document.getElementById('sort-by').addEventListener('change', filterHistory);
    document.getElementById('date-from').addEventListener('change', filterHistory);
    document.getElementById('date-to').addEventListener('change', filterHistory);
    
    // DO NOT set date filters by default - show ALL transactions
    // User can filter if they want, but default should be "all time"
    const today = new Date().toISOString().split('T')[0];
    // Leave date filters empty so all transactions are shown by default
    // document.getElementById('date-from').value = today;
    // document.getElementById('date-to').value = today;
    
    // Load and display recent searches
    updateSearchSuggestions();
    
    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => {
        // Ctrl+F or Cmd+F: Focus search
        if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
            e.preventDefault();
            document.getElementById('search-input').focus();
        }
        
        // Escape: Clear search
        if (e.key === 'Escape') {
            clearSearch();
        }
        
        // Ctrl+L: Clear all filters
        if ((e.ctrlKey || e.metaKey) && e.key === 'l') {
            e.preventDefault();
            clearDateFilters();
            clearSearch();
            document.getElementById('status-filter').value = '';
        }
    });
    
    console.log("💡 Keyboard shortcuts loaded:");
    console.log("  Ctrl+F / Cmd+F : Focus search");
    console.log("  Escape        : Clear search");
    console.log("  Ctrl+L / Cmd+L: Clear all filters");
}

async function loadHistory() {
    const token = localStorage.getItem('auth_token');
    
    try {
        const response = await fetch('http://127.0.0.1:5000/get-history-by-date', {
            headers: {
                'Authorization': 'Bearer ' + token
            }
        });
        
        if (response.status === 401) {
            localStorage.removeItem('auth_token');
            window.location.href = 'login.html';
            return;
        }
        
        const historyByDate = await response.json();
        
        allTransactions = [];
        
        // Flatten the grouped data
        Object.keys(historyByDate).forEach(date => {
            historyByDate[date].forEach(transaction => {
                allTransactions.push(transaction);
            });
        });
        
        // Sort by timestamp (newest first)
        allTransactions.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
        
        populateDateFilter();
        displayHistory();
        updateSummaryStats();
    } catch (error) {
        console.error('Error loading history:', error);
        displayEmptyState();
    }
}

function populateDateFilter() {
    // New date pickers use HTML5 date input
    // This function is no longer needed but kept for compatibility
    // The date filtering is now handled in filterHistory() function
}

function displayHistory() {
    const container = document.getElementById('history-by-date');
    const emptyMessage = document.getElementById('empty-message');
    
    if (filteredTransactions.length === 0) {
        container.innerHTML = '';
        emptyMessage.style.display = 'block';
        return;
    }
    
    emptyMessage.style.display = 'none';
    container.innerHTML = '';
    
    // Group by date
    const groupedByDate = {};
    filteredTransactions.forEach(transaction => {
        const date = transaction.timestamp.split('T')[0];
        if (!groupedByDate[date]) {
            groupedByDate[date] = [];
        }
        groupedByDate[date].push(transaction);
    });
    
    // Sort dates (newest first)
    const sortedDates = Object.keys(groupedByDate).sort().reverse();
    
    sortedDates.forEach(date => {
        const dateGroup = document.createElement('div');
        dateGroup.className = 'date-group';
        
        const dateHeader = document.createElement('div');
        dateHeader.className = 'date-header';
        dateHeader.innerHTML = `
            <h2>${formatDate(date)}</h2>
            <div class="transaction-count">${groupedByDate[date].length} transactions</div>
        `;
        dateGroup.appendChild(dateHeader);
        
        // Sort transactions by time (newest first)
        groupedByDate[date].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
        
        groupedByDate[date].forEach((transaction, index) => {
            const card = createTransactionCard(transaction, index);
            dateGroup.appendChild(card);
        });
        
        container.appendChild(dateGroup);
    });
}

function createTransactionCard(transaction, index) {
    const input = transaction.input;
    const result = transaction.result;
    const timestamp = new Date(transaction.timestamp);
    
    const card = document.createElement('div');
    card.className = `transaction-card ${result.status}`;
    
    const statusEmoji = result.status === 'approved' ? '✅' : result.status === 'review' ? '⚠️' : '❌';
    const fraudScore = (result.fraudScore * 100).toFixed(1);
    const scoreClass = result.fraudScore < 0.4 ? 'low' : result.fraudScore < 0.75 ? 'medium' : 'high';
    
    card.innerHTML = `
        <div class="transaction-card-top">
            <div class="card-left">
                <div class="card-time">${formatTime(timestamp)}</div>
                <div class="card-name">${input.name || 'N/A'}</div>
            </div>
            <div class="card-right">
                <div class="card-status ${result.status}">${statusEmoji} ${result.status.toUpperCase()}</div>
                <div class="card-score ${scoreClass}">${fraudScore}%</div>
            </div>
        </div>
        
        <div class="transaction-card-middle">
            <div class="card-detail">
                <span class="detail-label">Account:</span>
                <span class="detail-value">${input.account || 'N/A'}</span>
            </div>
            <div class="card-detail">
                <span class="detail-label">Amount:</span>
                <span class="detail-value amount">₹${parseFloat(input.amount || 0).toLocaleString('en-IN')}</span>
            </div>
            <div class="card-detail">
                <span class="detail-label">Country:</span>
                <span class="detail-value">${input.country || 'N/A'}</span>
            </div>
            <div class="card-detail">
                <span class="detail-label">IFSC:</span>
                <span class="detail-value">${input.ifsc || 'N/A'}</span>
            </div>
        </div>
        
        <div class="transaction-card-reason">
            <span class="reason-label">📋 Decision:</span>
            <span class="reason-text">${result.reason}</span>
            <button class="btn-copy-details" onclick="copyTransactionDetails(event, '${input.name}', '${result.status}', '${(result.fraudScore * 100).toFixed(1)}%')" title="Copy details">📋 Copy</button>
        </div>
        
        <div class="transaction-card-risks">
            <div class="risks-header">🎯 Risk Factors</div>
            <div class="risks-grid">
                ${result.riskFactors.slice(0, 6).map(f => `
                    <div class="risk-badge ${f.risk.toLowerCase()}">
                        <div class="risk-name">${f.factor}</div>
                        <div class="risk-level">${f.risk}</div>
                    </div>
                `).join('')}
            </div>
        </div>
        
        <button class="toggle-details" onclick="toggleDetails(this)">▼ Details (${result.riskFactors.length} factors)</button>
        
        <div class="details-expanded" style="display: none;">
            <div class="all-risks-detail">
                ${result.riskFactors.map(f => `
                    <div class="risk-detail-item ${f.risk.toLowerCase()}">
                        <div class="risk-detail-name">${f.factor}</div>
                        <div class="risk-detail-level">${f.risk}</div>
                        <div class="risk-detail-comment">${f.comment}</div>
                    </div>
                `).join('')}
            </div>
        </div>
    `;
    
    return card;
}

function toggleDetails(button) {
    const details = button.nextElementSibling;
    const isExpanded = details.style.display !== 'none';
    
    if (isExpanded) {
        details.style.display = 'none';
        button.textContent = button.textContent.replace('▲', '▼');
    } else {
        details.style.display = 'block';
        button.textContent = button.textContent.replace('▼', '▲');
    }
}

function filterHistory() {
    const searchTerm = document.getElementById('search-input').value.toLowerCase();
    const statusFilter = document.getElementById('status-filter').value;
    const dateFrom = document.getElementById('date-from').value;
    const dateTo = document.getElementById('date-to').value;
    
    console.log(`🔍 Filtering with: search="${searchTerm}", status="${statusFilter}", dateFrom="${dateFrom}", dateTo="${dateTo}"`);
    
    filteredTransactions = allTransactions.filter(transaction => {
        const input = transaction.input;
        const result = transaction.result;
        const transactionDate = transaction.timestamp.split('T')[0];
        
        // Enhanced search filter - searches across all fields
        const matchesSearch = !searchTerm || 
            (input.name && input.name.toLowerCase().includes(searchTerm)) ||
            (input.account && input.account.toLowerCase().includes(searchTerm)) ||
            (input.country && input.country.toLowerCase().includes(searchTerm)) ||
            (input.ifsc && input.ifsc.toLowerCase().includes(searchTerm)) ||
            (input.amount && input.amount.toString().includes(searchTerm)) ||
            (result.reason && result.reason.toLowerCase().includes(searchTerm)) ||
            // Search in risk factors too
            (result.riskFactors && result.riskFactors.some(f => 
                f.factor.toLowerCase().includes(searchTerm) || 
                f.comment.toLowerCase().includes(searchTerm)
            ));
        
        // Status filter - FIXED: ensure proper matching
        const transactionStatus = result.status ? result.status.toLowerCase().trim() : '';
        const filterStatus = statusFilter ? statusFilter.toLowerCase().trim() : '';
        const matchesStatus = !filterStatus || transactionStatus === filterStatus;
        
        // Date range filter
        const matchesDateRange = (!dateFrom || transactionDate >= dateFrom) &&
                                 (!dateTo || transactionDate <= dateTo);
        
        return matchesSearch && matchesStatus && matchesDateRange;
    });
    
    // SORTING
    const sortBy = document.getElementById('sort-by')?.value || 'date-desc';
    
    filteredTransactions.sort((a, b) => {
        switch(sortBy) {
            case 'date-asc':
                return new Date(a.timestamp) - new Date(b.timestamp);
            case 'date-desc':
                return new Date(b.timestamp) - new Date(a.timestamp);
            case 'score-asc':
                return a.result.fraudScore - b.result.fraudScore;
            case 'score-desc':
                return b.result.fraudScore - a.result.fraudScore;
            case 'amount-asc':
                return a.input.amount - b.input.amount;
            case 'amount-desc':
                return b.input.amount - a.input.amount;
            default:
                return 0;
        }
    });
    
    // Update results counter with filtering status
    const displayedCount = filteredTransactions.length;
    const totalCount = allTransactions.length;
    document.getElementById('results-shown').textContent = displayedCount;
    document.getElementById('results-total').textContent = totalCount;
    
    // Log filter results
    const approvedCount = filteredTransactions.filter(t => t.result.status === 'approved').length;
    const reviewCount = filteredTransactions.filter(t => t.result.status === 'review').length;
    const declinedCount = filteredTransactions.filter(t => t.result.status === 'declined').length;
    
    console.log(`✅ Filter Results: ${displayedCount}/${totalCount} (${approvedCount} approved, ${reviewCount} review, ${declinedCount} declined)`);
    
    displayHistory();
    
    // Update daily summary whenever filters change
    updateDailySummary();
}

function updateSummaryStats() {
    const total = allTransactions.length;
    const approved = allTransactions.filter(tx => tx.result.status === 'approved').length;
    const review = allTransactions.filter(tx => tx.result.status === 'review').length;
    const declined = allTransactions.filter(tx => tx.result.status === 'declined').length;
    
    const approvedPct = total ? ((approved/total)*100).toFixed(1) : 0;
    const reviewPct = total ? ((review/total)*100).toFixed(1) : 0;
    const declinedPct = total ? ((declined/total)*100).toFixed(1) : 0;
    
    // Update overall statistics
    const totalEl = document.getElementById('total-count');
    const approvedEl = document.getElementById('approved-count');
    const reviewEl = document.getElementById('review-count');
    const declinedEl = document.getElementById('declined-count');
    
    if (totalEl) totalEl.textContent = total;
    if (approvedEl) approvedEl.textContent = approved;
    if (reviewEl) reviewEl.textContent = review;
    if (declinedEl) declinedEl.textContent = declined;
    
    // Update percentages
    const approvedTrendEl = document.getElementById('approved-trend');
    const reviewTrendEl = document.getElementById('review-trend');
    const declinedTrendEl = document.getElementById('declined-trend');
    
    if (approvedTrendEl) approvedTrendEl.textContent = `(${approvedPct}%)`;
    if (reviewTrendEl) reviewTrendEl.textContent = `(${reviewPct}%)`;
    if (declinedTrendEl) declinedTrendEl.textContent = `(${declinedPct}%)`;
    
    // Always update daily summary independently
    updateDailySummary();
    
    console.log(`📊 Overall Summary: ${total} total transactions (${approved} approved, ${review} under review, ${declined} declined)`);
}

async function refreshHistory() {
    const button = event.target;
    button.disabled = true;
    button.style.opacity = '0.6';
    
    allTransactions = [];
    filteredTransactions = [];
    document.getElementById('date-filter').innerHTML = '<option value="">All Dates</option>';
    
    await loadHistory();
    
    button.disabled = false;
    button.style.opacity = '1';
}

async function clearAllHistory() {
    if (confirm('Are you sure you want to clear all transaction history? This cannot be undone.')) {
        try {
            const response = await fetch('http://127.0.0.1:5000/reset-history', {
                method: 'POST'
            });
            
            if (response.ok) {
                allTransactions = [];
                filteredTransactions = [];
                displayHistory();
                updateSummaryStats();
                alert('All history cleared successfully!');
            }
        } catch (error) {
            console.error('Error clearing history:', error);
            alert('Failed to clear history');
        }
    }
}

function displayEmptyState() {
    const container = document.getElementById('history-by-date');
    const emptyMessage = document.getElementById('empty-message');
    
    container.innerHTML = '';
    emptyMessage.style.display = 'block';
}

function formatDate(dateString) {
    const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
    return new Date(dateString + 'T00:00:00').toLocaleDateString('en-US', options);
}

function formatTime(timestamp) {
    return timestamp.toLocaleTimeString('en-US', { 
        hour: '2-digit', 
        minute: '2-digit', 
        second: '2-digit',
        hour12: true 
    });
}

function clearDateFilters() {
    document.getElementById('date-from').value = '';
    document.getElementById('date-to').value = '';
    filterHistory();
}

function clearSearch() {
    document.getElementById('search-input').value = '';
    filterHistory();
}

// ===== NEW FEATURES: Export, Daily Summary, Search History, Copy, Analytics =====

// 6️⃣ Export to CSV
function exportToCSV() {
    if (allTransactions.length === 0) {
        alert('❌ No transactions to export');
        return;
    }
    
    // Create CSV header
    let csv = 'Date,Time,Name,Account,Amount,Country,IFSC,Fraud Score,Status,Reason\n';
    
    // Add rows
    allTransactions.forEach(tx => {
        const date = new Date(tx.timestamp);
        const dateStr = date.toLocaleDateString();
        const timeStr = date.toLocaleTimeString();
        const name = tx.input.name.replace(/"/g, '""');
        const reason = (tx.result.reason || '').replace(/"/g, '""');
        const score = (tx.result.fraudScore * 100).toFixed(1);
        
        csv += `"${dateStr}","${timeStr}","${name}","${tx.input.account}",${tx.input.amount},"${tx.input.country}","${tx.input.ifsc}",${score},"${tx.result.status}","${reason}"\n`;
    });
    
    // Download file
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `fraud-transactions-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
    
    alert(`✅ Exported ${allTransactions.length} transactions to CSV`);
}

// 7️⃣ Daily Summary
function updateDailySummary() {
    // Always show today's data regardless of current filters
    const today = new Date().toISOString().split('T')[0];
    
    // Filter from ALL transactions, not filtered ones
    const todayTx = allTransactions.filter(tx => {
        const txDate = tx.timestamp.split('T')[0];
        return txDate === today;
    });
    
    const approved = todayTx.filter(t => t.result.status === 'approved').length;
    const review = todayTx.filter(t => t.result.status === 'review').length;
    const declined = todayTx.filter(t => t.result.status === 'declined').length;
    
    const avgScore = todayTx.length > 0
        ? (todayTx.reduce((sum, t) => sum + t.result.fraudScore, 0) / todayTx.length * 100).toFixed(1)
        : 0;
    
    // Update today's summary elements
    const todayCountEl = document.getElementById('today-count');
    const todayApprovedEl = document.getElementById('today-approved');
    const todayReviewEl = document.getElementById('today-review');
    const todayDeclinedEl = document.getElementById('today-declined');
    const todayAvgScoreEl = document.getElementById('today-avg-score');
    
    if (todayCountEl) todayCountEl.textContent = todayTx.length;
    if (todayApprovedEl) todayApprovedEl.textContent = approved;
    if (todayReviewEl) todayReviewEl.textContent = review;
    if (todayDeclinedEl) todayDeclinedEl.textContent = declined;
    if (todayAvgScoreEl) todayAvgScoreEl.textContent = avgScore + '%';
    
    console.log(`📅 Daily Summary Updated: ${todayTx.length} transactions today (${approved} approved, ${review} review, ${declined} declined)`);
}

// 8️⃣ Recent Searches
const MAX_RECENT_SEARCHES = 5;

function loadRecentSearches() {
    const searches = JSON.parse(localStorage.getItem('recentSearches')) || [];
    return searches;
}

function saveSearch(term) {
    if (!term.trim()) return;
    
    let searches = loadRecentSearches();
    searches = searches.filter(s => s !== term);
    searches.unshift(term);
    searches = searches.slice(0, MAX_RECENT_SEARCHES);
    
    localStorage.setItem('recentSearches', JSON.stringify(searches));
    updateSearchSuggestions();
}

function updateSearchSuggestions() {
    const searches = loadRecentSearches();
    const container = document.getElementById('recent-searches');
    
    if (container) {
        if (searches.length === 0) {
            container.innerHTML = '';
            return;
        }
        container.innerHTML = searches
            .map(s => `<span class="search-tag" onclick="document.getElementById('search-input').value='${s}'; filterHistory();">${s}</span>`)
            .join('');
    }
}

// 4️⃣ Copy Transaction Details
function copyTransactionDetails(event, name, status, score) {
    event.stopPropagation();
    const text = `
Transaction Details
-------------------
Name: ${name}
Status: ${status.toUpperCase()}
Fraud Score: ${score}
Timestamp: ${new Date().toLocaleString()}
    `.trim();
    
    navigator.clipboard.writeText(text).then(() => {
        const btn = event.target;
        const originalText = btn.textContent;
        btn.textContent = '✅ Copied!';
        setTimeout(() => {
            btn.textContent = originalText;
        }, 2000);
    }).catch(err => {
        alert('Failed to copy: ' + err);
    });
}

// ========== AUTO-REFRESH & REAL-TIME UPDATES ==========

function startAutoRefresh() {
    // Check for new transactions every 2 seconds
    autoRefreshInterval = setInterval(async () => {
        await checkForNewTransactions();
    }, 2000);
    
    console.log('🔄 Real-time auto-refresh started (checking every 2 seconds)');
}

function stopAutoRefresh() {
    if (autoRefreshInterval) {
        clearInterval(autoRefreshInterval);
        autoRefreshInterval = null;
        console.log('⏹️ Auto-refresh stopped');
    }
}

async function checkForNewTransactions() {
    const token = localStorage.getItem('auth_token');
    
    try {
        const response = await fetch('http://127.0.0.1:5000/get-history-by-date', {
            headers: {
                'Authorization': 'Bearer ' + token
            }
        });
        
        if (response.status === 401) {
            stopAutoRefresh();
            localStorage.removeItem('auth_token');
            window.location.href = 'login.html';
            return;
        }
        
        const historyByDate = await response.json();
        
        let newTransactions = [];
        Object.keys(historyByDate).forEach(date => {
            historyByDate[date].forEach(transaction => {
                newTransactions.push(transaction);
            });
        });
        
        // Check if new transactions were added
        if (newTransactions.length > lastTransactionCount) {
            console.log(`✨ New transaction detected! ${lastTransactionCount} → ${newTransactions.length}`);
            
            allTransactions = newTransactions;
            lastTransactionCount = newTransactions.length;
            
            // Re-apply filters with new data
            filterHistory();
            
            // Update overall summary
            updateSummaryStats();
            
            // Update daily summary (this is the key fix!)
            updateDailySummary();
            
            // Flash notification
            flashUpdateNotification();
        }
    } catch (error) {
        console.error('Error checking for new transactions:', error);
    }
}

function flashUpdateNotification() {
    // Create a temporary notification that the page was updated
    const notification = document.createElement('div');
    notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        color: white;
        padding: 12px 20px;
        border-radius: 5px;
        font-weight: bold;
        z-index: 10000;
        animation: slideIn 0.3s ease-in-out;
        box-shadow: 0 4px 12px rgba(0,0,0,0.15);
    `;
    notification.textContent = '✨ Page updated with new transaction!';
    document.body.appendChild(notification);
    
    setTimeout(() => {
        notification.style.animation = 'slideOut 0.3s ease-in-out';
        setTimeout(() => notification.remove(), 300);
    }, 3000);
}

// Stop auto-refresh when user leaves the page
window.addEventListener('beforeunload', stopAutoRefresh);
window.addEventListener('pagehide', stopAutoRefresh);

