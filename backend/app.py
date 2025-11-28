from flask import Flask, request, jsonify
from flask_cors import CORS
import pickle
import pandas as pd
import re
import json
import os
from datetime import datetime
import hashlib
import secrets

app = Flask(__name__)
CORS(app) 

# --- DATABASES ---
DUMMY_ACCOUNT_DB = {
    "123456789012": "gumma ganesh",
    "987654321012": "chandu",
    "111122223333": "john doe"
}
ACCOUNT_HISTORY = {}  # Tracks account numbers and their account holders
HOLDER_ACCOUNTS = {}  # Tracks account holders and their account numbers (detects duplicates)
NAME_VARIANTS = {}  # Tracks name variations (John vs Jon) for same person
TRANSACTION_HISTORY_FILE = 'transaction_history.json'  # File to store history
TRANSACTION_HISTORY = []  # In-memory transaction history
HIGH_RISK_COUNTRIES = ['NG', 'BR', 'PK', 'ZA', 'ID']  # Countries with higher fraud rates

# User authentication system
USERS_FILE = 'users.json'
ACTIVE_SESSIONS = {}
USERS_DB = {}
# -----------------

# Load users from file
def load_users():
    global USERS_DB
    if os.path.exists(USERS_FILE):
        try:
            with open(USERS_FILE, 'r') as f:
                USERS_DB = json.load(f)
        except:
            USERS_DB = {}
    else:
        USERS_DB = {}

# Save users to file
def save_users():
    try:
        with open(USERS_FILE, 'w') as f:
            json.dump(USERS_DB, f, indent=2)
    except Exception as e:
        print(f"Error saving users: {e}")

# Hash password
def hash_password(password):
    return hashlib.sha256(password.encode()).hexdigest()

# Load transaction history from file on startup
def load_transaction_history():
    global TRANSACTION_HISTORY
    if os.path.exists(TRANSACTION_HISTORY_FILE):
        try:
            with open(TRANSACTION_HISTORY_FILE, 'r') as f:
                TRANSACTION_HISTORY = json.load(f)
        except:
            TRANSACTION_HISTORY = []
    else:
        TRANSACTION_HISTORY = []

# Save transaction history to file
def save_transaction_history():
    try:
        with open(TRANSACTION_HISTORY_FILE, 'w') as f:
            json.dump(TRANSACTION_HISTORY, f, indent=2)
    except Exception as e:
        print(f"Error saving transaction history: {e}")

try:
    model = pickle.load(open('fraud_model.pkl', 'rb'))
    print("Model loaded successfully.")
except Exception as e:
    print(f"Error loading model: {e}")
    model = None

# Load transaction history on startup
load_transaction_history()
print(f"Loaded {len(TRANSACTION_HISTORY)} previous transactions.")

def extract_name_parts(full_name):
    """Extract first name and last name from full name"""
    parts = full_name.lower().strip().split()
    if len(parts) >= 2:
        return parts[0], parts[-1], ' '.join(parts)
    elif len(parts) == 1:
        return parts[0], '', parts[0]
    else:
        return '', '', ''

def check_name_variations(account_holder):
    """Check if this name or similar variation has been used before"""
    first_name, last_name, full_name = extract_name_parts(account_holder)
    
    name_variation_alert = None
    
    # Check if this exact name was used before
    if full_name in NAME_VARIANTS:
        return None, None  # Same exact name, not a variation
    
    # Check if any variation of this name exists (John vs Jon, etc)
    for stored_full_name, stored_account_info in NAME_VARIANTS.items():
        stored_first, stored_last, _ = extract_name_parts(stored_full_name)
        
        # Check if first/last names match but full name differs
        if first_name and stored_first:
            # Same first name but different full name?
            if first_name == stored_first and full_name != stored_full_name:
                name_variation_alert = f"⚠️ Name variation detected: Previously used '{stored_full_name}', now using '{account_holder}'"
                break
            
            # Same last name but different first name?
            if last_name and stored_last and last_name == stored_last and full_name != stored_full_name:
                name_variation_alert = f"⚠️ Suspicious: Same last name '{last_name}' with different first name. Previously: '{stored_full_name}'"
                break
    
    return name_variation_alert, full_name

