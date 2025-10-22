from pydantic import BaseModel, Field, ConfigDict, field_validator, computed_field
from pydantic.alias_generators import to_camel
from typing import List, Optional, Dict, Any
from datetime import datetime, date
import json

WEATHER_CODE_LABELS = {
    0: "freezing_0_5c",
    1: "cold_5_10c", 
    2: "cool_10_15c",
    3: "mild_15_20c",
    4: "warm_20_25c",
    5: "hot_25_35c",
    6: "scorching_35c_plus",
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


class DiaryEntryUpdate(CamelCaseModel):
    date: Optional[date] = None
    title: Optional[str] = Field(None, max_length=255)
    encrypted_blob: Optional[str] = None
    encryption_iv: Optional[str] = None
    mood: Optional[int] = Field(None, ge=1, le=5)
    weather_code: Optional[int] = Field(None, ge=0, le=6)
    location: Optional[str] = Field(None, max_length=100)
    content_length: Optional[int] = None
    daily_metrics: Optional[Dict[str, Any]] = None
    nepali_date: Optional[str] = None
    daily_income: Optional[int] = Field(None, ge=0)
    daily_expense: Optional[int] = Field(None, ge=0)
    is_office_day: Optional[bool] = None
    is_template: Optional[bool] = None
    from_template_id: Optional[str] = None
    tags: Optional[List[str]] = None

    @field_validator("weather_code", mode="after")
    def validate_weather_code(cls, v):
        if v is None:
            return v
        if v not in WEATHER_CODE_LABELS:
            raise ValueError("Invalid weather_code")
        return v

    # Removed: no-op validator for daily_metrics

    # Removed: no-op validator for tags


class DiaryEntryCreate(CamelCaseModel):
    date: date
    title: Optional[str] = Field(None, max_length=255)
    encrypted_blob: str
    encryption_iv: str
    mood: Optional[int] = Field(None, ge=1, le=5)
    weather_code: Optional[int] = Field(None, ge=0, le=6)
    location: Optional[str] = Field(None, max_length=100)
    content_length: Optional[int] = None  # plaintext character count
    daily_metrics: Dict[str, Any] = Field(default_factory=dict)
    nepali_date: Optional[str] = None
    daily_income: Optional[int] = Field(None, ge=0)  # Income in NPR
    daily_expense: Optional[int] = Field(None, ge=0)  # Expense in NPR
    is_office_day: bool = False  # Was this an office/work day?
    is_template: bool = False
    from_template_id: Optional[str] = None
    tags: List[str] = Field(default_factory=list)

    @field_validator("weather_code", mode="after")
    def validate_weather_code(cls, v):
        if v is None:
            return v
        if v not in WEATHER_CODE_LABELS:
            raise ValueError("Invalid weather_code")
        return v

    # Removed: defaulting validators in favor of field defaults


class DiaryEntryResponse(CamelCaseModel):
    """Secure diary entry response - metadata only, no encrypted content"""
    uuid: str
    date: date
    title: Optional[str]
    mood: Optional[int]
    weather_code: Optional[int]
    location: Optional[str]
    daily_metrics: Dict[str, Any] = Field(default_factory=dict)
    nepali_date: Optional[str]
    daily_income: int = 0
    daily_expense: int = 0
    is_office_day: bool = False
    is_template: bool
    from_template_id: Optional[str]
    created_at: datetime
    updated_at: datetime
    file_count: int
    tags: List[str] = Field(default_factory=list)
    content_length: int
    content_available: bool = Field(default=False, description="Whether encrypted content can be accessed with valid diary session")

    @field_validator("daily_metrics", mode="before")
    @classmethod
    def parse_daily_metrics(cls, v):
        if isinstance(v, str):
            try:
                return json.loads(v)
            except json.JSONDecodeError:
                return {}
        return v or {}

    @computed_field(return_type=Optional[str])
    @property
    def weather_label(self) -> Optional[str]:
        if self.weather_code is None:
            return None
        return WEATHER_CODE_LABELS.get(self.weather_code)


class DiaryEntrySummary(CamelCaseModel):
    uuid: str
    date: date
    title: Optional[str]
    mood: Optional[int]
    weather_code: Optional[int]
    location: Optional[str]
    daily_metrics: Dict[str, Any] = Field(default_factory=dict)
    nepali_date: Optional[str]
    is_template: bool
    from_template_id: Optional[str]
    created_at: datetime
    file_count: int
    tags: List[str] = Field(default_factory=list)
    content_length: int
    content_available: bool = Field(
        default=False,
        description="Whether encrypted content can be accessed with valid diary session"
    )
    is_favorite: Optional[bool] = False

    @field_validator("daily_metrics", mode="before")
    @classmethod
    def parse_daily_metrics_summary(cls, v):
        if isinstance(v, str):
            try:
                return json.loads(v)
            except json.JSONDecodeError:
                return {}
        return v or {}

    @computed_field(return_type=Optional[str])
    @property
    def weather_label(self) -> Optional[str]:
        if self.weather_code is None:
            return None
        return WEATHER_CODE_LABELS.get(self.weather_code)


class DiaryCalendarData(CamelCaseModel):
    date: str
    mood: Optional[int]
    has_entry: bool
    file_count: int


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
    """Wellness analytics based on actual tracked metrics"""
    period_start: str
    period_end: str
    total_days: int = Field(ge=0)
    days_with_data: int = Field(ge=0)
    average_mood: Optional[float] = None
    mood_trend: List[WellnessTrendPoint] = Field(default_factory=list)
    mood_distribution: Dict[int, int] = Field(default_factory=dict)
    # Default habits tracking
    average_sleep: Optional[float] = None
    sleep_trend: List[WellnessTrendPoint] = Field(default_factory=list)
    average_stress: Optional[float] = None
    stress_trend: List[WellnessTrendPoint] = Field(default_factory=list)
    average_exercise: Optional[float] = None
    exercise_trend: List[WellnessTrendPoint] = Field(default_factory=list)
    average_meditation: Optional[float] = None
    meditation_trend: List[WellnessTrendPoint] = Field(default_factory=list)
    average_screen_time: Optional[float] = None
    screen_time_trend: List[WellnessTrendPoint] = Field(default_factory=list)
    # Financial tracking
    financial_trend: List[Dict[str, float]] = Field(default_factory=list)
    total_income: float = 0.0
    total_expense: float = 0.0
    net_savings: float = 0.0
    average_daily_income: Optional[float] = None
    average_daily_expense: Optional[float] = None
    # Long-term daily averages
    average_daily_income_3m: Optional[float] = None
    average_daily_expense_3m: Optional[float] = None
    average_daily_income_6m: Optional[float] = None
    average_daily_expense_6m: Optional[float] = None
    # Overall wellness score (0-100)
    overall_wellness_score: Optional[float] = None
    score_components: Dict[str, float] = Field(default_factory=dict)
    # Defined habits summary (user-customizable)
    defined_habits_summary: Dict[str, Any] = Field(default_factory=dict)
    insights: List[Dict[str, Any]] = Field(default_factory=list)
    
class WeeklyHighlights(CamelCaseModel):
    """Weekly activity and wellness summary"""
    period_start: str
    period_end: str
    total_days: int = 7
    days_with_data: int = 0
    # Activity counts
    notes_created: int = 0
    documents_uploaded: int = 0
    todos_completed: int = 0
    diary_entries: int = 0
    archive_items_added: int = 0
    projects_created: int = 0
    projects_completed: int = 0
    # Financial summary
    total_income: float = 0.0
    total_expense: float = 0.0
    net_savings: float = 0.0
    average_daily_income: Optional[float] = None
    average_daily_expense: Optional[float] = None
    # Wellness summary (default habits)
    average_mood: Optional[float] = None
    average_sleep: Optional[float] = None
    average_stress: Optional[float] = None
    average_exercise: Optional[float] = None
    average_meditation: Optional[float] = None
    average_screen_time: Optional[float] = None
    # Defined habits summary
    defined_habits_summary: Dict[str, Any] = Field(default_factory=dict)
    insights: List[Dict[str, str]] = Field(default_factory=list)


class DiaryDailyMetadata(CamelCaseModel):
    date: date
    nepali_date: Optional[str] = None
    metrics: Dict[str, Any] = Field(default_factory=dict)
    daily_income: Optional[int] = Field(None, ge=0)
    daily_expense: Optional[int] = Field(None, ge=0)
    is_office_day: Optional[bool] = False

    @field_validator("metrics", mode="before")
    @classmethod
    def validate_metrics(cls, v):
        return v or {}


class DiaryDailyMetadataResponse(CamelCaseModel):
    date: date
    nepali_date: Optional[str]
    day_of_week: Optional[int] = Field(None, ge=0, le=6)
    metrics: Dict[str, Any]
    created_at: datetime
    updated_at: datetime

    @field_validator("metrics", mode="before")
    def parse_metrics(cls, v):
        if isinstance(v, str):
            try:
                return json.loads(v)
            except json.JSONDecodeError:
                return {}
        return v or {}


class DiaryDailyMetadataUpdate(CamelCaseModel):
    nepali_date: Optional[str] = None
    metrics: Optional[Dict[str, Any]] = None
    daily_income: int = Field(0, ge=0)
    daily_expense: int = Field(0, ge=0)
    is_office_day: Optional[bool] = None

    # Removed: no-op validator for metrics


# DiaryFile schemas removed - diary files now use Document + document_diary association