# Database Management Module
# Handles both JSON and SQLite storage options

import sqlite3
import json
import os
from datetime import datetime

class FraudDetectionDB:
    """Unified database interface for fraud detection system"""
    
    def __init__(self, use_sqlite=True, db_path='fraud_detection.db', json_path='transaction_history.json'):
        self.use_sqlite = use_sqlite
        self.db_path = db_path
        self.json_path = json_path
        self.conn = None
        
        if use_sqlite:
            self.init_sqlite()
    
    def init_sqlite(self):
        """Initialize SQLite database with required tables"""
        try:
            self.conn = sqlite3.connect(self.db_path)
            self.conn.row_factory = sqlite3.Row
            cursor = self.conn.cursor()
            
            # Transactions table
            cursor.execute('''
                CREATE TABLE IF NOT EXISTS transactions (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    timestamp TEXT NOT NULL,
                    account_holder TEXT NOT NULL,
                    account_number TEXT NOT NULL,
                    ifsc_code TEXT NOT NULL,
                    country TEXT NOT NULL,
                    amount REAL NOT NULL,
                    fraud_score REAL NOT NULL,
                    status TEXT NOT NULL,
                    reason TEXT NOT NULL,
                    risk_factors TEXT NOT NULL,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            ''')
            
            # Users table
            cursor.execute('''
                CREATE TABLE IF NOT EXISTS users (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    username TEXT UNIQUE NOT NULL,
                    password_hash TEXT NOT NULL,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    last_login TIMESTAMP
                )
            ''')
            
            # Sessions table
            cursor.execute('''
                CREATE TABLE IF NOT EXISTS sessions (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    token TEXT UNIQUE NOT NULL,
                    username TEXT NOT NULL,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    expires_at TIMESTAMP,
                    FOREIGN KEY (username) REFERENCES users(username)
                )
            ''')
            
            self.conn.commit()
            print("✅ SQLite database initialized successfully")
        except Exception as e:
            print(f"❌ Error initializing SQLite: {e}")
            raise
    
    def save_transaction(self, timestamp, input_data, result_data):
        """Save transaction to database"""
        if self.use_sqlite:
            try:
                cursor = self.conn.cursor()
                cursor.execute('''
                    INSERT INTO transactions 
                    (timestamp, account_holder, account_number, ifsc_code, country, amount, 
                     fraud_score, status, reason, risk_factors)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ''', (
                    timestamp,
                    input_data.get('name'),
                    input_data.get('account'),
                    input_data.get('ifsc'),
                    input_data.get('country'),
                    input_data.get('amount'),
                    result_data.get('fraudScore'),
                    result_data.get('status'),
                    result_data.get('reason'),
                    json.dumps(result_data.get('riskFactors', []))
                ))
                self.conn.commit()
            except Exception as e:
                print(f"Error saving transaction to SQLite: {e}")
        else:
            # JSON fallback
            self._save_transaction_json(timestamp, input_data, result_data)
    
    def get_all_transactions(self):
        """Retrieve all transactions"""
        if self.use_sqlite:
            try:
                cursor = self.conn.cursor()
                cursor.execute('SELECT * FROM transactions ORDER BY timestamp DESC')
                rows = cursor.fetchall()
                transactions = []
                for row in rows:
                    transactions.append({
                        'timestamp': row['timestamp'],
                        'input': {
                            'name': row['account_holder'],
                            'account': row['account_number'],
                            'ifsc': row['ifsc_code'],
                            'country': row['country'],
                            'amount': row['amount']
                        },
                        'result': {
                            'fraudScore': row['fraud_score'],
                            'status': row['status'],
                            'reason': row['reason'],
                            'riskFactors': json.loads(row['risk_factors'])
                        }
                    })
                return transactions
            except Exception as e:
                print(f"Error retrieving transactions: {e}")
                return []
        else:
            return self._get_transactions_json()
    
    def get_transactions_by_date(self):
        """Get transactions grouped by date"""
        transactions = self.get_all_transactions()
        grouped = {}
        for tx in transactions:
            date = tx['timestamp'].split('T')[0]
            if date not in grouped:
                grouped[date] = []
            grouped[date].append(tx)
        return grouped
    
    def clear_all_transactions(self):
        """Clear all transactions"""
        if self.use_sqlite:
            try:
                cursor = self.conn.cursor()
                cursor.execute('DELETE FROM transactions')
                self.conn.commit()
                print("✅ All transactions cleared from SQLite")
            except Exception as e:
                print(f"Error clearing transactions: {e}")
        else:
            self._clear_transactions_json()
    
    def save_user(self, username, password_hash):
        """Save user to database"""
        if self.use_sqlite:
            try:
                cursor = self.conn.cursor()
                cursor.execute('''
                    INSERT INTO users (username, password_hash)
                    VALUES (?, ?)
                ''', (username, password_hash))
                self.conn.commit()
            except sqlite3.IntegrityError:
                raise ValueError("User already exists")
            except Exception as e:
                print(f"Error saving user: {e}")
    
    def get_user(self, username):
        """Retrieve user by username"""
        if self.use_sqlite:
            try:
                cursor = self.conn.cursor()
                cursor.execute('SELECT * FROM users WHERE username = ?', (username,))
                row = cursor.fetchone()
                if row:
                    return {
                        'username': row['username'],
                        'password_hash': row['password_hash'],
                        'created_at': row['created_at']
                    }
                return None
            except Exception as e:
                print(f"Error getting user: {e}")
                return None
    
    def get_all_users(self):
        """Retrieve all users"""
        if self.use_sqlite:
            try:
                cursor = self.conn.cursor()
                cursor.execute('SELECT username, password_hash, created_at FROM users')
                rows = cursor.fetchall()
                users = {}
                for row in rows:
                    users[row['username']] = {
                        'password_hash': row['password_hash'],
                        'created_at': row['created_at']
                    }
                return users
            except Exception as e:
                print(f"Error getting users: {e}")
                return {}
    
    def save_session(self, token, username, expires_in_hours=24):
        """Save session token"""
        if self.use_sqlite:
            try:
                expires_at = datetime.now().timestamp() + (expires_in_hours * 3600)
                cursor = self.conn.cursor()
                cursor.execute('''
                    INSERT INTO sessions (token, username, expires_at)
                    VALUES (?, ?, datetime(?, 'unixepoch'))
                ''', (token, username, expires_at))
                self.conn.commit()
            except Exception as e:
                print(f"Error saving session: {e}")
    
    def get_session(self, token):
        """Retrieve session by token"""
        if self.use_sqlite:
            try:
                cursor = self.conn.cursor()
                cursor.execute('''
                    SELECT username FROM sessions 
                    WHERE token = ? AND expires_at > datetime('now')
                ''', (token,))
                row = cursor.fetchone()
                return row['username'] if row else None
            except Exception as e:
                print(f"Error getting session: {e}")
                return None
    
    def delete_session(self, token):
        """Delete session"""
        if self.use_sqlite:
            try:
                cursor = self.conn.cursor()
                cursor.execute('DELETE FROM sessions WHERE token = ?', (token,))
                self.conn.commit()
            except Exception as e:
                print(f"Error deleting session: {e}")
    
    # JSON fallback methods
    def _save_transaction_json(self, timestamp, input_data, result_data):
        """Fallback JSON storage"""
        transaction = {
            'timestamp': timestamp,
            'input': input_data,
            'result': result_data
        }
        transactions = self._get_transactions_json()
        transactions.append(transaction)
        with open(self.json_path, 'w') as f:
            json.dump(transactions, f, indent=2)
    
    def _get_transactions_json(self):
        """Fallback JSON retrieval"""
        if os.path.exists(self.json_path):
            try:
                with open(self.json_path, 'r') as f:
                    return json.load(f)
            except:
                return []
        return []
    
    def _clear_transactions_json(self):
        """Fallback JSON clear"""
        with open(self.json_path, 'w') as f:
            json.dump([], f)
    
    def close(self):
        """Close database connection"""
        if self.conn:
            self.conn.close()

# Usage example:
# db = FraudDetectionDB(use_sqlite=True)
# db.save_transaction(datetime.now().isoformat(), input_data, result_data)
# all_transactions = db.get_all_transactions()
# db.close()
