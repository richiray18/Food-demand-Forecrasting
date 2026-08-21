"""
URL configuration for config project.

The `urlpatterns` list routes URLs to views. For more information please see:
    https://docs.djangoproject.com/en/6.1/topics/http/urls/
Examples:
Function views
    1. Add an import:  from my_app import views
    2. Add a URL to urlpatterns:  path('', views.home, name='home')
Class-based views
    1. Add an import:  from other_app.views import Home
    2. Add a URL to urlpatterns:  path('', Home.as_view(), name='home')
Including another URLconf
    1. Import the include() function: from django.urls import include, path
    2. Add a URL to urlpatterns:  path('blog/', include('blog.urls'))
"""
from django.contrib import admin
from django.urls import path, include
from django.conf import settings
from django.conf.urls.static import static
from . import views

urlpatterns = [
    path('admin/', admin.site.urls),
    path("api/v1/accounts/", include("accounts.urls")),
    path("api/v1/meals/", include("meals.urls")),
    path("api/surplus/", include("surplus.urls")),
    path("api/pickups/", include("pickups.urls")),
    path("api/recipients/", include("recipients.urls")),
    path("api/impact/", include("impact.urls")),
    path("api/v1/config/", include("config.urls_api")),
    path("api/forecasting/", include("forecasting.urls")),
    path("api-auth/", include("rest_framework.urls")),
        # Frontend Web Routes
    path('', views.login_view, name='login'),
    path('dashboard/', views.dashboard_view, name='dashboard'),
    path('forecast/', views.forecast_view, name='forecast'),
    path('preparation/', views.preparation_view, name='preparation'),
    path('surplus/', views.surplus_view, name='surplus'),
    path('recipients/', views.recipients_view, name='recipients'),
    path('pickups/', views.pickups_view, name='pickups'),
    path('impact/', views.impact_view, name='impact'),
]
if settings.DEBUG:
    urlpatterns += static(
        settings.STATIC_URL,
        document_root=settings.STATICFILES_DIRS[0]
    )