def preprocess_input(data):
    ifsc_code = data.get('ifscCode', '').upper()
    account_number = data.get('accountNumber', '')
    account_holder = data.get('accountHolder', '').lower().strip()
    country = data.get('country', 'IN')
    amount = float(data.get('amount', 0))
    
    # NEW: Check for name variations
    name_variation_alert, normalized_name = check_name_variations(account_holder)
    if normalized_name:
        NAME_VARIANTS[normalized_name] = account_number
    
    ifsc_valid = bool(ifsc_code and len(ifsc_code) == 11 and re.match(r"^[A-Z]{4}0[A-Z0-9]{6}$", ifsc_code))
    account_pattern_suspicious = bool(len(account_number) < 8 or re.match(r"^(.)\1+$", account_number))
    
    name_matches_account_for_model = False 
    name_verification_comment = "Account holder could not be verified" 
    
    if account_number in DUMMY_ACCOUNT_DB:
        correct_name = DUMMY_ACCOUNT_DB[account_number].lower().strip()
        if account_holder == correct_name:
            name_matches_account_for_model = True 
            name_verification_comment = "Name verified"
        else:
            name_matches_account_for_model = False 
            name_verification_comment = "Name mismatch! Correct name is: " + DUMMY_ACCOUNT_DB[account_number]
    
    account_name_inconsistent_for_model = False 
    inconsistency_comment = "Account history consistent"
    account_name_inconsistent_detailed = ""
    
    if account_number in ACCOUNT_HISTORY:
        previous_name = ACCOUNT_HISTORY[account_number]
        if account_holder != previous_name:
            account_name_inconsistent_for_model = True 
            account_name_inconsistent_detailed = f"Previously used: '{previous_name}', now using: '{account_holder}'"
            inconsistency_comment = f"⚠️ Account name inconsistent! {account_name_inconsistent_detailed}"
    else:
        ACCOUNT_HISTORY[account_number] = account_holder

    # NEW: Detect if same person is using multiple accounts (DUPLICATE DETECTION)
    multiple_accounts_for_model = False
    duplicate_comment = "No duplicate accounts detected"
    
    if account_holder in HOLDER_ACCOUNTS:
        previous_accounts = HOLDER_ACCOUNTS[account_holder]
        if account_number not in previous_accounts:
            multiple_accounts_for_model = True
            duplicate_comment = f"🚨 ALERT: This person '{account_holder}' already has {len(previous_accounts)} other account(s): {', '.join(previous_accounts)}"
        HOLDER_ACCOUNTS[account_holder].append(account_number)
    else:
        HOLDER_ACCOUNTS[account_holder] = [account_number]

    # NEW: High-risk country detection
    high_risk_country_for_model = country in HIGH_RISK_COUNTRIES
    high_risk_country_comment = f"Country '{country}' is in high-risk fraud list" if high_risk_country_for_model else f"Country '{country}' has normal fraud risk"
    
    # NEW: Very high amount detection
    very_high_amount_for_model = amount > 100000
    very_high_amount_comment = f"⚠️ Very high amount: ₹{amount:,.2f}" if very_high_amount_for_model else f"Amount: ₹{amount:,.2f}"
    
    # NEW: Suspicious name pattern detection (too short, only numbers, repeated chars)
    suspicious_name_pattern_for_model = bool(
        len(account_holder) < 3 or 
        account_holder.isdigit() or 
        re.match(r"^(.)\1+$", account_holder) or
        not any(c.isalpha() for c in account_holder)
    )
    suspicious_name_comment = "Suspicious name pattern detected" if suspicious_name_pattern_for_model else "Name pattern appears normal"
    
    input_df = pd.DataFrame({
        'amount': [amount],
        'country': [country],
        'ifsc_valid': [ifsc_valid],
        'account_pattern_suspicious': [account_pattern_suspicious],
        'name_matches_account': [name_matches_account_for_model],
        'account_name_inconsistent': [account_name_inconsistent_for_model],
        'high_risk_country': [high_risk_country_for_model],
        'very_high_amount': [very_high_amount_for_model],
        'suspicious_name_pattern': [suspicious_name_pattern_for_model],
        'multiple_accounts_same_holder': [multiple_accounts_for_model]
    })
    
    return (input_df, ifsc_valid, not account_pattern_suspicious, 
            name_matches_account_for_model, name_verification_comment, 
            account_name_inconsistent_for_model, inconsistency_comment,
            account_name_inconsistent_detailed,
            high_risk_country_for_model, high_risk_country_comment,
            very_high_amount_for_model, very_high_amount_comment,
            suspicious_name_pattern_for_model, suspicious_name_comment,
            multiple_accounts_for_model, duplicate_comment,
            name_variation_alert)

