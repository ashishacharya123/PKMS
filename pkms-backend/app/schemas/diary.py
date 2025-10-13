from pydantic import BaseModel, Field, validator, ConfigDict
from pydantic.alias_generators import to_camel
from typing import List, Optional, Dict, Any
from datetime import datetime, date
import json

WEATHER_CODE_LABELS = {
    0: "clear",
    1: "partly_cloudy",
    2: "cloudy",
    3: "rain",
    4: "storm",
    5: "snow",
    6: "scorching_sun",
}


class CamelCaseModel(BaseModel):
    model_config = ConfigDict(
        alias_generator=to_camel,
        populate_by_name=True,
        from_attributes=True
    )


class EncryptionSetupRequest(CamelCaseModel):
    password: str
    hint: Optional[str] = None


class EncryptionUnlockRequest(CamelCaseModel):
    password: str


class DiaryEntryCreate(CamelCaseModel):
    date: date
    title: Optional[str] = Field(None, max_length=255)
    encrypted_blob: str
    encryption_iv: str
    mood: Optional[int] = Field(None, ge=1, le=5)
    weather_code: Optional[int] = Field(None, ge=0, le=6)
    location: Optional[str] = Field(None, max_length=100)
    content_length: Optional[int] = None  # plaintext character count
    daily_metrics: Optional[Dict[str, Any]] = None
    nepali_date: Optional[str] = None
    daily_income: Optional[int] = Field(None, ge=0)  # Income in NPR
    daily_expense: Optional[int] = Field(None, ge=0)  # Expense in NPR
    is_office_day: Optional[bool] = False  # Was this an office/work day?
    is_template: Optional[bool] = False
    from_template_id: Optional[str] = None
    tags: Optional[List[str]] = None

    @validator("weather_code")
    def validate_weather_code(cls, v):
        if v is None:
            return v
        if v not in WEATHER_CODE_LABELS:
            raise ValueError("Invalid weather_code")
        return v

    @validator("daily_metrics", pre=True, always=True)
    def default_daily_metrics(cls, v):
        return v or {}

    @validator("tags", pre=True, always=True)
    def default_tags(cls, v):
        return v or []


class DiaryEntryResponse(CamelCaseModel):
    uuid: str
    id: int
    date: date
    title: Optional[str]
    encrypted_blob: str
    encryption_iv: str
    mood: Optional[int]
    weather_code: Optional[int]
    weather_label: Optional[str] = None
    location: Optional[str]
    daily_metrics: Dict[str, Any]
    nepali_date: Optional[str]
    daily_income: Optional[int] = 0  # Income in NPR
    daily_expense: Optional[int] = 0  # Expense in NPR
    is_office_day: Optional[bool] = False  # Was this an office/work day?
    is_template: bool
    from_template_id: Optional[str]
    created_at: datetime
    updated_at: datetime
    media_count: int
    tags: List[str] = []
    content_length: int

    @validator("daily_metrics", pre=True, always=True)
    def parse_daily_metrics(cls, v):
        if isinstance(v, str):
            try:
                return json.loads(v)
            except json.JSONDecodeError:
                return {}
        return v or {}

    @validator("weather_label", always=True)
    def set_weather_label(cls, v, values):
        code = values.get("weather_code")
        return WEATHER_CODE_LABELS.get(code) if code is not None else None


class DiaryEntrySummary(CamelCaseModel):
    uuid: str
    id: int
    date: date
    title: Optional[str]
    mood: Optional[int]
    weather_code: Optional[int]
    weather_label: Optional[str] = None
    location: Optional[str]
    daily_metrics: Dict[str, Any]
    nepali_date: Optional[str]
    is_template: bool
    from_template_id: Optional[str]
    created_at: datetime
    media_count: int
    encrypted_blob: str
    encryption_iv: str
    tags: List[str] = []
    content_length: int
    is_favorite: Optional[bool] = False

    @validator("daily_metrics", pre=True, always=True)
    def parse_daily_metrics_summary(cls, v):
        if isinstance(v, str):
            try:
                return json.loads(v)
            except json.JSONDecodeError:
                return {}
        return v or {}

    @validator("weather_label", always=True)
    def set_weather_label_summary(cls, v, values):
        code = values.get("weather_code")
        return WEATHER_CODE_LABELS.get(code) if code is not None else None


