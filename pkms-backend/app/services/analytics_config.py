"""
Unified Analytics Configuration
Common timeframes and caching strategy for all analytics endpoints
"""
from typing import Dict, Any, Tuple
from datetime import datetime, timedelta
from app.config import NEPAL_TZ

# Unified timeframes for all analytics (basic, advanced, wellness scores)
TIME_FRAMES = {
    "day": {
        "days": 1,
        "chart_points": 24,  # Hourly data points
        "cache_ttl": 300,    # 5 minutes
        "description": "Today's detailed analysis"
    },
    "week": {
        "days": 7,
        "chart_points": 7,   # Daily data points
        "cache_ttl": 1800,   # 30 minutes
        "description": "This week's patterns"
    },
    "month": {
        "days": 30,
        "chart_points": 4,   # Weekly aggregated points
        "cache_ttl": 3600,   # 1 hour
        "description": "Monthly trends"
    },
    "3_months": {
        "days": 90,
        "chart_points": 12,  # Weekly aggregated points
        "cache_ttl": 7200,   # 2 hours
        "description": "Quarterly progress"
    },
    "6_months": {
        "days": 180,
        "chart_points": 6,   # Monthly aggregated points
        "cache_ttl": 14400,  # 4 hours
        "description": "Half-year journey"
    },
    "1_year": {
        "days": 365,
        "chart_points": 12,  # Monthly aggregated points
        "cache_ttl": 28800,  # 8 hours
        "description": "Annual wellness story"
    }
}

# Performance thresholds for loading states
LONG_CALCULATION_THRESHOLD = 90  # days
VERY_LONG_CALCULATION_THRESHOLD = 180  # days

def get_timeframe_config(timeframe: str) -> Dict[str, Any]:
    """Get configuration for a specific timeframe"""
    return TIME_FRAMES.get(timeframe, TIME_FRAMES["month"])

def get_date_range(days: int) -> Tuple[datetime, datetime]:
    """Get start and end dates for given number of days"""
    end_date = datetime.now(NEPAL_TZ).date()
    start_date = end_date - timedelta(days=days-1)
    return start_date, end_date

def should_show_loading_state(days: int) -> Tuple[bool, str]:
    """Determine if loading state should be shown and what message"""
    if days >= VERY_LONG_CALCULATION_THRESHOLD:
        return True, f"Analyzing your {days//30}-month wellness journey... 🎯"
    elif days >= LONG_CALCULATION_THRESHOLD:
        return True, "Calculating comprehensive wellness trends... ⏳"
    else:
        return False, ""

def get_cache_key(user_uuid: str, timeframe: str, days: int, analytics_type: str) -> str:
    """Generate cache key for analytics results"""
    return f"analytics_{analytics_type}_{user_uuid}_{timeframe}_{days}"

def quantize_data_for_chart(data_points: list, target_points: int) -> list:
    """
    Quantize raw data into fewer points for chart display.
    Uses averaging and trend preservation.
    """
    if len(data_points) <= target_points:
        return data_points

    # Calculate aggregation factor
    factor = len(data_points) // target_points
    if factor < 2:
        return data_points

    quantized = []
    for i in range(0, len(data_points), factor):
        chunk = data_points[i:i+factor]
        # Average the chunk, preserving None values
        valid_values = [x for x in chunk if x is not None]
        if valid_values:
            quantized.append(sum(valid_values) / len(valid_values))
        else:
            quantized.append(None)

    return quantized[:target_points]

# Memory-efficient cache configuration
CACHE_CONFIG = {
    "max_entries_per_user": 10,  # Last 10 calculations
    "max_users": 1000,           # Approx 120MB total memory usage
    "cleanup_interval": 3600,    # 1 hour cleanup
}