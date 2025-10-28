"""
Habit Trend Analysis Service

Comprehensive trend analysis and statistical calculations for habit analytics.
Provides SMA (Simple Moving Average), EMA (Exponential Moving Average), correlation
analysis, streak calculations, and trend insights for both default and defined habits.

This service consolidates all trend-related calculations that were previously
scattered across moving_averages.py and daily_insights_service.py, providing
a unified interface for habit analytics.
"""

import logging
import math
from typing import List, Optional, Dict, Any

logger = logging.getLogger(__name__)


class HabitTrendAnalysisService:
    """
    Service for calculating trend analysis, correlations, and statistical insights
    for habit tracking and wellness analytics.
    
    Consolidates SMA/EMA calculations, correlation analysis, streak tracking,
    and trend direction analysis into a unified service for habit analytics.
    """

    @staticmethod
    def calculate_sma(values: List[Optional[float]], period: int) -> List[Optional[float]]:
        """
        Calculate Simple Moving Average (SMA) for a given period.
        
        Args:
            values: List of numeric values (None values are ignored)
            period: Number of periods for SMA calculation
            
        Returns:
            List of SMA values (same length as input, with None for insufficient data)
            
        Example:
            >>> values = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
            >>> sma_3 = calculate_sma(values, 3)
            >>> # Returns: [None, None, 2.0, 3.0, 4.0, 5.0, 6.0, 7.0, 8.0, 9.0]
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
    def calculate_ema(values: List[Optional[float]], period: int, alpha: Optional[float] = None) -> List[Optional[float]]:
        """
        Calculate Exponential Moving Average (EMA) for a given period.
        
        Args:
            values: List of numeric values (None values are ignored)
            period: Number of periods for EMA calculation
            alpha: Smoothing factor (if None, calculated as 2/(period+1))
            
        Returns:
            List of EMA values (same length as input, with None for insufficient data)
            
        Example:
            >>> values = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
            >>> ema_3 = calculate_ema(values, 3)
            >>> # Returns EMA values with exponential smoothing
        """
        if period <= 0:
            return [None] * len(values)

        if alpha is None:
            alpha = 2.0 / (period + 1)

        ema_values = []
        ema = None

        for value in values:
            if value is not None:
                if ema is None:
                    ema = value  # First value
                else:
                    ema = alpha * value + (1 - alpha) * ema
                ema_values.append(ema)
            else:
                ema_values.append(ema)  # Keep last EMA value

        return ema_values

    @staticmethod
    def calculate_all_sma(values: List[Optional[float]], windows: List[int] = None) -> Dict[str, List[Optional[float]]]:
        """
        Calculate Simple Moving Averages (SMA) for multiple periods.
        
        Args:
            values: List of numeric values
            windows: List of SMA periods (default: [7, 14, 30, 90])
            
        Returns:
            Dictionary with different SMA periods
            
        Example:
            >>> values = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
            >>> all_sma = calculate_all_sma(values)
            >>> # Returns: {"sma_7": [...], "sma_14": [...], "sma_30": [...], "sma_90": [...]}
        """
        if windows is None:
            windows = [7, 14, 30, 90]

        result = {}
        for window in windows:
            result[f"sma_{window}"] = HabitTrendAnalysisService.calculate_sma(values, window)
        
        return result

    @staticmethod
    def calculate_correlation(x_values: List[Optional[float]], y_values: List[Optional[float]]) -> Dict[str, Any]:
        """
        Calculate Pearson correlation coefficient between two variables.
        
        Args:
            x_values: First variable values
            y_values: Second variable values
            
        Returns:
            Dictionary with correlation coefficient, interpretation, and statistics
            
        Example:
            >>> x = [1, 2, 3, 4, 5]
            >>> y = [2, 4, 6, 8, 10]
            >>> result = calculate_correlation(x, y)
            >>> # Returns: {"coefficient": 1.0, "interpretation": "Perfect positive correlation"}
        """
        # Filter out None values and ensure same length
        pairs = [(x, y) for x, y in zip(x_values, y_values) if x is not None and y is not None]
        
        if len(pairs) < 2:
            return {
                "coefficient": 0.0,
                "interpretation": "Insufficient data",
                "sample_size": len(pairs),
                "pairs": []
            }
        
        x_vals = [pair[0] for pair in pairs]
        y_vals = [pair[1] for pair in pairs]
        
        n = len(x_vals)
        x_mean = sum(x_vals) / n
        y_mean = sum(y_vals) / n
        
        # Calculate Pearson correlation coefficient
        numerator = sum((x - x_mean) * (y - y_mean) for x, y in zip(x_vals, y_vals))
        x_std = math.sqrt(sum((x - x_mean) ** 2 for x in x_vals))
        y_std = math.sqrt(sum((y - y_mean) ** 2 for y in y_vals))
        
        if x_std == 0 or y_std == 0:
            return {
                "coefficient": 0.0,
                "interpretation": "No variation in data",
                "sample_size": n,
                "pairs": pairs
            }
        
        correlation = numerator / (x_std * y_std)
        
        # Interpret correlation strength
        abs_corr = abs(correlation)
        if abs_corr >= 0.9:
            interpretation = "Very strong correlation"
        elif abs_corr >= 0.7:
            interpretation = "Strong correlation"
        elif abs_corr >= 0.5:
            interpretation = "Moderate correlation"
        elif abs_corr >= 0.3:
            interpretation = "Weak correlation"
        else:
            interpretation = "Very weak or no correlation"
        
        # Add direction
        if correlation > 0:
            interpretation += " (positive)"
        elif correlation < 0:
            interpretation += " (negative)"
        
        return {
            "coefficient": round(correlation, 4),
            "interpretation": interpretation,
            "sample_size": n,
            "pairs": pairs,
            "x_mean": round(x_mean, 2),
            "y_mean": round(y_mean, 2),
            "x_std": round(x_std, 2),
            "y_std": round(y_std, 2)
        }

    @staticmethod
    def calculate_habit_streaks(habit_data: List[Dict[str, Any]], habit_id: str) -> Dict[str, Any]:
        """
        Calculate current and best streaks for a specific habit.
        
        Args:
            habit_data: List of daily habit entries with dates and values
            habit_id: Identifier for the habit to analyze
            
        Returns:
            Dictionary with current streak, best streak, and streak statistics
            
        Example:
            >>> data = [{"date": "2025-01-01", "value": 1}, {"date": "2025-01-02", "value": 1}]
            >>> streaks = calculate_habit_streaks(data, "exercise")
            >>> # Returns: {"current": 2, "best": 5, "total_days": 10, "completion_rate": 0.8}
        """
        if not habit_data:
            return {
                "current": 0,
                "best": 0,
                "total_days": 0,
                "completion_rate": 0.0,
                "last_activity": None
            }
        
        # Sort by date
        sorted_data = sorted(habit_data, key=lambda x: x.get("date", ""))
        
        current_streak = 0
        best_streak = 0
        temp_streak = 0
        total_days = len(sorted_data)
        completed_days = 0
        last_activity = None
        
        for entry in sorted_data:
            value = entry.get("value", 0)
            if value and value > 0:  # Habit completed
                completed_days += 1
                temp_streak += 1
                best_streak = max(best_streak, temp_streak)
                last_activity = entry.get("date")
            else:  # Habit not completed
                temp_streak = 0
        
        # Current streak is the temp_streak at the end
        current_streak = temp_streak
        
        completion_rate = completed_days / total_days if total_days > 0 else 0.0
        
        return {
            "current": current_streak,
            "best": best_streak,
            "total_days": total_days,
            "completion_rate": round(completion_rate, 3),
            "last_activity": last_activity,
            "completed_days": completed_days
        }

    @staticmethod
    def normalize_to_target(values: List[Optional[float]], target: float) -> List[Optional[float]]:
        """
        Normalize values to percentage of target (0-100%).
        
        Args:
            values: List of numeric values
            target: Target value for 100% normalization
            
        Returns:
            List of normalized values as percentages
            
        Example:
            >>> values = [8, 9, 10, 11, 12]
            >>> target = 10
            >>> normalized = normalize_to_target(values, target)
            >>> # Returns: [80.0, 90.0, 100.0, 110.0, 120.0]
        """
        if target <= 0:
            return [0.0 if v is not None else None for v in values]
        
        normalized = []
        for value in values:
            if value is not None:
                percentage = (value / target) * 100
                normalized.append(round(percentage, 2))
            else:
                normalized.append(None)
        
        return normalized

    @staticmethod
    def analyze_trend_direction(values: List[Optional[float]], moving_avg: List[Optional[float]]) -> Dict[str, Any]:
        """
        Analyze trend direction based on values vs moving average.
        
        Args:
            values: Original values
            moving_avg: Moving average values
            
        Returns:
            Trend analysis with direction, strength, and momentum
            
        Example:
            >>> values = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
            >>> ma = [None, None, 2, 3, 4, 5, 6, 7, 8, 9]
            >>> trend = analyze_trend_direction(values, ma)
            >>> # Returns: {"direction": "bullish", "strength": 1.0, "momentum": 10.0}
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
    def get_trend_insights(trend_analyses: Dict[str, Dict[str, Any]]) -> List[Dict[str, Any]]:
        """
        Generate actionable insights from trend analyses.
        
        Args:
            trend_analyses: Dictionary of trend analyses for different metrics
            
        Returns:
            List of actionable insights based on trend patterns
            
        Example:
            >>> trends = {"sleep": {"direction": "bullish", "strength": 2.0}}
            >>> insights = get_trend_insights(trends)
            >>> # Returns: [{"type": "positive", "message": "Sleep improving!", ...}]
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
                    "message": "🚀 Excellent momentum! Your wellness score is trending upward and crossed above the moving average.",
                    "metric": "trend_momentum",
                    "strength": strength
                })
            elif direction == "bearish_crossover" and strength > 1:
                insights.append({
                    "type": "neutral",
                    "message": "📉 Your wellness score recently dipped below the moving average. Time to refocus on key habits!",
                    "metric": "trend_warning",
                    "strength": strength
                })
            elif direction == "bullish" and momentum > 5:
                insights.append({
                    "type": "positive",
                    "message": "💪 Strong upward momentum! Keep up the great work with your wellness routine.",
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
habit_trend_analysis_service = HabitTrendAnalysisService()
