"""
Moving Averages Calculation Service
Provides SMA (Simple Moving Average) and EMA (Exponential Moving Average)
calculations for wellness trend analysis
"""
import logging
from typing import List, Optional, Dict, Any
from datetime import datetime, timedelta

logger = logging.getLogger(__name__)

class MovingAveragesService:
    """Service for calculating moving averages for wellness trends"""

    @staticmethod
    def calculate_sma(values: List[Optional[float]], period: int) -> List[Optional[float]]:
        """
        Calculate Simple Moving Average (SMA)

        Args:
            values: List of numeric values (None values are ignored)
            period: Number of periods for SMA calculation

        Returns:
            List of SMA values (same length as input, with None for insufficient data)
        """
        if period <= 0:
            return [None] * len(values)

        sma_values = []
        window = []

        for i, value in enumerate(values):
            if value is not None:
                window.append(value)

            # Keep only the last 'period' values
            if len(window) > period:
                window.pop(0)

            # Calculate SMA if we have enough data
            if len(window) >= period:
                sma = sum(window) / len(window)
                sma_values.append(sma)
            else:
                sma_values.append(None)

        return sma_values

    @staticmethod
    def calculate_all_sma(values: List[Optional[float]]) -> Dict[str, List[Optional[float]]]:
        """
        Calculate Simple Moving Averages (SMA) for wellness trend analysis

        Args:
            values: List of numeric values

        Returns:
            Dictionary with different SMA periods
        """
        return {
            # Short-term trends (recent changes)
            "sma_7": MovingAveragesService.calculate_sma(values, 7),

            # Medium-term trends (established patterns)
            "sma_14": MovingAveragesService.calculate_sma(values, 14),

            # Long-term trends (overall direction)
            "sma_30": MovingAveragesService.calculate_sma(values, 30),

            # Very long-term trends (life patterns)
            "sma_90": MovingAveragesService.calculate_sma(values, 90),
        }

    @staticmethod
    def analyze_trend_direction(values: List[Optional[float]], moving_avg: List[Optional[float]]) -> Dict[str, Any]:
        """
        Analyze trend direction based on values vs moving average

        Args:
            values: Original values
            moving_avg: Moving average values

        Returns:
            Trend analysis with direction, strength, and momentum
        """
        if not values or not moving_avg or len(values) < 2:
            return {
                "direction": "insufficient_data",
                "strength": 0,
                "momentum": 0,
                "trend_percentage": 0
            }

        # Get last actual values
        last_values = [v for v in values[-10:] if v is not None]  # Last 10 actual values
        last_ma = [m for m in moving_avg[-10:] if m is not None]    # Last 10 MA values

        if len(last_values) < 2 or len(last_ma) < 2:
            return {
                "direction": "insufficient_data",
                "strength": 0,
                "momentum": 0,
                "trend_percentage": 0
            }

        # Calculate recent changes
        recent_value = last_values[-1]
        previous_value = last_values[0] if len(last_values) > 1 else recent_value
        recent_ma = last_ma[-1]
        previous_ma = last_ma[0] if len(last_ma) > 1 else recent_ma

        # Trend direction
        if recent_value > recent_ma and previous_value <= previous_ma:
            direction = "bullish_crossover"  # Crossing above MA (positive signal)
        elif recent_value < recent_ma and previous_value >= previous_ma:
            direction = "bearish_crossover"  # Crossing below MA (negative signal)
        elif recent_value > recent_ma:
            direction = "bullish"  # Above MA (positive)
        elif recent_value < recent_ma:
            direction = "bearish"  # Below MA (negative)
        else:
            direction = "neutral"

        # Trend strength (percentage distance from MA)
        if recent_ma != 0:
            trend_percentage = ((recent_value - recent_ma) / recent_ma) * 100
            strength = min(abs(trend_percentage) / 10, 10)  # Normalize to 0-10 scale
        else:
            trend_percentage = 0
            strength = 0

        # Momentum (rate of change)
        if previous_value != 0:
            momentum = ((recent_value - previous_value) / abs(previous_value)) * 100
        else:
            momentum = 0

        return {
            "direction": direction,
            "strength": round(strength, 2),
            "momentum": round(momentum, 2),
            "trend_percentage": round(trend_percentage, 2),
            "current_value": recent_value,
            "moving_average": recent_ma,
            "above_ma": recent_value > recent_ma
        }

    @staticmethod
    def get_wellness_trend_insights(trend_analyses: Dict[str, Dict[str, Any]]) -> List[Dict[str, Any]]:
        """
        Generate insights from moving averages trend analyses

        Args:
            trend_analyses: Dictionary of trend analyses for different metrics

        Returns:
            List of actionable insights based on trend patterns
        """
        insights = []

        # Analyze overall wellness score trends
        if "wellness_score" in trend_analyses:
            analysis = trend_analyses["wellness_score"]
            direction = analysis["direction"]
            strength = analysis["strength"]
            momentum = analysis["momentum"]

            if direction == "bullish_crossover" and strength > 1:
                insights.append({
                    "type": "positive",
                    "message": f"🚀 Excellent momentum! Your wellness score is trending upward and crossed above the moving average.",
                    "metric": "trend_momentum",
                    "strength": strength
                })
            elif direction == "bearish_crossover" and strength > 1:
                insights.append({
                    "type": "neutral",
                    "message": f"📉 Your wellness score recently dipped below the moving average. Time to refocus on key habits!",
                    "metric": "trend_warning",
                    "strength": strength
                })
            elif direction == "bullish" and momentum > 5:
                insights.append({
                    "type": "positive",
                    "message": f"💪 Strong upward momentum! Keep up the great work with your wellness routine.",
                    "metric": "positive_momentum",
                    "strength": momentum
                })

        # Check for consistent improvements across multiple metrics
        positive_trends = sum(1 for analysis in trend_analyses.values()
                            if analysis["direction"] in ["bullish", "bullish_crossover"]
                            and analysis["strength"] > 0.5)

        if positive_trends >= 3:
            insights.append({
                "type": "positive",
                "message": f"🌟 Holistic improvement! {positive_trends} different wellness metrics are showing positive trends.",
                "metric": "holistic_growth",
                "metrics_count": positive_trends
            })

        # Check for concerning patterns
        concerning_trends = sum(1 for analysis in trend_analyses.values()
                              if analysis["direction"] in ["bearish", "bearish_crossover"]
                              and analysis["strength"] > 1.5)

        if concerning_trends >= 2:
            insights.append({
                "type": "neutral",
                "message": f"⚠️ {concerning_trends} metrics need attention. Consider focusing on one area at a time.",
                "metric": "attention_needed",
                "metrics_count": concerning_trends
            })

        return insights

# Global service instance
moving_averages_service = MovingAveragesService()