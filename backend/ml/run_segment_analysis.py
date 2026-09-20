"""
run_segment_analysis.py - Second-Level Deep-Dive Validation Script
Evaluates errors across meals, centers, demand ranges, promotions, discounts, and distributions.
Does NOT modify or retrain production model or change production code.
"""

import os
import sys
import joblib
import numpy as np
import pandas as pd
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt

ml_dir = os.path.abspath(os.path.dirname(__file__))
if ml_dir not in sys.path:
    sys.path.insert(0, ml_dir)

from model import load_and_merge_datasets, build_feature_matrix

def main():
    print("Loading datasets and model artifacts...")
    merged_df, meal_df, center_df = load_and_merge_datasets()
    metadata = joblib.load(os.path.join(ml_dir, 'model_metadata.joblib'))
    model = joblib.load(os.path.join(ml_dir, 'model.joblib'))
    feature_cols = metadata['feature_cols']

    # Sort strictly chronologically
    merged_df = merged_df.sort_values(['center_id', 'meal_id', 'week']).reset_index(drop=True)
    merged_df['prev_week_orders'] = merged_df.groupby(['center_id', 'meal_id'])['num_orders'].shift(1)
    merged_df['rolling_3_orders'] = merged_df.groupby(['center_id', 'meal_id'])['num_orders'].transform(
        lambda s: s.shift(1).rolling(3, min_periods=1).mean()
    )
    global_mean = float(merged_df['num_orders'].mean())
    merged_df['prev_week_orders'] = merged_df['prev_week_orders'].fillna(global_mean)
    merged_df['rolling_3_orders'] = merged_df['rolling_3_orders'].fillna(global_mean)

    cutoff_week = 117
    train_raw = merged_df[merged_df['week'] < cutoff_week].copy().reset_index(drop=True)
    val_raw = merged_df[merged_df['week'] >= cutoff_week].copy().reset_index(drop=True)

    # Build feature matrix
    from model import engineer_features
    val_raw = engineer_features(val_raw)
    X_val, _ = build_feature_matrix(val_raw, cat_columns_train=feature_cols, is_training=False)
    y_val = val_raw['num_orders'].values
    preds = np.clip(model.predict(X_val), 0, None)

    val_df = val_raw.copy()
    val_df['actual'] = y_val
    val_df['predicted'] = preds
    val_df['abs_error'] = np.abs(preds - y_val)
    val_df['error'] = preds - y_val

    # Baseline predictions on EXACTLY the same rows
    hist_means = train_raw.groupby(['meal_id', 'center_id'])['num_orders'].mean().reset_index()
    hist_means.rename(columns={'num_orders': 'baseline_orders'}, inplace=True)
    val_merged = val_raw.merge(hist_means, on=['meal_id', 'center_id'], how='left')
    baseline_preds = val_merged['baseline_orders'].fillna(global_mean).values
    val_df['baseline_pred'] = baseline_preds

    overall_mae = mean_absolute_error(val_df['actual'], val_df['predicted'])
    overall_rmse = np.sqrt(mean_squared_error(val_df['actual'], val_df['predicted']))
    overall_r2 = r2_score(val_df['actual'], val_df['predicted'])
    overall_bias = val_df['error'].mean()

    base_mae = mean_absolute_error(val_df['actual'], val_df['baseline_pred'])
    base_rmse = np.sqrt(mean_squared_error(val_df['actual'], val_df['baseline_pred']))
    base_r2 = r2_score(val_df['actual'], val_df['baseline_pred'])

    # ----------------------------------------------------
    # 1. MEAL-LEVEL ANALYSIS
    # ----------------------------------------------------
    meal_stats = []
    for m_id, grp in val_df.groupby('meal_id'):
        cat = grp['category'].iloc[0] if 'category' in grp.columns else ''
        cui = grp['cuisine'].iloc[0] if 'cuisine' in grp.columns else ''
        n = len(grp)
        mean_act = grp['actual'].mean()
        mean_pred = grp['predicted'].mean()
        mae = mean_absolute_error(grp['actual'], grp['predicted'])
        rmse = np.sqrt(mean_squared_error(grp['actual'], grp['predicted']))
        mean_err = grp['error'].mean()
        var_act = np.var(grp['actual'])
        r2 = r2_score(grp['actual'], grp['predicted']) if (var_act > 1e-6 and n > 1) else np.nan
        meal_stats.append({
            'meal_id': m_id,
            'category': cat,
            'cuisine': cui,
            'records': n,
            'mean_actual': round(mean_act, 1),
            'mean_predicted': round(mean_pred, 1),
            'mae': round(mae, 2),
            'rmse': round(rmse, 2),
            'mean_error': round(mean_err, 2),
            'r2': round(r2, 4)
        })
    meal_df_stats = pd.DataFrame(meal_stats)

    # ----------------------------------------------------
    # 2. CENTER-LEVEL ANALYSIS
    # ----------------------------------------------------
    center_stats = []
    for c_id, grp in val_df.groupby('center_id'):
        ctype = grp['center_type'].iloc[0] if 'center_type' in grp.columns else ''
        city = grp['city_code'].iloc[0] if 'city_code' in grp.columns else ''
        op_area = grp['op_area'].iloc[0] if 'op_area' in grp.columns else ''
        n = len(grp)
        mean_act = grp['actual'].mean()
        mean_pred = grp['predicted'].mean()
        mae = mean_absolute_error(grp['actual'], grp['predicted'])
        rmse = np.sqrt(mean_squared_error(grp['actual'], grp['predicted']))
        mean_err = grp['error'].mean()
        var_act = np.var(grp['actual'])
        r2 = r2_score(grp['actual'], grp['predicted']) if (var_act > 1e-6 and n > 1) else np.nan
        center_stats.append({
            'center_id': c_id,
            'center_type': ctype,
            'city_code': city,
            'op_area': op_area,
            'records': n,
            'mean_actual': round(mean_act, 1),
            'mean_predicted': round(mean_pred, 1),
            'mae': round(mae, 2),
            'rmse': round(rmse, 2),
            'mean_error': round(mean_err, 2),
            'r2': round(r2, 4)
        })
    center_df_stats = pd.DataFrame(center_stats)

    # ----------------------------------------------------
    # 3. DEMAND RANGE ANALYSIS
    # ----------------------------------------------------
    # Quantiles: 25% = 54, 75% = 298, 95% = 825
    def get_demand_range(x):
        if x <= 54:
            return 'Low (<=54)'
        elif x <= 298:
            return 'Medium (55-298)'
        elif x <= 825:
            return 'High (299-825)'
        else:
            return 'Extreme (>825)'

    val_df['demand_range'] = val_df['actual'].apply(get_demand_range)
    range_order = ['Low (<=54)', 'Medium (55-298)', 'High (299-825)', 'Extreme (>825)']
    demand_stats = []
    for r in range_order:
        grp = val_df[val_df['demand_range'] == r]
        demand_stats.append({
            'demand_range': r,
            'observations': len(grp),
            'mean_actual': round(grp['actual'].mean(), 1),
            'mean_predicted': round(grp['predicted'].mean(), 1),
            'mae': round(mean_absolute_error(grp['actual'], grp['predicted']), 2),
            'rmse': round(np.sqrt(mean_squared_error(grp['actual'], grp['predicted'])), 2),
            'mean_error': round(grp['error'].mean(), 2)
        })
    demand_df_stats = pd.DataFrame(demand_stats)

    # ----------------------------------------------------
    # 4. PROMOTION ANALYSIS
    # ----------------------------------------------------
    promo_stats = []
    for p_col in ['emailer_for_promotion', 'homepage_featured']:
        for val in [0, 1]:
            grp = val_df[val_df[p_col] == val]
            promo_stats.append({
                'factor': p_col,
                'value': val,
                'observations': len(grp),
                'mean_actual': round(grp['actual'].mean(), 1),
                'mean_predicted': round(grp['predicted'].mean(), 1),
                'mae': round(mean_absolute_error(grp['actual'], grp['predicted']), 2),
                'rmse': round(np.sqrt(mean_squared_error(grp['actual'], grp['predicted'])), 2),
                'mean_error': round(grp['error'].mean(), 2)
            })
    promo_df_stats = pd.DataFrame(promo_stats)

    # ----------------------------------------------------
    # 5. DISCOUNT ANALYSIS
    # ----------------------------------------------------
    def get_discount_bucket(row):
        dp = row['discount_percent']
        if dp <= 0.001:
            return 'No Discount (<=0%)'
        elif dp <= 0.10:
            return 'Low (0-10%)'
        elif dp <= 0.25:
            return 'Moderate (10-25%)'
        elif dp <= 0.40:
            return 'High (25-40%)'
        else:
            return 'Deep (>40%)'

    val_df['discount_bucket'] = val_df.apply(get_discount_bucket, axis=1)
    disc_order = ['No Discount (<=0%)', 'Low (0-10%)', 'Moderate (10-25%)', 'High (25-40%)', 'Deep (>40%)']
    discount_stats = []
    for d in disc_order:
        grp = val_df[val_df['discount_bucket'] == d]
        discount_stats.append({
            'discount_bucket': d,
            'observations': len(grp),
            'mean_actual': round(grp['actual'].mean(), 1),
            'mean_predicted': round(grp['predicted'].mean(), 1),
            'mae': round(mean_absolute_error(grp['actual'], grp['predicted']), 2),
            'rmse': round(np.sqrt(mean_squared_error(grp['actual'], grp['predicted'])), 2),
            'mean_error': round(grp['error'].mean(), 2)
        })
    discount_df_stats = pd.DataFrame(discount_stats)

    # ----------------------------------------------------
    # 6. EXTREME ERROR ANALYSIS (TOP 30)
    # ----------------------------------------------------
    top30 = val_df.sort_values('abs_error', ascending=False).head(30)[
        ['week', 'meal_id', 'center_id', 'actual', 'predicted', 'abs_error', 'discount_percent', 'emailer_for_promotion', 'homepage_featured']
    ].copy()
    top30.rename(columns={'actual': 'actual_num_orders', 'predicted': 'predicted_num_orders', 'abs_error': 'absolute_error'}, inplace=True)
    top30['predicted_num_orders'] = top30['predicted_num_orders'].round(1)
    top30['absolute_error'] = top30['absolute_error'].round(1)
    top30['discount_percent'] = (top30['discount_percent'] * 100).round(1).astype(str) + '%'
    top30_path = os.path.join(ml_dir, 'highest_error_predictions.csv')
    top30.to_csv(top30_path, index=False)

    # ----------------------------------------------------
    # 7. ERROR DISTRIBUTION PERCENTILES
    # ----------------------------------------------------
    abs_errors = val_df['abs_error'].values
    p50 = np.median(abs_errors)
    p75 = np.percentile(abs_errors, 75)
    p90 = np.percentile(abs_errors, 90)
    p95 = np.percentile(abs_errors, 95)
    pmax = np.max(abs_errors)

    pct_10 = (abs_errors <= 10).mean() * 100
    pct_25 = (abs_errors <= 25).mean() * 100
    pct_50 = (abs_errors <= 50).mean() * 100
    pct_100 = (abs_errors <= 100).mean() * 100

    # ----------------------------------------------------
    # 8. SAVE COMBINED CSV REPORT
    # ----------------------------------------------------
    segment_csv_path = os.path.join(ml_dir, 'segment_validation_report.csv')
    with open(segment_csv_path, 'w', encoding='utf-8') as f:
        f.write('# SECTION 1: MEAL LEVEL PERFORMANCE\n')
        meal_df_stats.to_csv(f, index=False)
        f.write('\n# SECTION 2: CENTER LEVEL PERFORMANCE\n')
        center_df_stats.to_csv(f, index=False)
        f.write('\n# SECTION 3: DEMAND RANGE PERFORMANCE\n')
        demand_df_stats.to_csv(f, index=False)
        f.write('\n# SECTION 4: PROMOTION FACTOR PERFORMANCE\n')
        promo_df_stats.to_csv(f, index=False)
        f.write('\n# SECTION 5: DISCOUNT BUCKET PERFORMANCE\n')
        discount_df_stats.to_csv(f, index=False)

    # ----------------------------------------------------
    # 9. GENERATE PLOTS
    # ----------------------------------------------------
    # Plot 1: Error by Demand Range
    plt.figure(figsize=(9, 5))
    x = np.arange(len(demand_df_stats))
    width = 0.35
    plt.bar(x - width/2, demand_df_stats['mae'], width, label='MAE', color='#7A1C1C')
    plt.bar(x + width/2, demand_df_stats['rmse'], width, label='RMSE', color='#2B4C7E')
    plt.xticks(x, demand_df_stats['demand_range'], fontsize=10)
    plt.ylabel('Error (Orders)', fontsize=11)
    plt.title('Prediction Error Across Demand Ranges (Actual Orders)', fontsize=12, fontweight='bold')
    plt.legend()
    plt.grid(True, axis='y', alpha=0.3)
    p1 = os.path.join(ml_dir, 'error_by_demand_range.png')
    plt.savefig(p1, dpi=150, bbox_inches='tight')
    plt.close()

    # Plot 2: Error by Meal (Sorted by MAE)
    plt.figure(figsize=(14, 6))
    meal_sorted = meal_df_stats.sort_values('mae', ascending=True).reset_index(drop=True)
    plt.bar(range(len(meal_sorted)), meal_sorted['mae'], color='#C0392B', alpha=0.85, width=0.7)
    plt.xticks(range(len(meal_sorted)), [str(m) for m in meal_sorted['meal_id']], rotation=90, fontsize=8)
    plt.xlabel('Meal ID (Sorted by Ascending MAE)', fontsize=11)
    plt.ylabel('MAE (Orders)', fontsize=11)
    plt.title('Validation MAE by Meal ID (51 Catalog Meals)', fontsize=12, fontweight='bold')
    plt.grid(True, axis='y', alpha=0.3)
    p2 = os.path.join(ml_dir, 'error_by_meal.png')
    plt.savefig(p2, dpi=150, bbox_inches='tight')
    plt.close()

    # Plot 3: Error by Center (Sorted by MAE)
    plt.figure(figsize=(16, 6))
    center_sorted = center_df_stats.sort_values('mae', ascending=True).reset_index(drop=True)
    plt.bar(range(len(center_sorted)), center_sorted['mae'], color='#2980B9', alpha=0.85, width=0.7)
    plt.xticks(range(len(center_sorted)), [str(c) for c in center_sorted['center_id']], rotation=90, fontsize=8)
    plt.xlabel('Center ID (Sorted by Ascending MAE)', fontsize=11)
    plt.ylabel('MAE (Orders)', fontsize=11)
    plt.title('Validation MAE by Fulfillment Center ID (77 Centers)', fontsize=12, fontweight='bold')
    plt.grid(True, axis='y', alpha=0.3)
    p3 = os.path.join(ml_dir, 'error_by_center.png')
    plt.savefig(p3, dpi=150, bbox_inches='tight')
    plt.close()

    # Plot 4: Residual Distribution (Histogram with KDE / mean)
    plt.figure(figsize=(10, 5))
    residuals = val_df['error'].values
    res_clipped = np.clip(residuals, -600, 600)
    plt.hist(res_clipped, bins=80, color='#2C3E50', edgecolor='white', alpha=0.8, density=True)
    plt.axvline(0, color='red', linestyle='--', lw=2, label='Zero Error (Perfect Forecast)')
    plt.axvline(overall_bias, color='orange', linestyle='-', lw=2, label=f'Mean Error = {overall_bias:.2f}')
    plt.axvline(np.median(residuals), color='cyan', linestyle=':', lw=2, label=f'Median Error = {np.median(residuals):.2f}')
    plt.title('Validation Residual Distribution: (Predicted - Actual Orders)', fontsize=12, fontweight='bold')
    plt.xlabel('Residual Error (Orders)', fontsize=11)
    plt.ylabel('Density', fontsize=11)
    plt.legend()
    plt.grid(True, alpha=0.3)
    p4 = os.path.join(ml_dir, 'residual_distribution.png')
    plt.savefig(p4, dpi=150, bbox_inches='tight')
    plt.close()

    # ----------------------------------------------------
    # 10. GENERATE segment_validation_report.txt
    # ----------------------------------------------------
    txt_report_path = os.path.join(ml_dir, 'segment_validation_report.txt')
    with open(txt_report_path, 'w', encoding='utf-8') as f:
        f.write('================================================================================\n')
        f.write('NUTRIFLOW DEMAND FORECASTING ENGINE — SECOND-LEVEL VALIDATION REPORT\n')
        f.write('================================================================================\n\n')

        f.write('A. OVERALL VALIDATION METRICS\n')
        f.write('--------------------------------------------------------------------------------\n')
        f.write(f'Validation Dataset Records: {len(val_df):,} (Weeks 117 to 145)\n')
        f.write(f'XGBoost MAE               : {overall_mae:.2f} orders\n')
        f.write(f'XGBoost RMSE              : {overall_rmse:.2f} orders\n')
        f.write(f'XGBoost R²                : {overall_r2:.4f}\n')
        f.write(f'XGBoost Mean Error (Bias) : {overall_bias:.2f} orders\n')
        f.write(f'Baseline MAE              : {base_mae:.2f} orders\n')
        f.write(f'Baseline RMSE             : {base_rmse:.2f} orders\n')
        f.write(f'Baseline R²               : {base_r2:.4f}\n\n')

        f.write('B. MEAL-LEVEL ANALYSIS\n')
        f.write('--------------------------------------------------------------------------------\n')
        f.write('Top 5 Highest MAE Meals:\n')
        f.write(meal_df_stats.sort_values('mae', ascending=False).head(5).to_string(index=False) + '\n\n')
        f.write('Top 5 Lowest MAE Meals:\n')
        f.write(meal_df_stats.sort_values('mae', ascending=True).head(5).to_string(index=False) + '\n\n')
        f.write('Top 5 Strongest Underprediction Meals (Most Negative Mean Error):\n')
        f.write(meal_df_stats.sort_values('mean_error', ascending=True).head(5).to_string(index=False) + '\n\n')
        f.write('Top 5 Strongest Overprediction Meals (Most Positive Mean Error):\n')
        f.write(meal_df_stats.sort_values('mean_error', ascending=False).head(5).to_string(index=False) + '\n\n')

        f.write('C. CENTER-LEVEL ANALYSIS\n')
        f.write('--------------------------------------------------------------------------------\n')
        f.write('Top 5 Highest MAE Centers:\n')
        f.write(center_df_stats.sort_values('mae', ascending=False).head(5).to_string(index=False) + '\n\n')
        f.write('Top 5 Lowest MAE Centers:\n')
        f.write(center_df_stats.sort_values('mae', ascending=True).head(5).to_string(index=False) + '\n\n')
        f.write('Top 5 Strongest Underpredicting Centers:\n')
        f.write(center_df_stats.sort_values('mean_error', ascending=True).head(5).to_string(index=False) + '\n\n')
        f.write('Top 5 Strongest Overpredicting Centers:\n')
        f.write(center_df_stats.sort_values('mean_error', ascending=False).head(5).to_string(index=False) + '\n\n')

        f.write('D. DEMAND RANGE ANALYSIS\n')
        f.write('--------------------------------------------------------------------------------\n')
        f.write(demand_df_stats.to_string(index=False) + '\n\n')

        f.write('E. PROMOTION ANALYSIS\n')
        f.write('--------------------------------------------------------------------------------\n')
        f.write(promo_df_stats.to_string(index=False) + '\n\n')

        f.write('F. DISCOUNT ANALYSIS\n')
        f.write('--------------------------------------------------------------------------------\n')
        f.write(discount_df_stats.to_string(index=False) + '\n\n')

        f.write('G. EXTREME ERROR ANALYSIS (TOP 30 HIGHEST ABSOLUTE ERRORS)\n')
        f.write('--------------------------------------------------------------------------------\n')
        f.write(top30.to_string(index=False) + '\n\n')

        f.write('H. ERROR DISTRIBUTION PERCENTILES\n')
        f.write('--------------------------------------------------------------------------------\n')
        f.write(f'Median Absolute Error (P50) : {p50:.2f} orders\n')
        f.write(f'75th Percentile (P75)       : {p75:.2f} orders\n')
        f.write(f'90th Percentile (P90)       : {p90:.2f} orders\n')
        f.write(f'95th Percentile (P95)       : {p95:.2f} orders\n')
        f.write(f'Maximum Absolute Error      : {pmax:.2f} orders\n')
        f.write(f'Predictions within <= 10 orders : {pct_10:.2f}%\n')
        f.write(f'Predictions within <= 25 orders : {pct_25:.2f}%\n')
        f.write(f'Predictions within <= 50 orders : {pct_50:.2f}%\n')
        f.write(f'Predictions within <= 100 orders: {pct_100:.2f}%\n\n')

    print("SUCCESS: Second-level validation completed.")

if __name__ == "__main__":
    main()
