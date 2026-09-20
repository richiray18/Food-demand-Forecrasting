from django.urls import path
from . import views

urlpatterns = [
    path('predict/', views.forecast_view, name='forecast-predict'),
    path('options/', views.options_view, name='forecast-options'),
]