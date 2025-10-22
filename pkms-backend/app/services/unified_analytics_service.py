"""
Unified Analytics Service
Common analytics logic for all endpoints with unified timeframes and caching
"""
import logging
from typing import Dict, Any, List, Optional
from sqlalchemy.ext.asyncio import AsyncSession
from datetime import datetime, timedelta
from app.config import NEPAL_TZ

from .analytics_config import (
    TIME_FRAMES, get_timeframe_config, get_date_range,
    should_show_loading_state, quantize_data_for_chart
)
from .unified_analytics_cache import analytics_cache

logger = logging.getLogger(__name__)

class UnifiedAnalyticsService:
    """Unified service for all analytics endpoints"""

    @staticmethod
    async def get_analytics_with_unified_timeframes(
        db: AsyncSession,
        user_uuid: str,
        analytics_function,  # Function that performs the actual calculation
        analytics_type: str,  # e.g., "wellness_stats", "habit_analytics", "financial_wellness"
        days: int = 30,
        include_chart_data: bool = True
    ) -> Dict[str, Any]:
        """
        Get analytics with unified timeframes and caching

        Args:
            db: Database session
            user_uuid: User's UUID
            analytics_function: Function to call for actual analytics calculation
            analytics_type: Type of analytics for caching
            days: Number of days for primary analysis
            include_chart_data: Whether to include quantized chart data

        Returns:
            Unified analytics response with all timeframes
        """
        # Determine if loading state is needed
        show_loading, loading_message = should_show_loading_state(days)

        # Check cache first
        timeframe_config = get_timeframe_config("month")  # Use month as reference
        cache_key_days = days

        cached_result = analytics_cache.get(user_uuid, "month", cache_key_days, analytics_type)
        if cached_result and not show_loading:  # Don't use cache for long calculations (want fresh data)
            logger.info(f"Using cached analytics for {analytics_type}")
            return {
                **cached_result,
                "from_cache": True,
                "loading_info": None
            }

        # Perform calculation
        if show_loading:
            logger.info(f"Starting {analytics_type} calculation for user {user_uuid}: {days} days")
            loading_info = {
                "show_loading": True,
                "message": loading_message,
                "estimated_seconds": min(30, days // 10)  # Rough estimate
            }
        else:
            loading_info = None

        try:
            # Get primary analytics
            primary_result = await analytics_function(db, user_uuid, days)

            # Get analytics for all timeframes with cascade caching
            timeframe_results = {}
            cascade_cache_entries = []  # Store for cascade caching

            for timeframe_name, config in TIME_FRAMES.items():
                try:
                    result = await analytics_function(db, user_uuid, config["days"])

                    # Create timeframe result
                    timeframe_result = {
                        "score": getattr(result, 'overall_wellness_score', None),
                        "period_start": getattr(result, 'period_start', None),
                        "period_end": getattr(result, 'period_end', None),
                        "total_days": getattr(result, 'total_days', config["days"]),
                        "days_with_data": getattr(result, 'days_with_data', 0)
                    }

                    timeframe_results[timeframe_name] = timeframe_result

                    # Prepare for cascade caching (cache intermediate results)
                    if days >= config["days"]:  # Only cache if we're calculating for equal or longer period
                        cascade_cache_entries.append({
                            "timeframe": timeframe_name,
                            "cache_days": config["days"],
                            "result": timeframe_result,
                            "ttl": config["cache_ttl"]
                        })

                except Exception as e:
                    logger.error(f"Error calculating {analytics_type} for {timeframe_name}: {e}")
                    timeframe_results[timeframe_name] = {
                        "score": None,
                        "error": str(e),
                        "period_start": (datetime.now(NEPAL_TZ).date() - timedelta(days=config["days"])).strftime("%Y-%m-%d"),
                        "period_end": datetime.now(NEPAL_TZ).date().strftime("%Y-%m-%d"),
                        "total_days": config["days"],
                        "days_with_data": 0
                    }

            # Cascade caching: Store all intermediate results when calculating long periods
            if len(cascade_cache_entries) > 1:  # More than just the primary result
                logger.info(f"Cascade caching {len(cascade_cache_entries)} intermediate results for {analytics_type}")

                for cache_entry in cascade_cache_entries:
                    if cache_entry["timeframe"] != "month" or cache_entry["cache_days"] != days:  # Don't duplicate primary cache
                        # Create a simplified result for caching
                        cache_data = {
                            "timeframe_results": {cache_entry["timeframe"]: cache_entry["result"]},
                            "timeframe_config": TIME_FRAMES,
                            "analytics_type": analytics_type,
                            "calculation_days": cache_entry["cache_days"],
                            "from_cache": False,
                            "loading_info": None,
                            "is_cascade_cache": True
                        }

                        analytics_cache.set(
                            user_uuid, cache_entry["timeframe"], cache_entry["cache_days"],
                            analytics_type, cache_data, cache_entry["ttl"]
                        )

            # Create unified response
            unified_response = {
                "primary_result": primary_result,
                "all_timeframes": timeframe_results,
                "timeframe_config": TIME_FRAMES,
                "analytics_type": analytics_type,
                "calculation_days": days,
                "from_cache": False,
                "loading_info": loading_info
            }

            # Add quantized chart data if requested
            if include_chart_data and hasattr(primary_result, 'mood_trend'):
                chart_data = UnifiedAnalyticsService._create_quantized_chart_data(
                    primary_result, days
                )

                # Add moving averages to chart data
                chart_data_with_moving_averages = UnifiedAnalyticsService._add_moving_averages_to_chart_data(
                    chart_data, primary_result
                )

                unified_response["chart_data"] = chart_data_with_moving_averages

            # Cache the result (don't cache very long calculations to encourage fresh data)
            if not show_loading:
                analytics_cache.set(
                    user_uuid, "month", cache_key_days, analytics_type,
                    unified_response, timeframe_config["cache_ttl"]
                )

            if show_loading:
                logger.info(f"Completed {analytics_type} calculation for user {user_uuid}: {days} days")

            return unified_response

        except Exception as e:
            logger.error(f"Error in unified analytics for {analytics_type}: {e}")
            raise

    @staticmethod
    def _create_quantized_chart_data(primary_result: Any, days: int) -> Dict[str, Any]:
        """Create quantized chart data from raw trend data"""
        chart_data = {}

        # Get timeframe config for quantization
        if days <= 7:
            target_points = days  # Daily for week
        elif days <= 30:
            target_points = 4   # Weekly for month
        elif days <= 90:
            target_points = 12  # Weekly for quarter
        elif days <= 180:
            target_points = 6   # Monthly for 6 months
        else:
            target_points = 12  # Monthly for year

        # Process each trend data type
        trend_attributes = [
            'mood_trend', 'sleep_trend', 'stress_trend', 'exercise_trend',
            'meditation_trend', 'screen_time_trend', 'steps_trend',
            'learning_trend', 'outdoor_trend', 'social_trend'
        ]

        for attr in trend_attributes:
            if hasattr(primary_result, attr):
                raw_trend = getattr(primary_result, attr)
                if raw_trend and len(raw_trend) > 0:
                    # Extract values (WellnessTrendPoint objects)
                    values = [point.value if hasattr(point, 'value') else point for point in raw_trend]
                    dates = [point.date if hasattr(point, 'date') else f"Day {i+1}"
                            for i, point in enumerate(raw_trend)]

                    # Quantize values
                    quantized_values = quantize_data_for_chart(values, target_points)

                    # Sample dates to match quantized values
                    if len(dates) > len(quantized_values):
                        step = len(dates) // len(quantized_values)
                        quantized_dates = [dates[i*step] for i in range(len(quantized_values))]
                    else:
                        quantized_dates = dates[:len(quantized_values)]

                    chart_data[attr] = {
                        "labels": quantized_dates,
                        "values": quantized_values,
                        "raw_points": len(raw_trend),
                        "quantized_points": len(quantized_values)
                    }

        return chart_data

    @staticmethod
    def _add_moving_averages_to_chart_data(chart_data: Dict[str, Any], primary_result: Any) -> Dict[str, Any]:
        """Add moving averages (SMA/EMA) to chart data"""
        from .moving_averages import moving_averages_service

        enhanced_chart_data = chart_data.copy()

        # Add moving averages for each metric
        for metric_name, metric_data in chart_data.items():
            if "values" in metric_data and len(metric_data["values"]) > 0:
                values = metric_data["values"]

                # Calculate all simple moving averages (lightweight)
                all_averages = moving_averages_service.calculate_all_sma(values)

                # Add to chart data
                enhanced_chart_data[metric_name]["moving_averages"] = all_averages

                # Analyze trend direction for different periods
                trend_analyses = {}
                for period_name, ma_values in all_averages.items():
                    if ma_values and len(ma_values) > 0:
                        trend_analysis = moving_averages_service.analyze_trend_direction(values, ma_values)
                        trend_analyses[period_name] = trend_analysis

                enhanced_chart_data[metric_name]["trend_analyses"] = trend_analyses

        return enhanced_chart_data

    @staticmethod
    def get_loading_state_info(days: int) -> Dict[str, Any]:
        """Get loading state information for frontend"""
        show_loading, message = should_show_loading_state(days)

        return {
            "show_loading": show_loading,
            "message": message,
            "estimated_seconds": min(30, days // 10) if show_loading else 0,
            "progress_steps": [
                "📊 Gathering your wellness data...",
                "🔍 Analyzing patterns and trends...",
                "📈 Calculating insights and scores...",
                "✨ Generating personalized recommendations..."
            ] if show_loading else []
        }

    @staticmethod
    def invalidate_user_cache(user_uuid: str):
        """Clear all cached analytics for a user"""
        analytics_cache.invalidate_user(user_uuid)

    @staticmethod
    def get_cache_stats() -> Dict[str, Any]:
        """Get analytics cache statistics"""
        return analytics_cache.get_cache_stats()

# Global service instance
unified_analytics_service = UnifiedAnalyticsService()