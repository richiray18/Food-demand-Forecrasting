from django.urls import path
from . import views

urlpatterns = [
    path('predict/', views.forecast_view, name='forecast-predict'),
]