class DiaryCalendarData(CamelCaseModel):
    date: str
    mood: Optional[int]
    has_entry: bool
    media_count: int


class MoodStats(CamelCaseModel):
    average_mood: Optional[float]
    mood_distribution: Dict[int, int]
    total_entries: int


class WellnessTrendPoint(CamelCaseModel):
    """Single data point for trend charts"""
    date: str
    value: Optional[float]
    label: Optional[str] = None


class WellnessStats(CamelCaseModel):
    """Comprehensive wellness analytics across all metrics"""
    
class WeeklyHighlights(CamelCaseModel):
    period_start: str
    period_end: str
    notes_created: int
    documents_uploaded: int
    todos_completed: int
    diary_entries: int
    archive_items_added: int
    projects_created: int
    projects_completed: int
    total_income: float
    total_expense: float
    net_savings: float

    # Period info
    period_start: str
    period_end: str
    total_days: int
    days_with_data: int
    
    # Summary metrics (for top cards)
    wellness_score: Optional[float]  # 0-100 composite score
    average_mood: Optional[float]
    average_sleep: Optional[float]
    
    # Mood data
    mood_trend: List[WellnessTrendPoint]
    mood_distribution: Dict[int, int]
    
    # Sleep data
    sleep_trend: List[WellnessTrendPoint]
    sleep_quality_days: int  # Days with 7+ hours
    
    # Exercise data
    exercise_trend: List[WellnessTrendPoint]
    days_exercised: int
    exercise_frequency_per_week: float
    average_exercise_minutes: Optional[float]
    
    # Screen time
    screen_time_trend: List[WellnessTrendPoint]
    average_screen_time: Optional[float]
    
    # Energy & Stress
    energy_trend: List[WellnessTrendPoint]
    stress_trend: List[WellnessTrendPoint]
    average_energy: Optional[float]
    average_stress: Optional[float]
    
    # Hydration
    hydration_trend: List[WellnessTrendPoint]
    average_water_intake: Optional[float]
    
    # Mental wellness habits
    meditation_days: int
    gratitude_days: int
    social_interaction_days: int
    
    # Correlations (for scatter plots)
    mood_sleep_correlation: List[Dict[str, Optional[float]]]  # [{mood, sleep}, ...]
    correlation_coefficient: Optional[float]  # Pearson r for mood vs sleep
    
    # Wellness score breakdown (for radar chart)
    wellness_components: Dict[str, float]  # {sleep: 85, exercise: 60, mental: 75, ...}
    
    # Insights
    insights: List[Dict[str, str]]  # [{type: 'positive', message: '...', metric: 'sleep'}, ...]


class DiaryDailyMetadataResponse(CamelCaseModel):
    date: date
    nepali_date: Optional[str]
    metrics: Dict[str, Any]
    created_at: datetime
    updated_at: datetime

    @validator("metrics", pre=True, always=True)
    def parse_metrics(cls, v):
        if isinstance(v, str):
            try:
                return json.loads(v)
            except json.JSONDecodeError:
                return {}
        return v or {}


class DiaryDailyMetadataUpdate(CamelCaseModel):
    nepali_date: Optional[str] = None
    metrics: Dict[str, Any] = {}

    @validator("metrics", pre=True, always=True)
    def validate_metrics(cls, v):
        return v or {}


class DiaryMediaResponse(CamelCaseModel):
    uuid: str
    entry_id: str
    filename_encrypted: str
    mime_type: str
    size_bytes: int
    media_type: str
    duration_seconds: Optional[int]
    created_at: datetime


class DiaryMediaUpload(CamelCaseModel):
    caption: Optional[str] = Field(None, max_length=500)
    media_type: str = Field(..., description="Type: photo, video, voice")

    @validator('media_type')
    def validate_media_type(cls, v):
        allowed_types = ['photo', 'video', 'voice']
        if v not in allowed_types:
            raise ValueError(f"Media type must be one of: {', '.join(allowed_types)}")
        return v


class CommitDiaryMediaRequest(CamelCaseModel):
    file_id: str
    entry_id: str
    caption: Optional[str] = None
    media_type: str = Field(..., description="Type: photo, video, voice")

    @validator('media_type')
    def validate_media_type(cls, v):
        allowed_types = ['photo', 'video', 'voice']
        if v not in allowed_types:
            raise ValueError(f"Media type must be one of: {', '.join(allowed_types)}")
        return v