# --- THIS FUNCTION IS NOW UPDATED WITH NEW FEATURES ---
def create_response(fraud_score, ifsc_is_valid, account_is_valid, 
                    name_matches, name_comment, 
                    is_inconsistent, inconsistency_comment,
                    account_name_inconsistent_detailed,
                    high_risk_country, high_risk_country_comment,
                    very_high_amount, very_high_amount_comment,
                    suspicious_name, suspicious_name_comment,
                    multiple_accounts, duplicate_comment,
                    name_variation_alert,
                    amount): 
    
    # 1. Get the AI's initial opinion
    if fraud_score > 0.75:
        status = 'declined'
        reason = 'Transaction automatically declined due to high fraud risk (AI Score > 75%).'
    elif fraud_score > 0.4:
        status = 'review'
        reason = 'Transaction flagged for manual review (AI Score 40-75%).'
    else:
        status = 'approved'
        reason = 'Transaction appears legitimate (AI Score < 40%).'

    # --- NEW: Apply hard-coded business rules that override AI ---
    # Rule 0: Name Variation Check (NEW!)
    if name_variation_alert:
        status = 'review'
        reason = f"⚠️ {name_variation_alert} - Transaction flagged for review."
        
    # Rule 1: Multiple accounts for same person = INSTANT DECLINE
    elif multiple_accounts:
        status = 'declined'
        reason = '⚠️ FRAUD DETECTED: This person has multiple accounts. Transaction declined immediately.'
        
    # Rule 2: Suspicious name pattern = REVIEW
    elif suspicious_name:
        status = 'review'
        reason = '⚠️ Suspicious name pattern detected. Transaction flagged for manual review.'
        
    # Rule 3: If name is bad = REVIEW
    elif not name_matches:
        status = 'review'
        reason = 'Transaction flagged for review: Account holder name could not be verified.'
            
    # Rule 4: If account history is inconsistent = DECLINE
    elif is_inconsistent:
        status = 'declined'
        reason = f'Transaction declined: {inconsistency_comment}'
        
    # Rule 5: High risk country + high amount = REVIEW
    elif high_risk_country and very_high_amount:
        status = 'review'
        reason = 'Transaction flagged: High-risk country + large amount requires manual review.'
    # -----------------------------------------------

    risk_factors = []
    
    risk_factors.append({
        "factor": "AI Model Risk Analysis",
        "risk": "High" if fraud_score > 0.75 else "Medium" if fraud_score > 0.4 else "Low",
        "comment": f"Model assigned a {(fraud_score * 100):.1f}% risk score."
    })
    
    risk_factors.append({
        "factor": "Account Name Verification",
        "risk": "Low" if name_matches else "High",
        "comment": name_comment
    })

    risk_factors.append({
        "factor": "Account Usage History",
        "risk": "High" if is_inconsistent else "Low",
        "comment": inconsistency_comment if not account_name_inconsistent_detailed else account_name_inconsistent_detailed
    })
    
    # NEW RISK FACTORS
    risk_factors.append({
        "factor": "Duplicate Accounts",
        "risk": "Critical" if multiple_accounts else "Low",
        "comment": duplicate_comment
    })
    
    # NEW: Name Variation Check
    if name_variation_alert:
        risk_factors.append({
            "factor": "Name Variation Detection",
            "risk": "High",
            "comment": name_variation_alert
        })
    
    risk_factors.append({
        "factor": "Name Pattern Analysis",
        "risk": "High" if suspicious_name else "Low",
        "comment": suspicious_name_comment
    })
    
    risk_factors.append({
        "factor": "Geographic Risk",
        "risk": "High" if high_risk_country else "Low",
        "comment": high_risk_country_comment
    })

    risk_factors.append({
        "factor": "Transaction Amount",
        "risk": "Critical" if very_high_amount else ("High" if amount > 50000 else "Medium" if amount > 10000 else "Low"),
        "comment": very_high_amount_comment
    })
    
    risk_factors.append({
        "factor": "IFSC Code Validation",
        "risk": "Low" if ifsc_is_valid else "High",
        "comment": "IFSC format valid" if ifsc_is_valid else "Invalid IFSC code format/length"
    })
    
    risk_factors.append({
        "factor": "Account Number Validation",
        "risk": "Low" if account_is_valid else "Medium",
        "comment": "Account format OK" if account_is_valid else "Suspicious account number pattern"
    })

    return {
        'fraudScore': fraud_score,
        'status': status,
        'reason': reason,
        'riskFactors': risk_factors
    }
# ------------------------------------------------

@app.route('/analyze', methods=['POST'])
def analyze_transaction():
    if not model:
        return jsonify({"error": "Model is not loaded"}), 500
        
    try:
        data = request.json
        amount = float(data.get('amount', 0))
        
        (input_df, ifsc_is_valid, account_is_valid, 
         name_matches_for_model, name_comment, 
         is_inconsistent_for_model, inconsistency_comment,
         account_name_inconsistent_detailed,
         high_risk_country, high_risk_country_comment,
         very_high_amount, very_high_amount_comment,
         suspicious_name, suspicious_name_comment,
         multiple_accounts, duplicate_comment,
         name_variation_alert) = preprocess_input(data)
        
        fraud_score = model.predict_proba(input_df)[0][1] 
        
        response = create_response(fraud_score, ifsc_is_valid, account_is_valid, 
                                   name_matches_for_model, name_comment, 
                                   is_inconsistent_for_model, inconsistency_comment,
                                   account_name_inconsistent_detailed,
                                   high_risk_country, high_risk_country_comment,
                                   very_high_amount, very_high_amount_comment,
                                   suspicious_name, suspicious_name_comment,
                                   multiple_accounts, duplicate_comment,
                                   name_variation_alert,
                                   amount)
        
        # NEW: Save transaction to history with timestamp
        transaction_record = {
            'timestamp': datetime.now().isoformat(),
            'input': data,
            'result': response
        }
        TRANSACTION_HISTORY.append(transaction_record)
        save_transaction_history()
        
        return jsonify(response)

    except Exception as e:
        print(f"Error during analysis: {e}")
        return jsonify({"error": "An error occurred during analysis"}), 500

