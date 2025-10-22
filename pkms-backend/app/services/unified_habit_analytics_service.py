"""
Unified Habit Analytics Service

Comprehensive analytics orchestration for all habit-related data with unified
timeframes, caching, and statistical analysis. This service coordinates between
habit data management, trend analysis, and provides unified analytics endpoints.

This service consolidates all habit analytics functionality that was previously
scattered across diary_metadata_service.py, moving_averages.py, and 
daily_insights_service.py, providing a single interface for all habit analytics.
"""

import logging
import json
from typing import Dict, Any, List, Optional, Tuple
from sqlalchemy.ext.asyncio import AsyncSession
from datetime import datetime, timedelta, date
from app.config import NEPAL_TZ

from .analytics_config import (
    TIME_FRAMES, get_timeframe_config, get_date_range,
    should_show_loading_state, quantize_data_for_chart
)
from .unified_analytics_cache import analytics_cache
from .habit_trend_analysis_service import habit_trend_analysis_service
from .habit_data_service import HabitDataService

logger = logging.getLogger(__name__)


class UnifiedHabitAnalyticsService:
    """
    Unified service for all habit analytics with comprehensive caching and
    multi-timeframe support. Orchestrates data retrieval, trend analysis,
    and correlation calculations for both default and defined habits.
    """

    @staticmethod
    async def get_default_habits_analytics(
        db: AsyncSession,
        user_uuid: str,
        days: int = 30,
        include_sma: bool = False,
        sma_windows: List[int] = None
    ) -> Dict[str, Any]:
        """
        Get analytics for 9 default habits (sleep, stress, exercise, meditation,
        screen_time, steps, learning, outdoor, social) with optional SMA overlays.
        
        Args:
            db: Database session
            user_uuid: User's UUID
            days: Number of days for analysis (7-365)
            include_sma: Whether to include Simple Moving Average overlays
            sma_windows: List of SMA window sizes (default: [7, 14, 30])
            
        Returns:
            Dictionary with habit analytics, trends, and optional SMA data
            
        Example:
            >>> result = await get_default_habits_analytics(db, user_uuid, 30, True, [7, 14])
            >>> # Returns: {"habits": {"sleep": {"average": 7.2, "trend": [...]}}, "sma_overlays": {...}}
        """
        if sma_windows is None:
            sma_windows = [7, 14, 30]
        
        # Check cache first
        cache_key = f"default_habits_{days}_{include_sma}_{'-'.join(map(str, sma_windows))}"
        cached_result = analytics_cache.get(user_uuid, "month", days, cache_key)
        if cached_result:
            logger.info(f"Using cached default habits analytics for user {user_uuid}")
            return cached_result
        
        try:
            # Get raw data using HabitDataService (proper delegation)
            metadata_service = HabitDataService()
            metadata_records = await metadata_service._get_metadata_in_date_range(
                db, user_uuid, start_date, end_date
            )
            
            # Process default habits data (following same pattern as get_wellness_stats)
            default_habits = [
                "sleep", "stress", "exercise", "meditation", "screen_time",
                "steps", "learning", "outdoor", "social"
            ]
            
            habits_data = {}
            
            for habit in default_habits:
                values = []
                dates = []
                
                for record in metadata_records:
                    try:
                        habits_json = json.loads(record.default_habits_json or "{}")
                        value = habits_json.get(habit)
                        if value is not None:
                            values.append(float(value))
                            dates.append(record.date.strftime("%Y-%m-%d"))
                    except (json.JSONDecodeError, ValueError, TypeError):
                        continue
                
                if values:
                    # Calculate basic statistics
                    average = sum(values) / len(values)
                    min_val = min(values)
                    max_val = max(values)
                    
                    # Create trend data
                    trend = [
                        {"date": date, "value": value}
                        for date, value in zip(dates, values)
                    ]
                    
                    habits_data[habit] = {
                        "average": round(average, 2),
                        "min": round(min_val, 2),
                        "max": round(max_val, 2),
                        "trend": trend,
                        "total_days": len(values),
                        "days_with_data": len(values)
                    }
                    
                    # Add SMA overlays if requested
                    if include_sma and len(values) >= min(sma_windows):
                        sma_overlays = {}
                        for window in sma_windows:
                            if len(values) >= window:
                                sma_values = habit_trend_analysis_service.calculate_sma(values, window)
                                sma_overlays[str(window)] = [
                                    {"date": date, "value": sma_val}
                                    for date, sma_val in zip(dates, sma_values)
                                    if sma_val is not None
                                ]
                        habits_data[habit]["sma_overlays"] = sma_overlays
                        
                        # Add trend analysis
                        if len(values) >= 7:  # Minimum for trend analysis
                            sma_7 = habit_trend_analysis_service.calculate_sma(values, 7)
                            trend_analysis = habit_trend_analysis_service.analyze_trend_direction(values, sma_7)
                            habits_data[habit]["trend_analysis"] = trend_analysis
                else:
                    habits_data[habit] = {
                        "average": 0,
                        "min": 0,
                        "max": 0,
                        "trend": [],
                        "total_days": days,
                        "days_with_data": 0
                    }
            
            # Calculate date range
            end_date = datetime.now(NEPAL_TZ).date()
            start_date = end_date - timedelta(days=days)
            
            # Create response
            result = {
                "period_start": start_date.strftime("%Y-%m-%d"),
                "period_end": end_date.strftime("%Y-%m-%d"),
                "total_days": days,
                "days_with_data": sum(habit["days_with_data"] for habit in habits_data.values()),
                "habits": habits_data,
                "analytics_type": "default_habits",
                "calculation_days": days,
                "from_cache": False
            }
            
            # Cache the result
            analytics_cache.set(user_uuid, "month", days, cache_key, result, 600)  # 10 min TTL
            
            return result
            
        except Exception as e:
            logger.error(f"Error calculating default habits analytics: {e}")
            raise

    @staticmethod
    async def get_defined_habits_analytics(
        db: AsyncSession,
        user_uuid: str,
        days: int = 30,
        normalize: bool = False
    ) -> Dict[str, Any]:
        """
        Get analytics for user-defined custom habits with optional normalization.
        
        Args:
            db: Database session
            user_uuid: User's UUID
            days: Number of days for analysis (7-365)
            normalize: Whether to normalize values to percentage of target
            
        Returns:
            Dictionary with defined habits analytics and optional normalization
            
        Example:
            >>> result = await get_defined_habits_analytics(db, user_uuid, 30, True)
            >>> # Returns: {"habits": {"water_intake": {"average": 8.5, "normalized_percentage": 85}}}
        """
        # Check cache first
        cache_key = f"defined_habits_{days}_{normalize}"
        cached_result = analytics_cache.get(user_uuid, "month", days, cache_key)
        if cached_result:
            logger.info(f"Using cached defined habits analytics for user {user_uuid}")
            return cached_result
        
        try:
            # Get all unique defined habit keys first
            metadata_service = HabitDataService()
            start_date = datetime.now(NEPAL_TZ).date() - timedelta(days=days)
            end_date = datetime.now(NEPAL_TZ).date()
            
            metadata_records = await metadata_service._get_metadata_in_date_range(
                db, user_uuid, start_date, end_date
            )
            
            # Get all unique habit keys
            all_habits = set()
            for record in metadata_records:
                if record.defined_habits_json:
                    try:
                        habits = json.loads(record.defined_habits_json).get("habits", {})
                        all_habits.update(habits.keys())
                    except json.JSONDecodeError:
                        continue
            
            # Process each habit using _get_habit_values (DRY principle)
            processed_habits = {}
            for habit_id in all_habits:
                values, dates = UnifiedHabitAnalyticsService._get_habit_values(
                    metadata_records, habit_id, normalize
                )
                
                if values:
                    # Calculate basic statistics
                    average = sum(values) / len(values)
                    min_val = min(values)
                    max_val = max(values)
                    
                    # Create trend data
                    trend = [
                        {"date": date, "value": value}
                        for date, value in zip(dates, values)
                    ]
                    
                    # Calculate streak
                    streak_data = [{"date": date, "value": value} for date, value in zip(dates, values)]
                    streak_info = habit_trend_analysis_service.calculate_habit_streaks(streak_data, habit_id)
                    
                    processed_habits[habit_id] = {
                        "name": habit_id.replace("_", " ").title(),
                        "average": round(average, 2),
                        "min": round(min_val, 2),
                        "max": round(max_val, 2),
                        "unit": "units",  # Default unit
                        "target": None,  # Could be enhanced to get from config
                        "trend": trend,
                        "streak": streak_info["current"],
                        "best_streak": streak_info["best"],
                        "completion_rate": round(streak_info["completion_rate"], 3),
                        "total_days": len(values),
                        "days_with_data": len(values)
                    }
                else:
                    processed_habits[habit_id] = {
                        "name": habit_id.replace("_", " ").title(),
                        "average": 0,
                        "min": 0,
                        "max": 0,
                        "unit": "units",
                        "target": None,
                        "trend": [],
                        "streak": 0,
                        "best_streak": 0,
                        "completion_rate": 0,
                        "total_days": days,
                        "days_with_data": 0
                    }
            
            # Create response
            result = {
                "period_start": start_date.strftime("%Y-%m-%d"),
                "period_end": end_date.strftime("%Y-%m-%d"),
                "habits": processed_habits,
                "analytics_type": "defined_habits",
                "calculation_days": days,
                "normalized": normalize,
                "from_cache": False
            }
            
            # Cache the result
            analytics_cache.set(user_uuid, "month", days, cache_key, result, 600)  # 10 min TTL
            
            return result
            
        except Exception as e:
            logger.error(f"Error calculating defined habits analytics: {e}")
            raise

    @staticmethod
    async def get_comprehensive_analytics(
        db: AsyncSession,
        user_uuid: str,
        days: int = 30
    ) -> Dict[str, Any]:
        """
        Get unified view of all habits + mood + financial + insights.
        
        Args:
            db: Database session
            user_uuid: User's UUID
            days: Number of days for analysis (7-365)
            
        Returns:
            Dictionary with comprehensive analytics including all metrics
            
        Example:
            >>> result = await get_comprehensive_analytics(db, user_uuid, 30)
            >>> # Returns: {"default_habits": {...}, "defined_habits": {...}, "mood": {...}, "financial": {...}}
        """
        # Check cache first
        cache_key = f"comprehensive_{days}"
        cached_result = analytics_cache.get(user_uuid, "month", days, cache_key)
        if cached_result:
            logger.info(f"Using cached comprehensive analytics for user {user_uuid}")
            return cached_result
        
        try:
            # Get default habits analytics
            default_habits = await UnifiedHabitAnalyticsService.get_default_habits_analytics(
                db, user_uuid, days, include_sma=True, sma_windows=[7, 14, 30]
            )
            
            # Get defined habits analytics
            defined_habits = await UnifiedHabitAnalyticsService.get_defined_habits_analytics(
                db, user_uuid, days, normalize=True
            )
            
            # Get mood and financial data
            wellness_stats = await UnifiedHabitAnalyticsService.get_wellness_stats(db, user_uuid, days)
            
            # Create comprehensive response
            result = {
                "period_start": default_habits["period_start"],
                "period_end": default_habits["period_end"],
                "total_days": days,
                "default_habits": default_habits["habits"],
                "defined_habits": defined_habits["habits"],
                "mood": {
                    "average": getattr(wellness_stats, 'average_mood', 0),
                    "trend": getattr(wellness_stats, 'mood_trend', []),
                    "days_with_data": getattr(wellness_stats, 'days_with_data', 0)
                },
                "financial": {
                    "average_income": getattr(wellness_stats, 'average_income', 0),
                    "average_expense": getattr(wellness_stats, 'average_expense', 0),
                    "savings_trend": getattr(wellness_stats, 'financial_trend', [])
                },
                "analytics_type": "comprehensive",
                "calculation_days": days,
                "from_cache": False
            }
            
            # Cache the result
            analytics_cache.set(user_uuid, "month", days, cache_key, result, 600)  # 10 min TTL
            
            return result
            
        except Exception as e:
            logger.error(f"Error calculating comprehensive analytics: {e}")
            raise

    @staticmethod
    async def get_habit_correlation(
        db: AsyncSession,
        user_uuid: str,
        habit_x: str,
        habit_y: str,
        days: int = 90,
        normalize: bool = False
    ) -> Dict[str, Any]:
        """
        Calculate correlation between any two habits (default, defined, mood, financial).
        
        Args:
            db: Database session
            user_uuid: User's UUID
            habit_x: First habit identifier
            habit_y: Second habit identifier
            days: Number of days for analysis (7-365)
            normalize: Whether to normalize defined habits to percentage of target
            
        Returns:
            Dictionary with correlation analysis and scatter plot data
            
        Example:
            >>> result = await get_habit_correlation(db, user_uuid, "sleep", "mood", 90)
            >>> # Returns: {"correlation_coefficient": 0.65, "interpretation": "Strong positive correlation"}
        """
        # Check cache first
        cache_key = f"correlation_{habit_x}_{habit_y}_{days}_{normalize}"
        cached_result = analytics_cache.get(user_uuid, "month", days, cache_key)
        if cached_result:
            logger.info(f"Using cached correlation for {habit_x} vs {habit_y}")
            return cached_result
        
        try:
            # Get raw data ONCE
            metadata_service = HabitDataService()
            start_date = datetime.now(NEPAL_TZ).date() - timedelta(days=days)
            end_date = datetime.now(NEPAL_TZ).date()
            
            metadata_records = await metadata_service._get_metadata_in_date_range(
                db, user_uuid, start_date, end_date
            )
            
            # Get data for both habits by PASSING the records
            x_values, x_dates = UnifiedHabitAnalyticsService._get_habit_values(
                metadata_records, habit_x, normalize
            )
            y_values, y_dates = UnifiedHabitAnalyticsService._get_habit_values(
                metadata_records, habit_y, normalize
            )
            
            # Align dates and values
            aligned_data = UnifiedHabitAnalyticsService._align_habit_data(
                x_values, x_dates, y_values, y_dates
            )
            
            if len(aligned_data) < 2:
                return {
                    "habit_x": {"name": habit_x, "unit": "units", "average": 0},
                    "habit_y": {"name": habit_y, "unit": "units", "average": 0},
                    "pairs": [],
                    "correlation_coefficient": 0.0,
                    "interpretation": "Insufficient data for correlation",
                    "sample_size": len(aligned_data)
                }
            
            # Calculate correlation
            x_vals = [pair["x"] for pair in aligned_data]
            y_vals = [pair["y"] for pair in aligned_data]
            
            correlation_result = habit_trend_analysis_service.calculate_correlation(x_vals, y_vals)
            
            # Create response
            result = {
                "habit_x": {
                    "name": habit_x.replace("_", " ").title(),
                    "unit": "units",  # Could be enhanced to get actual units
                    "average": round(sum(x_vals) / len(x_vals), 2)
                },
                "habit_y": {
                    "name": habit_y.replace("_", " ").title(),
                    "unit": "units",
                    "average": round(sum(y_vals) / len(y_vals), 2)
                },
                "pairs": aligned_data,
                "correlation_coefficient": correlation_result["coefficient"],
                "interpretation": correlation_result["interpretation"],
                "sample_size": correlation_result["sample_size"],
                "analytics_type": "correlation",
                "calculation_days": days,
                "from_cache": False
            }
            
            # Cache the result
            analytics_cache.set(user_uuid, "month", days, cache_key, result, 300)  # 5 min TTL
            
            return result
            
        except Exception as e:
            logger.error(f"Error calculating habit correlation: {e}")
            raise

    @staticmethod
    async def get_habit_trend_with_sma(
        db: AsyncSession,
        user_uuid: str,
        habit_key: str,
        days: int = 90,
        include_sma: bool = True,
        sma_windows: List[int] = None
    ) -> Dict[str, Any]:
        """
        Get trend data for specific habit with SMA overlays.
        
        Args:
            db: Database session
            user_uuid: User's UUID
            habit_key: Habit identifier
            days: Number of days for analysis (7-365)
            include_sma: Whether to include SMA overlays
            sma_windows: List of SMA window sizes (default: [7, 14, 30])
            
        Returns:
            Dictionary with trend data and optional SMA overlays
            
        Example:
            >>> result = await get_habit_trend_with_sma(db, user_uuid, "sleep", 90, True, [7, 14])
            >>> # Returns: {"trend": [...], "sma_overlays": {"7": [...], "14": [...]}}
        """
        if sma_windows is None:
            sma_windows = [7, 14, 30]
        
        # Check cache first
        cache_key = f"trend_{habit_key}_{days}_{include_sma}_{'-'.join(map(str, sma_windows))}"
        cached_result = analytics_cache.get(user_uuid, "month", days, cache_key)
        if cached_result:
            logger.info(f"Using cached trend for {habit_key}")
            return cached_result
        
        try:
            # Get raw data ONCE
            metadata_service = HabitDataService()
            start_date = datetime.now(NEPAL_TZ).date() - timedelta(days=days)
            end_date = datetime.now(NEPAL_TZ).date()
            
            metadata_records = await metadata_service._get_metadata_in_date_range(
                db, user_uuid, start_date, end_date
            )
            
            # Get habit values by PASSING the records
            values, dates = UnifiedHabitAnalyticsService._get_habit_values(
                metadata_records, habit_key, normalize=False
            )
            
            if not values:
                return {
                    "habit_key": habit_key,
                    "name": habit_key.replace("_", " ").title(),
                    "unit": "units",
                    "trend": [],
                    "sma_overlays": {},
                    "statistics": {
                        "average": 0,
                        "min": 0,
                        "max": 0,
                        "trend_direction": "insufficient_data"
                    },
                    "analytics_type": "trend",
                    "calculation_days": days,
                    "from_cache": False
                }
            
            # Create trend data
            trend = [
                {"date": date, "value": value}
                for date, value in zip(dates, values)
            ]
            
            # Calculate SMA overlays if requested
            sma_overlays = {}
            if include_sma and len(values) >= min(sma_windows):
                for window in sma_windows:
                    if len(values) >= window:
                        sma_values = habit_trend_analysis_service.calculate_sma(values, window)
                        sma_overlays[str(window)] = [
                            {"date": date, "value": sma_val}
                            for date, sma_val in zip(dates, sma_values)
                            if sma_val is not None
                        ]
            
            # Calculate statistics
            average = sum(values) / len(values)
            min_val = min(values)
            max_val = max(values)
            
            # Analyze trend direction
            trend_direction = "stable"
            if len(values) >= 7:
                sma_7 = habit_trend_analysis_service.calculate_sma(values, 7)
                trend_analysis = habit_trend_analysis_service.analyze_trend_direction(values, sma_7)
                trend_direction = trend_analysis["direction"]
            
            # Create response
            result = {
                "habit_key": habit_key,
                "name": habit_key.replace("_", " ").title(),
                "unit": "units",  # Could be enhanced to get actual units
                "trend": trend,
                "sma_overlays": sma_overlays,
                "statistics": {
                    "average": round(average, 2),
                    "min": round(min_val, 2),
                    "max": round(max_val, 2),
                    "trend_direction": trend_direction,
                    "total_days": len(values),
                    "days_with_data": len(values)
                },
                "analytics_type": "trend",
                "calculation_days": days,
                "from_cache": False
            }
            
            # Cache the result
            analytics_cache.set(user_uuid, "month", days, cache_key, result, 300)  # 5 min TTL
            
            return result
            
        except Exception as e:
            logger.error(f"Error calculating habit trend: {e}")
            raise

    @staticmethod
    async def get_dashboard_summary(db: AsyncSession, user_uuid: str) -> Dict[str, Any]:
        """
        Get lightweight dashboard summary for instant load (< 100ms).
        
        Args:
            db: Database session
            user_uuid: User's UUID
            
        Returns:
            Dictionary with key metrics for dashboard display
            
        Example:
            >>> result = await get_dashboard_summary(db, user_uuid)
            >>> # Returns: {"sleep_avg_7d": 7.2, "exercise_streak": 5, "mood_today": 4}
        """
        # Check cache first (aggressive 30s TTL for instant loads)
        cache_key = "dashboard_summary"
        cached_result = analytics_cache.get(user_uuid, "month", 7, cache_key)
        if cached_result:
            return cached_result
        
        try:
            # Get 7-day analytics for key metrics
            default_habits = await UnifiedHabitAnalyticsService.get_default_habits_analytics(
                db, user_uuid, 7, include_sma=False
            )
            
            # Extract key metrics
            sleep_avg_7d = default_habits["habits"].get("sleep", {}).get("average", 0)
            exercise_streak = 0  # Would need to calculate from exercise data
            mood_today = 0  # Would need to get from today's diary entries
            
            # Check for missing today's data
            missing_today = []
            today = datetime.now(NEPAL_TZ).date()
            
            # Simple check - would be enhanced with actual today's data check
            if sleep_avg_7d == 0:
                missing_today.append("sleep")
            
            # Generate top insights
            top_insights = []
            if sleep_avg_7d >= 7:
                top_insights.append("Great sleep consistency! (7d avg: {:.1f}h)".format(sleep_avg_7d))
            elif sleep_avg_7d < 6:
                top_insights.append("Sleep needs attention (7d avg: {:.1f}h)".format(sleep_avg_7d))
            
            if exercise_streak >= 3:
                top_insights.append("Exercise streak: {} days!".format(exercise_streak))
            
            # Create response
            result = {
                "sleep_avg_7d": round(sleep_avg_7d, 1),
                "exercise_streak": exercise_streak,
                "mood_today": mood_today,
                "missing_today": missing_today,
                "top_insights": top_insights,
                "last_updated": datetime.now(NEPAL_TZ).isoformat(),
                "analytics_type": "dashboard_summary",
                "from_cache": False
            }
            
            # Cache with aggressive TTL for instant loads
            analytics_cache.set(user_uuid, "month", 7, cache_key, result, 30)  # 30s TTL
            
            return result
            
        except Exception as e:
            logger.error(f"Error calculating dashboard summary: {e}")
            raise

    @staticmethod
    async def _get_habit_values(
        metadata_records: List[Any],  # Changed: Receive pre-fetched records
        habit_key: str,
        normalize: bool = False
    ) -> Tuple[List[float], List[str]]:
        """
        Helper method to get values and dates for a specific habit
        from PRE-FETCHED metadata records.
        
        Args:
            metadata_records: Pre-fetched list of DiaryDailyMetadata records
            habit_key: Habit identifier (default habit name or custom habit ID)
            normalize: Whether to normalize values
            
        Returns:
            Tuple of (values, dates) for the habit
        """
        try:
            values = []
            dates = []
            
            # List of known default habits
            default_habits = {
                "sleep", "stress", "exercise", "meditation", "screen_time",
                "steps", "learning", "outdoor", "social"
            }
            
            # List of direct metadata attributes
            direct_attributes = {
                "daily_income": "daily_income",
                "daily_expense": "daily_expense"
            }
            
            for record in metadata_records:
                date_str = record.date.strftime("%Y-%m-%d")
                value = None
                
                try:
                    # 1. Check if it's a default habit (in default_habits_json)
                    if habit_key in default_habits:
                        habits_json = json.loads(record.default_habits_json or "{}")
                        value = habits_json.get(habit_key)
                    
                    # 2. Check if it's a direct attribute
                    elif habit_key in direct_attributes:
                        value = getattr(record, direct_attributes[habit_key], None)
                    
                    # 3. If not, assume it's a defined (custom) habit
                    else:
                        habits_json = json.loads(record.defined_habits_json or "{}")
                        value = habits_json.get("habits", {}).get(habit_key)
                    
                    if value is not None:
                        values.append(float(value))
                        dates.append(date_str)
                        
                except (json.JSONDecodeError, ValueError, TypeError):
                    continue
            
            # Normalize values if requested
            if normalize and values:
                # Simple normalization to 0-1 range
                min_val = min(values)
                max_val = max(values)
                if max_val > min_val:
                    values = [(v - min_val) / (max_val - min_val) for v in values]
            
            return values, dates
            
        except Exception as e:
            logger.error(f"Error getting habit values for {habit_key}: {e}")
            return [], []

    @staticmethod
    def _align_habit_data(
        x_values: List[float],
        x_dates: List[str],
        y_values: List[float],
        y_dates: List[str]
    ) -> List[Dict[str, Any]]:
        """
        Helper method to align two habit datasets by date.
        
        Args:
            x_values: First habit values
            x_dates: First habit dates
            y_values: Second habit values
            y_dates: Second habit dates
            
        Returns:
            List of aligned data points
        """
        # Create date maps
        x_map = {date: value for date, value in zip(x_dates, x_values)}
        y_map = {date: value for date, value in zip(y_dates, y_values)}
        
        # Find common dates
        common_dates = set(x_map.keys()) & set(y_map.keys())
        
        # Create aligned data
        aligned_data = []
        for date in sorted(common_dates):
            aligned_data.append({
                "date": date,
                "x": x_map[date],
                "y": y_map[date]
            })
        
        return aligned_data

    @staticmethod
    def invalidate_user_analytics_cache(user_uuid: str):
        """Clear all cached analytics for a user"""
        analytics_cache.invalidate_user(user_uuid)

    @staticmethod
    async def get_wellness_stats(
        db: AsyncSession,
        user_uuid: str,
        days: int = 30
    ) -> 'WellnessStats':
        """
        Generate comprehensive wellness analytics and insights for personal development tracking.
        
        MOVED FROM: habit_data_service.py (was violating single responsibility principle)
        This is the core analytics function that provides multi-dimensional wellness insights
        by analyzing mood patterns, habit correlations, financial trends, and lifestyle metrics.
        """
        # Import here to avoid circular imports
        from app.schemas.diary import WellnessStats, WellnessTrendPoint
        
        # Calculate date range
        end_date = datetime.now(NEPAL_TZ).date()
        start_date = end_date - timedelta(days=days - 1)
        
        # Get raw data using HabitDataService (proper delegation)
        metadata_service = HabitDataService()
        metadata_records = await metadata_service._get_metadata_in_date_range(
            db, user_uuid, start_date, end_date
        )
        
        # Get diary entries for mood data
        from app.models.diary import DiaryEntry
        from sqlalchemy import select, and_, func
        
        entries_query = (
            select(DiaryEntry)
            .where(
                and_(
                    DiaryEntry.created_by == user_uuid,
                    func.date(DiaryEntry.date) >= start_date,
                    func.date(DiaryEntry.date) <= end_date
                )
            )
            .order_by(DiaryEntry.date)
        )
        entries_result = await db.execute(entries_query)
        entries = entries_result.scalars().all()
        
        # Process data for analytics
        daily_data = {}
        
        # Build daily dataset from metadata
        for record in metadata_records:
            date_str = record.date.strftime("%Y-%m-%d")
            try:
                metrics = json.loads(record.default_habits_json) if record.default_habits_json else {}
            except json.JSONDecodeError:
                metrics = {}
            
            daily_data[date_str] = {
                "metrics": metrics,
                "mood": None,
                "income": float(record.daily_income or 0),
                "expense": float(record.daily_expense or 0),
            }
        
        # Add mood data from entries
        for entry in entries:
            date_str = entry.date.strftime("%Y-%m-%d")
            if date_str not in daily_data:
                daily_data[date_str] = {"metrics": {}, "mood": entry.mood}
            else:
                daily_data[date_str]["mood"] = entry.mood
        
        # Initialize analytics data
        mood_values = []
        sleep_values = []
        stress_values = []
        exercise_values = []
        meditation_values = []
        screen_time_values = []
        steps_values = []
        learning_values = []
        outdoor_values = []
        social_values = []
        
        # Trends
        mood_trend = []
        sleep_trend = []
        stress_trend = []
        exercise_trend = []
        meditation_trend = []
        screen_time_trend = []
        steps_trend = []
        learning_trend = []
        outdoor_trend = []
        social_trend = []
        
        # Mood distribution
        mood_distribution = {}
        
        # Process each day in range
        for single_date in (start_date + timedelta(n) for n in range(days)):
            date_str = single_date.strftime("%Y-%m-%d")
            data = daily_data.get(date_str, {"metrics": {}, "mood": None})
            metrics = data["metrics"]
            mood = data["mood"]
            
            # Mood processing
            if mood is not None:
                mood_values.append(mood)
                mood_distribution[mood] = mood_distribution.get(mood, 0) + 1
                mood_trend.append(WellnessTrendPoint(date=date_str, value=float(mood)))
            else:
                mood_trend.append(WellnessTrendPoint(date=date_str, value=None))
            
            # Habit processing
            for habit_name, values_list, trend_list in [
                ("sleep", sleep_values, sleep_trend),
                ("stress", stress_values, stress_trend),
                ("exercise", exercise_values, exercise_trend),
                ("meditation", meditation_values, meditation_trend),
                ("screen_time", screen_time_values, screen_time_trend),
                ("steps", steps_values, steps_trend),
                ("learning", learning_values, learning_trend),
                ("outdoor", outdoor_values, outdoor_trend),
                ("social", social_values, social_trend),
            ]:
                value = metrics.get(habit_name)
                if value is not None:
                    values_list.append(float(value))
                    trend_list.append(WellnessTrendPoint(date=date_str, value=float(value)))
                else:
                    trend_list.append(WellnessTrendPoint(date=date_str, value=None))
        
        # Calculate analytics
        average_mood = sum(mood_values) / len(mood_values) if mood_values else 0
        average_sleep = sum(sleep_values) / len(sleep_values) if sleep_values else 0
        average_stress = sum(stress_values) / len(stress_values) if stress_values else 0
        average_exercise = sum(exercise_values) / len(exercise_values) if exercise_values else 0
        average_meditation = sum(meditation_values) / len(meditation_values) if meditation_values else 0
        average_screen_time = sum(screen_time_values) / len(screen_time_values) if screen_time_values else 0
        average_steps = sum(steps_values) / len(steps_values) if steps_values else 0
        average_learning = sum(learning_values) / len(learning_values) if learning_values else 0
        average_outdoor = sum(outdoor_values) / len(outdoor_values) if outdoor_values else 0
        average_social = sum(social_values) / len(social_values) if social_values else 0
        
        # Calculate wellness score (simplified version)
        wellness_score = 0
        if average_mood > 0:
            wellness_score += (average_mood / 5) * 20  # Mood component (20%)
        if average_sleep > 0:
            wellness_score += min(average_sleep / 8, 1) * 20  # Sleep component (20%)
        if average_exercise > 0:
            wellness_score += min(average_exercise / 30, 1) * 20  # Exercise component (20%)
        if average_meditation > 0:
            wellness_score += min(average_meditation / 20, 1) * 20  # Meditation component (20%)
        if average_stress > 0:
            wellness_score += (1 - average_stress / 5) * 20  # Stress component (20%)
        
        # Create comprehensive wellness stats
        return WellnessStats(
            period_start=start_date.strftime("%Y-%m-%d"),
            period_end=end_date.strftime("%Y-%m-%d"),
            total_days=days,
            days_with_data=len(daily_data),
            average_mood=round(average_mood, 2),
            mood_trend=mood_trend,
            mood_distribution=mood_distribution,
            average_sleep=round(average_sleep, 2),
            sleep_trend=sleep_trend,
            average_stress=round(average_stress, 2),
            stress_trend=stress_trend,
            average_exercise=round(average_exercise, 2),
            exercise_trend=exercise_trend,
            average_meditation=round(average_meditation, 2),
            meditation_trend=meditation_trend,
            average_screen_time=round(average_screen_time, 2),
            screen_time_trend=screen_time_trend,
            average_steps=round(average_steps, 2),
            steps_trend=steps_trend,
            average_learning=round(average_learning, 2),
            learning_trend=learning_trend,
            average_outdoor=round(average_outdoor, 2),
            outdoor_trend=outdoor_trend,
            average_social=round(average_social, 2),
            social_trend=social_trend,
            overall_wellness_score=round(wellness_score, 2),
            score_components={
                "mood": round((average_mood / 5) * 20, 2) if average_mood > 0 else 0,
                "sleep": round(min(average_sleep / 8, 1) * 20, 2) if average_sleep > 0 else 0,
                "exercise": round(min(average_exercise / 30, 1) * 20, 2) if average_exercise > 0 else 0,
                "meditation": round(min(average_meditation / 20, 1) * 20, 2) if average_meditation > 0 else 0,
                "stress": round((1 - average_stress / 5) * 20, 2) if average_stress > 0 else 0,
            }
        )

    @staticmethod
    def get_cache_stats() -> Dict[str, Any]:
        """Get analytics cache statistics"""
        return analytics_cache.get_cache_stats()


# Global service instance
unified_habit_analytics_service = UnifiedHabitAnalyticsService()
