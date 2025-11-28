import pandas as pd
from sklearn.preprocessing import StandardScaler, OneHotEncoder
from sklearn.compose import ColumnTransformer
from sklearn.linear_model import LogisticRegression
from sklearn.pipeline import Pipeline
import pickle

# 1. Create Sample Data (NOW WITH 10 ENHANCED FEATURES)
data = {
    'amount': [100.50, 25000.00, 80000.00, 50.00, 150000.00, 200.00, 95000.00, 45000.00, 300.00, 120000.00, 75000.00, 10.00, 500.00, 600.00, 200000.00, 5000.00],
    'country': ['IN', 'US', 'NG', 'GB', 'NG', 'IN', 'BR', 'DE', 'AU', 'BR', 'US', 'IN', 'IN', 'IN', 'NG', 'IN'],
    'ifsc_valid': [True, True, False, True, True, True, False, True, True, True, True, False, True, True, False, True],
    'account_pattern_suspicious': [False, False, True, False, True, False, False, True, False, True, False, True, False, False, True, False],
    'name_matches_account': [True, True, False, True, False, True, True, True, True, False, False, True, True, False, False, True],
    'account_name_inconsistent': [False, False, True, False, True, False, False, False, False, True, True, False, False, True, True, False],
    'high_risk_country': [False, False, True, False, True, False, False, False, False, False, False, False, False, False, True, False],
    'very_high_amount': [False, False, False, False, True, False, True, False, False, True, False, False, False, False, True, False],
    'suspicious_name_pattern': [False, False, False, False, False, True, False, False, False, False, False, False, True, False, True, False],
    'multiple_accounts_same_holder': [False, False, False, False, True, False, False, False, False, True, True, False, False, False, True, False],
    'is_fraud': [0, 0, 1, 0, 1, 0, 1, 0, 0, 1, 1, 0, 0, 1, 1, 0] # 0 = Not Fraud, 1 = Fraud
}
df = pd.DataFrame(data)

# 2. Define Features (X) and Target (y)
X = df.drop('is_fraud', axis=1) # X now has 10 columns
y = df['is_fraud']

# 3. Define Preprocessing
categorical_features = ['country']
numerical_features = ['amount']
# Add our new features to the boolean list
boolean_features = ['ifsc_valid', 'account_pattern_suspicious', 'name_matches_account', 'account_name_inconsistent', 
                    'high_risk_country', 'very_high_amount', 'suspicious_name_pattern', 'multiple_accounts_same_holder'] 

preprocessor = ColumnTransformer(
    transformers=[
        ('num', StandardScaler(), numerical_features),
        ('cat', OneHotEncoder(handle_unknown='ignore'), categorical_features),
        ('bool', 'passthrough', boolean_features) # Now passes 8 boolean features
    ],
    remainder='drop'
)

# 4. Create the ML Model Pipeline
model = Pipeline(steps=[
    ('preprocessor', preprocessor),
    ('classifier', LogisticRegression())
])

# 5. Train the Model
model.fit(X, y)

# 6. Save the Model
print("Training complete. Saving new 10-feature model file...")
with open('fraud_model.pkl', 'wb') as f:
    pickle.dump(model, f)
print("File 'fraud_model.pkl' saved successfully in 'backend' folder.")
print("\nNew Features Added:")
print("✓ High risk country detection (NG, BR prone to fraud)")
print("✓ Very high amount detection (>100k transactions)")
print("✓ Suspicious name pattern detection")
print("✓ Multiple accounts detection for same holder")