let transactions = [];

// Check authentication on page load
document.addEventListener('DOMContentLoaded', function() {
    checkAuthentication();
});

function checkAuthentication() {
    const token = localStorage.getItem('auth_token');
    const username = localStorage.getItem('username');
    
    if (!token) {
        window.location.href = 'login.html';
        return;
    }
    
    // Display user info
    const userInfo = document.getElementById('user-info');
    if (userInfo && username) {
        userInfo.textContent = '👤 ' + username;
    }
}

function logout() {
    const token = localStorage.getItem('auth_token');
    
    // Call logout endpoint
    fetch('http://127.0.0.1:5000/auth/logout', {
        method: 'POST',
        headers: {
            'Authorization': 'Bearer ' + token
        }
    }).finally(() => {
        // Clear localStorage and redirect
        localStorage.removeItem('auth_token');
        localStorage.removeItem('username');
        window.location.href = 'login.html';
    });
}

// AI Analysis function - NOW CALLS THE BACKEND API
async function analyzeTransaction(formData) {
    const token = localStorage.getItem('auth_token');
    
    // This sends the form data to your Python API
    const response = await fetch('http://127.0.0.1:5000/analyze', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + token
        },
        body: JSON.stringify(formData)
    });

    if (response.status === 401) {
        localStorage.removeItem('auth_token');
        window.location.href = 'login.html';
        throw new Error('Session expired');
    }

    if (!response.ok) {
        throw new Error(`API request failed with status ${response.status}`);
    }

    const result = await response.json();
    return result;
}

// Display result
function displayResult(result, formData) {
    const resultDiv = document.getElementById('result');
    const statusText = result.status === 'approved' ? 'APPROVED ✅' : 
                       result.status === 'review' ? 'REVIEW REQUIRED ⚠️' : 'DECLINED ❌';
    
    resultDiv.innerHTML = `
        <div class="result ${result.status}">
            <h3>${statusText}</h3>
            <p>${result.reason}</p>
            <div class="risk-score">Risk Score: ${(result.fraudScore * 100).toFixed(1)}%</div>
        </div>
    `;
    resultDiv.style.display = 'block';

    addTransactionToHistory(formData, result);
}

// Add to transaction history
function addTransactionToHistory(formData, result) {
    const transaction = {
        id: Date.now(),
        timestamp: new Date().toLocaleString(),
        formData: formData,
        result: result
    };
    
    transactions.unshift(transaction);
    updateTransactionDisplay();
}

// Update transaction display
function updateTransactionDisplay() {
    const listDiv = document.getElementById('transactionList');
    
    if (transactions.length === 0) {
        listDiv.innerHTML = '<div class="no-transactions">No transactions analyzed yet.</div>';
        return;
    }

    listDiv.innerHTML = transactions.map(tx => `
        <div class="transaction-item">
            <div class="transaction-header">
                <span class="transaction-status ${tx.result.status}">
                    ${tx.result.status.toUpperCase()}
                </span>
                <span>${tx.timestamp}</span>
            </div>
            <div class="transaction-details">
                <div class="detail-item"><strong>To:</strong> ${tx.formData.accountHolder}</div>
                <div class="detail-item"><strong>Amount:</strong> ₹${parseFloat(tx.formData.amount).toLocaleString()}</div>
                <div class="detail-item"><strong>Country:</strong> ${tx.formData.country}</div>
                <div class="detail-item"><strong>Risk:</strong> ${(tx.result.fraudScore * 100).toFixed(1)}%</div>
            </div>
            <p><em>${tx.result.reason}</em></p>
            <div class="risk-factors">
                <h4>Risk Factor Analysis:</h4>
                ${tx.result.riskFactors.map(factor => `
                    <div class="risk-factor">
                        <span><strong>${factor.factor}:</strong> ${factor.comment}</span>
                        <span class="risk-level ${factor.risk.toLowerCase()}">${factor.risk}</span>
                    </div>
                `).join('')}
            </div>
        </div>
    `).join('');
}

// Form submission
document.getElementById('paymentForm').addEventListener('submit', async function(e) {
    e.preventDefault();
    
    const formData = {
        accountHolder: document.getElementById('accountHolder').value,
        accountNumber: document.getElementById('accountNumber').value,
        ifscCode: document.getElementById('ifscCode').value,
        country: document.getElementById('country').value,
        amount: document.getElementById('amount').value
    };

    document.getElementById('loading').style.display = 'block';
    document.getElementById('result').style.display = 'none';
    document.querySelector('.submit-btn').disabled = true;

    try {
        const result = await analyzeTransaction(formData);
        displayResult(result, formData);
        
        this.reset();
    } catch (error) {
        console.error('Analysis error:', error);
        document.getElementById('result').innerHTML = `
            <div class="result declined">
                <h3>SYSTEM ERROR ❌</h3>
                <p>Could not connect to the analysis server. Make sure the backend is running.</p>
            </div>
        `;
        document.getElementById('result').style.display = 'block';
    } finally {
        document.getElementById('loading').style.display = 'none';
        document.querySelector('.submit-btn').disabled = false;
    }
});