@app.route('/reset-history', methods=['POST'])
def reset_history():
    global ACCOUNT_HISTORY, HOLDER_ACCOUNTS, NAME_VARIANTS, TRANSACTION_HISTORY
    ACCOUNT_HISTORY = {}
    HOLDER_ACCOUNTS = {}
    NAME_VARIANTS = {}
    TRANSACTION_HISTORY = []
    # Clear the history file
    try:
        if os.path.exists(TRANSACTION_HISTORY_FILE):
            os.remove(TRANSACTION_HISTORY_FILE)
    except:
        pass
    print("--- All history reset ---")
    return jsonify({"status": "All history cleared"})

@app.route('/get-history', methods=['GET'])
def get_history():
    """Return all transaction history"""
    return jsonify(TRANSACTION_HISTORY)

@app.route('/get-history-by-date', methods=['GET'])
def get_history_by_date():
    """Return transaction history grouped by date"""
    history_by_date = {}
    for transaction in TRANSACTION_HISTORY:
        # Extract date from ISO timestamp
        timestamp = transaction.get('timestamp', '')
        date = timestamp.split('T')[0] if timestamp else 'Unknown'
        
        if date not in history_by_date:
            history_by_date[date] = []
        history_by_date[date].append(transaction)
    
    return jsonify(history_by_date)

# ===== USER AUTHENTICATION ENDPOINTS =====

@app.route('/auth/register', methods=['POST'])
def register():
    """Register a new user"""
    try:
        data = request.json
        username = data.get('username', '').strip()
        password = data.get('password', '').strip()
        
        if not username or not password:
            return jsonify({"error": "Username and password required"}), 400
        
        if len(password) < 4:
            return jsonify({"error": "Password must be at least 4 characters"}), 400
        
        if username in USERS_DB:
            return jsonify({"error": "Username already exists"}), 400
        
        USERS_DB[username] = {
            'password_hash': hash_password(password),
            'created_at': datetime.now().isoformat()
        }
        save_users()
        
        return jsonify({"status": "User registered successfully", "username": username}), 201
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/auth/login', methods=['POST'])
def login():
    """Login user and get session token"""
    try:
        data = request.json
        username = data.get('username', '').strip()
        password = data.get('password', '').strip()
        
        if not username or not password:
            return jsonify({"error": "Username and password required"}), 400
        
        if username not in USERS_DB:
            return jsonify({"error": "Invalid username or password"}), 401
        
        user = USERS_DB[username]
        if user['password_hash'] != hash_password(password):
            return jsonify({"error": "Invalid username or password"}), 401
        
        # Generate session token
        token = secrets.token_urlsafe(32)
        ACTIVE_SESSIONS[token] = {
            'username': username,
            'created_at': datetime.now().isoformat()
        }
        
        return jsonify({
            "status": "Login successful",
            "token": token,
            "username": username
        }), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/auth/logout', methods=['POST'])
def logout():
    """Logout user"""
    try:
        token = request.headers.get('Authorization', '').replace('Bearer ', '')
        if token in ACTIVE_SESSIONS:
            del ACTIVE_SESSIONS[token]
        return jsonify({"status": "Logged out successfully"}), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/auth/verify', methods=['GET'])
def verify_token():
    """Verify if token is valid"""
    try:
        token = request.headers.get('Authorization', '').replace('Bearer ', '')
        if token in ACTIVE_SESSIONS:
            return jsonify({
                "valid": True,
                "username": ACTIVE_SESSIONS[token]['username']
            }), 200
        return jsonify({"valid": False}), 401
    except Exception as e:
        return jsonify({"error": str(e)}), 500

# Load initial data
load_users()
load_transaction_history()

# Create demo account if it doesn't exist
if 'demo' not in USERS_DB:
    USERS_DB['demo'] = {
        'password_hash': hash_password('demo123'),
        'created_at': datetime.now().isoformat()
    }
    save_users()
    print("✅ Created demo account (demo/demo123)")

print(f"Loaded {len(USERS_DB)} users and {len(TRANSACTION_HISTORY)} transactions")

if __name__ == '__main__':
    print("Starting Flask server at http://127.0.0.1:5000")
    app.run(debug=False, port=5000, use_reloader=False)