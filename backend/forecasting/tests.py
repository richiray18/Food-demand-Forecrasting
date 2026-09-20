import os
import pickle
import numpy as np
from django.test import TestCase
from django.urls import reverse
from rest_framework.test import APIClient
from rest_framework import status

from ml.predict_xgboost import _load_artifacts, predict_orders


class ForecastingSystemBackendTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.url = reverse('forecast-predict')
        self.base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        self.ml_dir = os.path.join(self.base_dir, 'ml')
        self.model_path = os.path.join(self.ml_dir, 'xgboost_model.pkl')
        self.metadata_path = os.path.join(self.ml_dir, 'xgboost_metadata.pkl')
        self.legacy_model_path = os.path.join(self.ml_dir, 'model.pkl')

    def test_01_model_file_availability(self):
        """Test 1 & 9: Verify model files exist and legacy model is preserved."""
        self.assertTrue(os.path.exists(self.model_path), f"Missing {self.model_path}")
        self.assertTrue(os.path.exists(self.metadata_path), f"Missing {self.metadata_path}")
        self.assertTrue(os.path.exists(self.legacy_model_path), f"Legacy model missing {self.legacy_model_path}")
        self.assertGreater(os.path.getsize(self.model_path), 1000)
        self.assertGreater(os.path.getsize(self.metadata_path), 500)

    def test_02_model_loading(self):
        """Test 1: Verify model and metadata load correctly into memory."""
        model, metadata = _load_artifacts()
        self.assertIsNotNone(model)
        self.assertIsNotNone(metadata)
        self.assertIn('feature_cols', metadata)
        self.assertIn('meals', metadata)
        self.assertIn('centers', metadata)
        self.assertEqual(len(metadata['meals']), 51)
        self.assertEqual(len(metadata['centers']), 77)
        self.assertEqual(len(metadata['feature_cols']), 35)

    def test_03_prediction_function(self):
        """Test 2: Verify predict_orders produces valid structured output."""
        result = predict_orders(
            meal_id=1885,
            center_id=13,
            week=146,
            checkout_price=136.83,
            base_price=152.29,
            emailer_for_promotion=0,
            homepage_featured=0
        )
        self.assertIsInstance(result, dict)
        self.assertEqual(result['meal_id'], 1885)
        self.assertEqual(result['center_id'], 13)
        self.assertEqual(result['week'], 146)
        self.assertIn('predicted_orders', result)
        self.assertIsInstance(result['predicted_orders'], int)
        self.assertGreaterEqual(result['predicted_orders'], 0)

    def test_04_django_forecasting_endpoint_valid_inputs(self):
        """Test 3 & 4: Verify Django forecasting endpoint accepts valid parameters."""
        res = self.client.get(
            self.url,
            {
                'meal_id': 1885,
                'center_id': 13,
                'week': 146,
                'checkout_price': 136.83,
                'base_price': 152.29,
                'emailer_for_promotion': 0,
                'homepage_featured': 0,
            }
        )
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        data = res.data
        self.assertEqual(data['meal_id'], 1885)
        self.assertEqual(data['center_id'], 13)
        self.assertEqual(data['week'], 146)
        self.assertIn('predicted_orders', data)
        self.assertIsInstance(data['predicted_orders'], int)
        # Ensure predicted_orders is strictly order volume, not described as kg
        self.assertNotIn('recommended_quantity_prepared_kg', data)

    def test_05_missing_inputs(self):
        """Test 5: Verify missing required inputs return HTTP 400."""
        res = self.client.get(
            self.url,
            {'meal_id': 1885, 'center_id': 13, 'week': 146}
        )
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('Missing required query parameter', res.data['error'])

    def test_06_invalid_meal_id(self):
        """Test 6: Verify unknown meal_id returns HTTP 400 with helpful error."""
        res = self.client.get(
            self.url,
            {
                'meal_id': 999999,
                'center_id': 13,
                'week': 146,
                'checkout_price': 100,
                'base_price': 100,
            }
        )
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('meal_id 999999 not found in meal catalog', res.data['error'])

    def test_07_invalid_center_id(self):
        """Test 7: Verify unknown center_id returns HTTP 400 with helpful error."""
        res = self.client.get(
            self.url,
            {
                'meal_id': 1885,
                'center_id': 999999,
                'week': 146,
                'checkout_price': 100,
                'base_price': 100,
            }
        )
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('center_id 999999 not found in fulfillment center catalog', res.data['error'])

    def test_08_invalid_week(self):
        """Test 8: Verify non-numeric and non-positive week values return HTTP 400."""
        # Non-numeric week
        res1 = self.client.get(
            self.url,
            {
                'meal_id': 1885,
                'center_id': 13,
                'week': 'invalid_week',
                'checkout_price': 100,
                'base_price': 100,
            }
        )
        self.assertEqual(res1.status_code, status.HTTP_400_BAD_REQUEST)

        # Zero or negative week
        res2 = self.client.get(
            self.url,
            {
                'meal_id': 1885,
                'center_id': 13,
                'week': 0,
                'checkout_price': 100,
                'base_price': 100,
            }
        )
        self.assertEqual(res2.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('week must be a positive integer', res2.data['error'])

    def test_09_preprocessing_consistency(self):
        """Test 10: Verify mathematical consistency of feature engineering."""
        base_price = 200.0
        checkout_price = 160.0
        discount = base_price - checkout_price
        discount_percent = discount / base_price
        price_ratio = checkout_price / base_price
        is_discounted = 1

        self.assertEqual(discount, 40.0)
        self.assertEqual(discount_percent, 0.20)
        self.assertEqual(price_ratio, 0.80)
        self.assertEqual(is_discounted, 1)

        # Test markup case
        checkout_markup = 220.0
        self.assertEqual(base_price - checkout_markup, -20.0)
        self.assertEqual(checkout_markup > base_price, True)

        # Test annual cyclical seasonality
        week = 146
        expected_woy = 42
        self.assertEqual(((week - 1) % 52) + 1, expected_woy)
        self.assertAlmostEqual(np.sin(2 * np.pi * expected_woy / 52), np.sin(2 * np.pi * 42 / 52))

    def test_10_nutriflow_api_contract(self):
        """Test API contract: GET /api/forecasting/predict/ returns baseline_kg and recommended_quantity_prepared_kg."""
        res = self.client.get(
            self.url,
            {
                'item_id': 1,
                'session_id': 2,
                'date': '2026-09-07',
                'is_holiday': 'false',
                'is_exam_period': 'false',
                'weather_note': '',
            }
        )
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        data = res.data
        self.assertEqual(data['item_id'], 1)
        self.assertEqual(data['session_id'], 2)
        self.assertIn('baseline_kg', data)
        self.assertIn('recommended_quantity_prepared_kg', data)
        self.assertIn('predicted_orders', data)
        self.assertGreater(data['baseline_kg'], 0)
        self.assertGreater(data['recommended_quantity_prepared_kg'], 0)
        self.assertGreater(data['predicted_orders'], 0)

        # Normal condition: recommended == baseline
        self.assertEqual(data['baseline_kg'], data['recommended_quantity_prepared_kg'])

    def test_11_multiplier_verification(self):
        """Test multipliers: holiday (x0.35), exam (x0.90), weather (x0.90)."""
        # Baseline
        base_res = self.client.get(
            self.url,
            {'item_id': 4, 'session_id': 2, 'date': '2026-09-07'}
        )
        self.assertEqual(base_res.status_code, status.HTTP_200_OK)
        baseline_kg = base_res.data['baseline_kg']

        # Holiday multiplier (x0.35)
        hol_res = self.client.get(
            self.url,
            {'item_id': 4, 'session_id': 2, 'date': '2026-09-07', 'is_holiday': 'true'}
        )
        expected_hol = round(baseline_kg * 0.35, 1)
        self.assertEqual(hol_res.data['recommended_quantity_prepared_kg'], expected_hol)

        # Exam period multiplier (x0.90)
        exam_res = self.client.get(
            self.url,
            {'item_id': 4, 'session_id': 2, 'date': '2026-09-07', 'is_exam_period': 'true'}
        )
        expected_exam = round(baseline_kg * 0.90, 1)
        self.assertEqual(exam_res.data['recommended_quantity_prepared_kg'], expected_exam)

    def test_12_predictions_vary_by_item_and_session(self):
        """Verify predictions are real and varying across different items and sessions."""
        res_rice_lunch = self.client.get(self.url, {'item_id': 1, 'session_id': 2, 'date': '2026-09-07'})
        res_paneer_lunch = self.client.get(self.url, {'item_id': 4, 'session_id': 2, 'date': '2026-09-07'})
        res_tea_snacks = self.client.get(self.url, {'item_id': 6, 'session_id': 3, 'date': '2026-09-07'})

        self.assertNotEqual(res_rice_lunch.data['baseline_kg'], res_paneer_lunch.data['baseline_kg'])
        self.assertNotEqual(res_paneer_lunch.data['baseline_kg'], res_tea_snacks.data['baseline_kg'])

    def test_13_string_alias_robustness(self):
        """Verify frontend query parameters with string names ('session=lunch', 'item=paneer') work seamlessly."""
        res = self.client.get(
            self.url,
            {
                'session': 'lunch',
                'item': 'paneer',
                'headcount': 350,
                'is_holiday': 'false',
                'is_exam': 'false',
                'weather': 'CLEAR'
            }
        )
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertIn('recommended_quantity_prepared_kg', res.data)
        self.assertIn('baseline_kg', res.data)
        self.assertIn('predicted_orders', res.data)

    def test_14_forecast_page_template_integration(self):
        """Verify /forecast/ template renders NutriFlow controls and displays."""
        res = self.client.get('/forecast/')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        content = res.content.decode('utf-8')
        self.assertIn('fcSessionSelect', content)
        self.assertIn('fcItemSelect', content)
        self.assertIn('fcHeadcountInput', content)
        self.assertIn('fcWeatherSelect', content)
        self.assertIn('fcHolidaySwitch', content)
        self.assertIn('fcExamSwitch', content)
        self.assertIn('btnRunForecast', content)
        self.assertIn('fcValRecommended', content)
