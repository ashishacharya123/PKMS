"""
Daily Insights Service - Advanced Analytics for Diary Data
Analyzes patterns, correlations, and insights from diary entries and daily metadata.
"""

import logging
import json
from typing import Dict, List, Any, Optional, Tuple
from datetime import datetime, timedelta
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, and_, or_
from sqlalchemy.orm import selectinload

from app.models.diary import DiaryEntry, DiaryDailyMetadata
from app.config import NEPAL_TZ

logger = logging.getLogger(__name__)


class DailyInsightsService:
    """Service for generating advanced analytics and insights from diary data"""
    
    @staticmethod
    async def get_work_life_balance(db: AsyncSession, user_uuid: str, days: int = 30) -> Dict[str, Any]:
        """Analyze office vs home day patterns"""
        try:
            cutoff_date = datetime.now(NEPAL_TZ) - timedelta(days=days)
            
            # Get office vs home day data
            office_query = select(
                func.coalesce(func.avg(DiaryDailyMetadata.daily_income), 0).label('avg_income'),
                func.coalesce(func.avg(DiaryDailyMetadata.daily_expense), 0).label('avg_expense'),
                func.count().label('total_days')
            ).where(
                and_(
                    DiaryDailyMetadata.created_by == user_uuid,
                    DiaryDailyMetadata.is_office_day.is_(True),
                    DiaryDailyMetadata.date >= cutoff_date
                )
            )
            
            home_query = select(
                func.coalesce(func.avg(DiaryDailyMetadata.daily_income), 0).label('avg_income'),
                func.coalesce(func.avg(DiaryDailyMetadata.daily_expense), 0).label('avg_expense'),
                func.count().label('total_days')
            ).where(
                and_(
                    DiaryDailyMetadata.created_by == user_uuid,
                    DiaryDailyMetadata.is_office_day.is_(False),
                    DiaryDailyMetadata.date >= cutoff_date
                )
            )
            
            # Get mood data for office vs home days
            mood_query = select(
                DiaryDailyMetadata.is_office_day,
                func.avg(DiaryEntry.mood).label('avg_mood'),
                func.count().label('entry_count')
            ).join(
                DiaryEntry, 
                and_(
                    DiaryEntry.created_by == DiaryDailyMetadata.created_by,
                    func.date(DiaryEntry.date) == func.date(DiaryDailyMetadata.date)
                )
            ).where(
                and_(
                    DiaryDailyMetadata.created_by == user_uuid,
                    DiaryEntry.mood.isnot(None),
                    DiaryDailyMetadata.date >= cutoff_date
                )
            ).group_by(DiaryDailyMetadata.is_office_day)
            
            # Execute queries
            office_result = await db.execute(office_query)
            home_result = await db.execute(home_query)
            mood_result = await db.execute(mood_query)
            
            office_data = office_result.fetchone()
            home_data = home_result.fetchone()
            mood_data = mood_result.fetchall()
            
            # Parse mood data
            office_mood = None
            home_mood = None
            for row in mood_data:
                if row.is_office_day:
                    office_mood = row.avg_mood
                else:
                    home_mood = row.avg_mood
            
            office_days_total = int(office_data.total_days) if office_data else 0
            office_avg_income = float(office_data.avg_income or 0) if office_data else 0.0
            office_avg_expense = float(office_data.avg_expense or 0) if office_data else 0.0
            home_days_total = int(home_data.total_days) if home_data else 0
            home_avg_income = float(home_data.avg_income or 0) if home_data else 0.0
            home_avg_expense = float(home_data.avg_expense or 0) if home_data else 0.0

            return {
                "office_days": {
                    "total_days": office_days_total,
                    "avg_income": office_avg_income,
                    "avg_expense": office_avg_expense,
                    "avg_mood": float(office_mood or 0)
                },
                "home_days": {
                    "total_days": home_days_total,
                    "avg_income": home_avg_income,
                    "avg_expense": home_avg_expense,
                    "avg_mood": float(home_mood or 0)
                },
                "analysis_period": f"{days} days",
                "insights": DailyInsightsService._generate_work_life_insights(
                    office_data, home_data, office_mood, home_mood
                )
            }
            
        except Exception:
            logger.exception("Error in work_life_balance analysis")
            return {"error": "work_life_balance_failed"}
    
    @staticmethod
    async def get_financial_wellness_correlation(db: AsyncSession, user_uuid: str, days: int = 60) -> Dict[str, Any]:
        """Correlate financial data with mood and habits"""
        try:
            cutoff_date = datetime.now(NEPAL_TZ) - timedelta(days=days)
            
            # Get financial vs mood correlation
            financial_mood_query = select(
                DiaryDailyMetadata.daily_income,
                DiaryDailyMetadata.daily_expense,
                func.avg(DiaryEntry.mood).label('avg_mood'),
                func.count().label('entry_count')
            ).join(
                DiaryEntry,
                and_(
                    DiaryEntry.created_by == DiaryDailyMetadata.created_by,
                    func.date(DiaryEntry.date) == func.date(DiaryDailyMetadata.date)
                )
            ).where(
                and_(
                    DiaryDailyMetadata.created_by == user_uuid,
                    DiaryEntry.mood.isnot(None),
                    DiaryDailyMetadata.date >= cutoff_date
                )
            ).group_by(
                DiaryDailyMetadata.daily_income,
                DiaryDailyMetadata.daily_expense
            )
            
            result = await db.execute(financial_mood_query)
            financial_data = result.fetchall()
            
            # Analyze realistic patterns
            salary_days = []  # Days with actual income (salary)
            no_income_days = []  # Days with 0 income
            high_expense_days = []  # Days with high spending
            normal_expense_days = []  # Days with normal spending
            
            for row in financial_data:
                # Salary days (when you actually get paid)
                if row.daily_income and row.daily_income > 500:  # Realistic salary threshold
                    salary_days.append(row.avg_mood)
                # No income days (most days)
                elif row.daily_income == 0 or row.daily_income is None:
                    no_income_days.append(row.avg_mood)
                
                # Expense patterns (more meaningful than income)
                if row.daily_expense and row.daily_expense > 800:  # High spending days
                    high_expense_days.append(row.avg_mood)
                elif row.daily_expense and row.daily_expense <= 300:  # Normal spending days
                    normal_expense_days.append(row.avg_mood)
            
            return {
                "salary_days_mood": float(sum(salary_days) / len(salary_days)) if salary_days else 0,
                "no_income_days_mood": float(sum(no_income_days) / len(no_income_days)) if no_income_days else 0,
                "high_expense_mood": float(sum(high_expense_days) / len(high_expense_days)) if high_expense_days else 0,
                "normal_expense_mood": float(sum(normal_expense_days) / len(normal_expense_days)) if normal_expense_days else 0,
                "analysis_period": f"{days} days",
                "insights": DailyInsightsService._generate_financial_insights(
                    salary_days, no_income_days, high_expense_days, normal_expense_days
                )
            }
            
        except Exception:
            logger.exception("Error in financial wellness analysis")
            return {"error": "financial_wellness_failed"}
    
    @staticmethod
    async def get_weekly_rhythm_analysis(db: AsyncSession, user_uuid: str, days: int = 90) -> Dict[str, Any]:
        """Analyze day-of-week patterns"""
        try:
            cutoff_date = datetime.now(NEPAL_TZ) - timedelta(days=days)
            
            # Get day-of-week patterns
            weekly_query = select(
                DiaryDailyMetadata.day_of_week,
                func.avg(DiaryEntry.mood).label('avg_mood'),
                func.coalesce(func.avg(DiaryDailyMetadata.daily_income), 0).label('avg_income'),
                func.coalesce(func.avg(DiaryDailyMetadata.daily_expense), 0).label('avg_expense'),
                func.count().label('total_entries')
            ).join(
                DiaryEntry,
                and_(
                    DiaryEntry.created_by == DiaryDailyMetadata.created_by,
                    func.date(DiaryEntry.date) == func.date(DiaryDailyMetadata.date)
                )
            ).where(
                and_(
                    DiaryDailyMetadata.created_by == user_uuid,
                    DiaryDailyMetadata.date >= cutoff_date
                )
            ).group_by(DiaryDailyMetadata.day_of_week)
            
            result = await db.execute(weekly_query)
            weekly_data = result.fetchall()
            
            # Organize by day
            day_names = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]
            patterns = {}
            
            for row in weekly_data:
                # Skip rows with invalid day_of_week to prevent contamination
                if row.day_of_week is None:
                    continue

                day_name = day_names[row.day_of_week]
                patterns[day_name] = {
                    "avg_mood": float(row.avg_mood or 0),
                    "avg_income": float(row.avg_income or 0),
                    "avg_expense": float(row.avg_expense or 0),
                    "total_entries": row.total_entries
                }
            
            return {
                "weekly_patterns": patterns,
                "analysis_period": f"{days} days",
                "insights": DailyInsightsService._generate_weekly_insights(patterns)
            }
            
        except Exception:
            logger.exception("Error in weekly rhythm analysis")
            return {"error": "weekly_rhythm_failed"}
    
    @staticmethod
    async def get_temperature_mood_correlation(db: AsyncSession, user_uuid: str, days: int = 60) -> Dict[str, Any]:
        """Analyze weather/temperature impact on mood"""
        try:
            cutoff_date = datetime.now(NEPAL_TZ) - timedelta(days=days)
            
            # Get weather vs mood correlation
            weather_query = select(
                DiaryEntry.weather_code,
                func.avg(DiaryEntry.mood).label('avg_mood'),
                func.count().label('entry_count')
            ).where(
                and_(
                    DiaryEntry.created_by == user_uuid,
                    DiaryEntry.weather_code.isnot(None),
                    DiaryEntry.mood.isnot(None),
                    DiaryEntry.date >= cutoff_date
                )
            ).group_by(DiaryEntry.weather_code)
            
            result = await db.execute(weather_query)
            weather_data = result.fetchall()
            
            # Map weather codes to temperature ranges (Nepal-appropriate!)
            temperature_mapping = {
                0: "Freezing (0-5°C)",
                1: "Cold (5-10°C)",
                2: "Cool (10-15°C)",
                3: "Mild (15-20°C)",
                4: "Warm (20-25°C)",
                5: "Hot (25-35°C)",
                6: "Scorching (35°C+)"  # Birgunj summer! 🔥
            }
            
            temperature_mood = {}
            for row in weather_data:
                temp_range = temperature_mapping.get(row.weather_code, "Unknown")
                temperature_mood[temp_range] = {
                    "avg_mood": float(row.avg_mood),
                    "entry_count": row.entry_count
                }
            
            return {
                "temperature_mood": temperature_mood,
                "analysis_period": f"{days} days",
                "insights": DailyInsightsService._generate_temperature_insights(temperature_mood)
            }
            
        except Exception:
            logger.exception("Error in temperature mood analysis")
            return {"error": "temperature_mood_failed"}
    
    @staticmethod
    async def get_writing_therapy_insights(db: AsyncSession, user_uuid: str, days: int = 90) -> Dict[str, Any]:
        """Analyze mood vs content length correlation"""
        try:
            cutoff_date = datetime.now(NEPAL_TZ) - timedelta(days=days)
            
            # Get mood vs content length correlation
            writing_query = select(
                DiaryEntry.mood,
                func.avg(DiaryEntry.content_length).label('avg_content_length'),
                func.count().label('entry_count')
            ).where(
                and_(
                    DiaryEntry.created_by == user_uuid,
                    DiaryEntry.mood.isnot(None),
                    DiaryEntry.content_length > 0,
                    DiaryEntry.date >= cutoff_date
                )
            ).group_by(DiaryEntry.mood)
            
            result = await db.execute(writing_query)
            writing_data = result.fetchall()
            
            # Organize by mood level
            mood_writing = {}
            for row in writing_data:
                mood_level = f"Mood {row.mood}"
                mood_writing[mood_level] = {
                    "avg_content_length": int(row.avg_content_length),
                    "entry_count": row.entry_count
                }
            
            return {
                "mood_writing": mood_writing,
                "analysis_period": f"{days} days",
                "insights": DailyInsightsService._generate_writing_insights(mood_writing)
            }
            
        except Exception:
            logger.exception("Error in writing therapy analysis")
            return {"error": "writing_therapy_failed"}
    
    # Helper methods for generating insights
    @staticmethod
    def _generate_work_life_insights(office_data, home_data, office_mood, home_mood) -> List[str]:
        insights = []
        
        if office_mood and home_mood:
            if office_mood < home_mood - 0.5:
                insights.append("Your mood is significantly lower on office days - consider work-life balance")
            elif office_mood > home_mood + 0.5:
                insights.append("You seem happier on office days - work might be energizing!")
        
        if office_data and home_data:
            off_exp = float(office_data.avg_expense or 0)
            home_exp = float(home_data.avg_expense or 0)
            if off_exp > home_exp * 1.5:
                insights.append("Office days have much higher expenses - consider cost optimization")
        
        return insights
    
    @staticmethod
    def _generate_financial_insights(salary_days, no_income_days, high_expense_days, normal_expense_days) -> List[str]:
        insights = []
        
        # Salary vs non-salary day analysis
        if salary_days and no_income_days:
            salary_mood = sum(salary_days) / len(salary_days)
            no_income_mood = sum(no_income_days) / len(no_income_days)
            if salary_mood > no_income_mood + 0.5:
                insights.append("You're happier on salary days - getting paid boosts your mood!")
            elif salary_mood < no_income_mood - 0.5:
                insights.append("Salary days actually lower your mood - maybe financial stress on payday?")
        
        # High vs normal expense analysis
        if high_expense_days and normal_expense_days:
            high_expense_mood = sum(high_expense_days) / len(high_expense_days)
            normal_expense_mood = sum(normal_expense_days) / len(normal_expense_days)
            if high_expense_mood < normal_expense_mood - 0.5:
                insights.append("High spending days correlate with lower mood - consider budgeting")
            elif high_expense_mood > normal_expense_mood + 0.5:
                insights.append("You're happier when spending more - maybe retail therapy works!")
        
        return insights
    
    @staticmethod
    def _generate_weekly_insights(patterns) -> List[str]:
        insights = []
        
        if "Monday" in patterns and "Friday" in patterns:
            if patterns["Monday"]["avg_mood"] < patterns["Friday"]["avg_mood"] - 0.5:
                insights.append("Monday blues detected - Friday vibes are much better!")
        
        if "Saturday" in patterns and "Sunday" in patterns:
            if patterns["Saturday"]["avg_mood"] > patterns["Sunday"]["avg_mood"]:
                insights.append("Saturday is your happiest day - Sunday might have end-of-weekend blues")
        
        return insights
    
    @staticmethod
    def _generate_temperature_insights(temperature_mood) -> List[str]:
        insights = []
        
        # Find best and worst temperature moods
        if temperature_mood:
            best_temp = max(temperature_mood.items(), key=lambda x: x[1]["avg_mood"])
            worst_temp = min(temperature_mood.items(), key=lambda x: x[1]["avg_mood"])
            
            if best_temp[1]["avg_mood"] > worst_temp[1]["avg_mood"] + 1.0:
                insights.append(f"You're happiest in {best_temp[0]} weather - {worst_temp[0]} affects your mood negatively")
        
        return insights
    
    @staticmethod
    def _generate_writing_insights(mood_writing) -> List[str]:
        insights = []
        
        if "Mood 1" in mood_writing and "Mood 5" in mood_writing:
            if mood_writing["Mood 1"]["avg_content_length"] > mood_writing["Mood 5"]["avg_content_length"]:
                insights.append("You write more when feeling down - writing might be therapeutic!")
            else:
                insights.append("You write more when happy - positive emotions fuel creativity!")
        
        return insights
