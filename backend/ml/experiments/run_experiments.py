"""
run_experiments.py - Second-Level Validation & Model Architecture Experiments
Investigates extreme demand cases, promotional interactions, historical context,
and tests experimental Log-Target and Poisson XGBoost models without altering production code.
"""

import os
import sys
import joblib
import numpy as np
import pandas as pd
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score
from xgboost import XGBRegressor

ml_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
backend_dir = os.path.abspath(os.path.join(ml_dir, ".."))
if ml_dir not in sys.path:
    sys.path.insert(0, ml_dir)

from model import load_and_merge_datasets, engineer_features, build_feature_matrix

experiments_dir = os.path.join(ml_dir, "experiments")
os.makedirs(experiments_dir, exist_ok=True)

def main():
    print("=" * 80)
    print("NutriFlow Second-Level Validation & Experimental Model Analysis")
    print("=" * 80)

    # 1. Load data and metadata
    merged_df, meal_df, center_df = load_and_merge_datasets()
    metadata = joblib.load(os.path.join(ml_dir, 'model_metadata.joblib'))
    prod_model = joblib.load(os.path.join(ml_dir, 'model.joblib'))
    feature_cols = metadata['feature_cols']

    # Sort chronologically to compute lags
    merged_df = merged_df.sort_values(['center_id', 'meal_id', 'week']).reset_index(drop=True)
    merged_df['prev_week_orders'] = merged_df.groupby(['center_id', 'meal_id'])['num_orders'].shift(1)
    merged_df['rolling_3_orders'] = merged_df.groupby(['center_id', 'meal_id'])['num_orders'].transform(
        lambda s: s.shift(1).rolling(3, min_periods=1).mean()
    )
    global_mean = float(merged_df['num_orders'].mean())
    merged_df['prev_week_orders'] = merged_df['prev_week_orders'].fillna(global_mean)
    merged_df['rolling_3_orders'] = merged_df['rolling_3_orders'].fillna(global_mean)

    # Chronological Split
    cutoff_week = 117
    train_raw = merged_df[merged_df['week'] < cutoff_week].copy().reset_index(drop=True)
    val_raw = merged_df[merged_df['week'] >= cutoff_week].copy().reset_index(drop=True)

    # Feature matrices
    train_engineered = engineer_features(train_raw)
    val_engineered = engineer_features(val_raw)

    X_train, _ = build_feature_matrix(train_engineered, is_training=True)
    X_val, _ = build_feature_matrix(val_engineered, cat_columns_train=feature_cols, is_training=False)

    y_train = train_raw['num_orders'].values
    y_val = val_raw['num_orders'].values

    # Original model predictions
    val_df = val_engineered.copy()
    val_df['actual'] = y_val
    val_df['pred_orig'] = np.clip(prod_model.predict(X_val), 0, None)
    val_df['abs_err_orig'] = np.abs(val_df['pred_orig'] - val_df['actual'])
    val_df['err_orig'] = val_df['pred_orig'] - val_df['actual']

    # =========================================================================
    # 1. INVESTIGATE THE EXTREME DEMAND CASES (TOP 30 HIGHEST ERROR)
    # =========================================================================
    print("\n--- 1. Analyzing Top 30 Highest Error Observations ---")
    top30 = val_df.sort_values('abs_err_orig', ascending=False).head(30).copy()
    
    # Save extreme demand analysis CSV
    extreme_cols = [
        'week', 'meal_id', 'category', 'cuisine', 'center_id', 'center_type', 'city_code', 'op_area',
        'checkout_price', 'base_price', 'discount', 'discount_percent',
        'emailer_for_promotion', 'homepage_featured',
        'prev_week_orders', 'rolling_3_orders',
        'actual', 'pred_orig', 'abs_err_orig', 'err_orig'
    ]
    top30_export = top30[extreme_cols].copy()
    top30_export.rename(columns={
        'actual': 'actual_num_orders',
        'pred_orig': 'predicted_num_orders',
        'abs_err_orig': 'absolute_error',
        'err_orig': 'error'
    }, inplace=True)
    top30_csv_path = os.path.join(experiments_dir, 'extreme_demand_analysis.csv')
    top30_export.to_csv(top30_csv_path, index=False)
    print(f"Saved extreme demand analysis CSV to: {top30_csv_path}")

    # Inspect characteristics of top 30
    meal_dist = top30['meal_id'].value_counts()
    cat_dist = top30['category'].value_counts()
    center_dist = top30['center_id'].value_counts()
    both_promo_count = ((top30['emailer_for_promotion'] == 1) & (top30['homepage_featured'] == 1)).sum()
    either_promo_count = ((top30['emailer_for_promotion'] == 1) | (top30['homepage_featured'] == 1)).sum()
    mean_discount_top30 = top30['discount_percent'].mean()

    # =========================================================================
    # 2 & 3. HISTORICAL CONTEXT FOR MAJOR EXTREME CASES
    # =========================================================================
    print("\n--- 2 & 3. Historical Context Trajectories ---")
    # Let's inspect Meal 1971 at Center 43 (highest error: 13,150 orders in Week 132)
    # and Meal 2290 at Center 13 (7,911 orders in Week 134)
    traj_cases = [
        (1971, 43, 132),
        (1971, 137, 132),
        (2290, 13, 134)
    ]
    historical_trajectories = []
    for m_id, c_id, target_week in traj_cases:
        subset = merged_df[(merged_df['meal_id'] == m_id) & (merged_df['center_id'] == c_id) & (merged_df['week'] >= target_week - 4) & (merged_df['week'] <= target_week + 1)].copy()
        subset['discount_pct'] = ((subset['base_price'] - subset['checkout_price']) / subset['base_price']).round(3)
        cols_view = ['week', 'meal_id', 'center_id', 'num_orders', 'checkout_price', 'base_price', 'discount_pct', 'emailer_for_promotion', 'homepage_featured']
        historical_trajectories.append((m_id, c_id, target_week, subset[cols_view]))

    # =========================================================================
    # 4. CHECK PROMOTIONAL INTERACTIONS IN FULL DATASET
    # =========================================================================
    print("\n--- 4. Promotional Interaction Analysis ---")
    # Combinations across the entire dataset (456k records)
    all_data = engineer_features(merged_df)
    combos = []
    # 1. Baseline: no promo, no discount (discount_pct <= 0.05)
    c1 = all_data[(all_data['emailer_for_promotion'] == 0) & (all_data['homepage_featured'] == 0) & (all_data['discount_percent'] <= 0.05)]
    # 2. Deep discount only (>30%), no promo
    c2 = all_data[(all_data['emailer_for_promotion'] == 0) & (all_data['homepage_featured'] == 0) & (all_data['discount_percent'] > 0.30)]
    # 3. Emailer only, no homepage
    c3 = all_data[(all_data['emailer_for_promotion'] == 1) & (all_data['homepage_featured'] == 0)]
    # 4. Homepage only, no emailer
    c4 = all_data[(all_data['emailer_for_promotion'] == 0) & (all_data['homepage_featured'] == 1)]
    # 5. Both Emailer + Homepage
    c5 = all_data[(all_data['emailer_for_promotion'] == 1) & (all_data['homepage_featured'] == 1)]
    # 6. Trifecta: Both Emailer + Homepage + Deep Discount (>30%)
    c6 = all_data[(all_data['emailer_for_promotion'] == 1) & (all_data['homepage_featured'] == 1) & (all_data['discount_percent'] > 0.30)]

    combo_labels = [
        "1. Baseline (No promo, <=5% discount)",
        "2. Deep discount only (>30%, no promo)",
        "3. Emailer only (no homepage)",
        "4. Homepage only (no emailer)",
        "5. Both Emailer + Homepage",
        "6. Trifecta (Emailer + Homepage + Discount >30%)"
    ]
    combo_dfs = [c1, c2, c3, c4, c5, c6]
    promo_interaction_results = []
    for lbl, c_df in zip(combo_labels, combo_dfs):
        orders = c_df['num_orders']
        promo_interaction_results.append({
            "Condition": lbl,
            "Count": len(orders),
            "Mean Orders": round(orders.mean(), 1),
            "Median": round(orders.median(), 1),
            "P75": round(orders.quantile(0.75), 1),
            "P90": round(orders.quantile(0.90), 1),
            "P99": round(orders.quantile(0.99), 1),
            "Max Orders": int(orders.max())
        })
    promo_interaction_df = pd.DataFrame(promo_interaction_results)

    # =========================================================================
    # 5. EXPERIMENT 1: LOG-TARGET XGBOOST MODEL
    # =========================================================================
    print("\n--- 5. Training Experimental Log-Target XGBoost Model ---")
    y_train_log = np.log1p(y_train)
    
    log_xgb_model = XGBRegressor(
        n_estimators=300,
        learning_rate=0.05,
        max_depth=8,
        subsample=0.8,
        colsample_bytree=0.8,
        random_state=42,
        n_jobs=-1,
        objective="reg:squarederror",
    )
    log_xgb_model.fit(X_train, y_train_log)
    
    # Save experimental model separately
    log_model_path = os.path.join(experiments_dir, "log_xgboost_model.joblib")
    joblib.dump(log_xgb_model, log_model_path)
    print(f"Saved experimental log model to: {log_model_path}")

    # Predict and transform back: expm1, clipped to >= 0
    preds_log = log_xgb_model.predict(X_val)
    val_df['pred_log'] = np.clip(np.expm1(preds_log), 0, None)
    val_df['abs_err_log'] = np.abs(val_df['pred_log'] - val_df['actual'])
    val_df['err_log'] = val_df['pred_log'] - val_df['actual']

    # =========================================================================
    # 7. EXPERIMENT 2: POISSON COUNT XGBOOST MODEL
    # =========================================================================
    print("\n--- 7. Training Experimental Poisson XGBoost Model ---")
    poisson_xgb_model = XGBRegressor(
        n_estimators=300,
        learning_rate=0.05,
        max_depth=8,
        subsample=0.8,
        colsample_bytree=0.8,
        random_state=42,
        n_jobs=-1,
        objective="count:poisson",
    )
    poisson_xgb_model.fit(X_train, y_train)

    poisson_model_path = os.path.join(experiments_dir, "poisson_xgboost_model.joblib")
    joblib.dump(poisson_xgb_model, poisson_model_path)
    print(f"Saved experimental poisson model to: {poisson_model_path}")

    val_df['pred_poisson'] = np.clip(poisson_xgb_model.predict(X_val), 0, None)
    val_df['abs_err_poisson'] = np.abs(val_df['pred_poisson'] - val_df['actual'])
    val_df['err_poisson'] = val_df['pred_poisson'] - val_df['actual']

    # =========================================================================
    # 6. EVALUATION & COMPARISON ACROSS ALL THREE MODELS
    # =========================================================================
    print("\n--- 6. Computing Comparative Metrics ---")
    
    # Define Demand Tiers
    # Low <= 54, Medium 55-298, High 299-825, Extreme > 825
    def get_tier(x):
        if x <= 54:
            return 'Low (<=54)'
        elif x <= 298:
            return 'Medium (55-298)'
        elif x <= 825:
            return 'High (299-825)'
        else:
            return 'Extreme (>825)'

    val_df['demand_tier'] = val_df['actual'].apply(get_tier)

    def evaluate_model_preds(actual, pred):
        mae = mean_absolute_error(actual, pred)
        rmse = np.sqrt(mean_squared_error(actual, pred))
        r2 = r2_score(actual, pred)
        bias = float(np.mean(pred - actual))
        return mae, rmse, r2, bias

    model_comp = []
    models_dict = {
        'Original XGBoost': 'pred_orig',
        'Experimental Log XGBoost': 'pred_log',
        'Experimental Poisson XGBoost': 'pred_poisson'
    }

    for m_name, p_col in models_dict.items():
        # Overall
        o_mae, o_rmse, o_r2, o_bias = evaluate_model_preds(val_df['actual'], val_df[p_col])
        
        # Tiers
        tier_metrics = {}
        for tier_name in ['Low (<=54)', 'Medium (55-298)', 'High (299-825)', 'Extreme (>825)']:
            t_grp = val_df[val_df['demand_tier'] == tier_name]
            t_mae, t_rmse, t_r2, t_bias = evaluate_model_preds(t_grp['actual'], t_grp[p_col])
            tier_metrics[f'{tier_name} MAE'] = t_mae
            tier_metrics[f'{tier_name} RMSE'] = t_rmse
            tier_metrics[f'{tier_name} Bias'] = t_bias

        # Promotional subset (emailer or homepage == 1)
        promo_grp = val_df[(val_df['emailer_for_promotion'] == 1) | (val_df['homepage_featured'] == 1)]
        p_mae, p_rmse, p_r2, p_bias = evaluate_model_preds(promo_grp['actual'], promo_grp[p_col])

        # Top 30 extreme error observations comparison
        top30_idx = top30.index
        top30_mae = mean_absolute_error(val_df.loc[top30_idx, 'actual'], val_df.loc[top30_idx, p_col])
        top30_bias = float(np.mean(val_df.loc[top30_idx, p_col] - val_df.loc[top30_idx, 'actual']))

        res_dict = {
            'Model': m_name,
            'Overall MAE': round(o_mae, 2),
            'Overall RMSE': round(o_rmse, 2),
            'Overall R2': round(o_r2, 4),
            'Overall Bias': round(o_bias, 2),
            'Low Demand MAE': round(tier_metrics['Low (<=54) MAE'], 2),
            'Low Demand Bias': round(tier_metrics['Low (<=54) Bias'], 2),
            'Medium Demand MAE': round(tier_metrics['Medium (55-298) MAE'], 2),
            'Medium Demand Bias': round(tier_metrics['Medium (55-298) Bias'], 2),
            'High Demand MAE': round(tier_metrics['High (299-825) MAE'], 2),
            'High Demand Bias': round(tier_metrics['High (299-825) Bias'], 2),
            'Extreme Demand MAE': round(tier_metrics['Extreme (>825) MAE'], 2),
            'Extreme Demand RMSE': round(tier_metrics['Extreme (>825) RMSE'], 2),
            'Extreme Demand Bias': round(tier_metrics['Extreme (>825) Bias'], 2),
            'Promo Subset MAE': round(p_mae, 2),
            'Promo Subset RMSE': round(p_rmse, 2),
            'Promo Subset Bias': round(p_bias, 2),
            'Top 30 Cases MAE': round(top30_mae, 2),
            'Top 30 Cases Bias': round(top30_bias, 2),
        }
        model_comp.append(res_dict)

    model_comp_df = pd.DataFrame(model_comp)
    comp_csv_path = os.path.join(experiments_dir, 'model_comparison.csv')
    model_comp_df.to_csv(comp_csv_path, index=False)
    print(f"Saved model comparison CSV to: {comp_csv_path}")

    # =========================================================================
    # 8. OPERATIONAL IMPACT ANALYSIS
    # =========================================================================
    print("\n--- 8. Operational Shortage Impact Analysis ---")
    operational_results = []
    for m_name, p_col in models_dict.items():
        shortage = np.maximum(val_df['actual'] - val_df[p_col], 0)
        has_shortage = val_df[p_col] < val_df['actual']
        
        # Overall
        shortage_rate = has_shortage.mean() * 100
        mean_shortage = shortage.mean()
        median_shortage = shortage.median()
        total_shortage = shortage.sum()

        # Extreme demand tier
        ext_mask = val_df['demand_tier'] == 'Extreme (>825)'
        ext_shortage = shortage[ext_mask]
        ext_shortage_rate = (val_df.loc[ext_mask, p_col] < val_df.loc[ext_mask, 'actual']).mean() * 100
        ext_mean_shortage = ext_shortage.mean()
        ext_total_shortage = ext_shortage.sum()

        # Promo subset
        promo_mask = (val_df['emailer_for_promotion'] == 1) | (val_df['homepage_featured'] == 1)
        promo_shortage = shortage[promo_mask]
        promo_shortage_rate = (val_df.loc[promo_mask, p_col] < val_df.loc[promo_mask, 'actual']).mean() * 100
        promo_mean_shortage = promo_shortage.mean()
        promo_total_shortage = promo_shortage.sum()

        operational_results.append({
            "Model": m_name,
            "Shortage Rate (%)": round(shortage_rate, 2),
            "Mean Shortage (Orders/Obs)": round(mean_shortage, 2),
            "Median Shortage": round(median_shortage, 2),
            "Total Shortage Volume (Orders)": int(total_shortage),
            "Extreme Tier Shortage Rate (%)": round(ext_shortage_rate, 2),
            "Extreme Mean Shortage (Orders)": round(ext_mean_shortage, 2),
            "Extreme Total Shortage (Orders)": int(ext_total_shortage),
            "Promo Shortage Rate (%)": round(promo_shortage_rate, 2),
            "Promo Mean Shortage (Orders)": round(promo_mean_shortage, 2),
            "Promo Total Shortage (Orders)": int(promo_total_shortage),
        })
    operational_df = pd.DataFrame(operational_results)

    # =========================================================================
    # 9. WRITE COMPREHENSIVE EXPERIMENT REPORT
    # =========================================================================
    report_txt_path = os.path.join(experiments_dir, "experiment_report.txt")
    with open(report_txt_path, "w", encoding="utf-8") as f:
        f.write("=" * 85 + "\n")
        f.write("NUTRIFLOW FORECASTING EXPERIMENT REPORT: EXTREME DEMAND & MODEL COMPARISON\n")
        f.write("=" * 85 + "\n\n")

        f.write("1. EXTREME DEMAND FINDINGS (TOP 30 HIGHEST ERROR OBSERVATIONS)\n")
        f.write("-" * 85 + "\n")
        f.write(f"Meal ID Concentration in Top 30:\n{meal_dist.to_string()}\n\n")
        f.write(f"Category Concentration in Top 30:\n{cat_dist.to_string()}\n\n")
        f.write(f"Center Concentration in Top 30:\n{center_dist.to_string()}\n\n")
        f.write(f"Observations with BOTH Emailer and Homepage Featured: {both_promo_count} / 30 ({both_promo_count/30*100:.1f}%)\n")
        f.write(f"Observations with EITHER Emailer or Homepage Featured: {either_promo_count} / 30 ({either_promo_count/30*100:.1f}%)\n")
        f.write(f"Average Discount Depth in Top 30: {mean_discount_top30*100:.1f}%\n\n")

        f.write("2. HISTORICAL CONTEXT TRAJECTORIES (PRE-WEEK VS TARGET WEEK)\n")
        f.write("-" * 85 + "\n")
        for m_id, c_id, tgt_w, traj_df in historical_trajectories:
            f.write(f"\nTrajectory for Meal {m_id} at Center {c_id} around Week {tgt_w}:\n")
            f.write(traj_df.to_string(index=False) + "\n")

        f.write("\n3. PROMOTIONAL INTERACTION DISTRIBUTION (FULL DATASET)\n")
        f.write("-" * 85 + "\n")
        f.write(promo_interaction_df.to_string(index=False) + "\n\n")

        f.write("4. MODEL COMPARISON: ORIGINAL VS LOG-TARGET VS POISSON\n")
        f.write("-" * 85 + "\n")
        f.write(model_comp_df.to_string(index=False) + "\n\n")

        f.write("5. OPERATIONAL SHORTAGE ANALYSIS (ANALYTICAL MEASURE)\n")
        f.write("-" * 85 + "\n")
        f.write(operational_df.to_string(index=False) + "\n\n")

    print(f"\nAll experiments completed successfully. Report written to: {report_txt_path}")

if __name__ == "__main__":
    main()
