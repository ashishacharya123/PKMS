from pydantic import Field, field_validator, model_validator, EmailStr
from typing import Optional, List
from datetime import datetime
import re
from .base import CamelCaseModel

USERNAME_PATTERN = re.compile(r'^[a-zA-Z0-9_-]{3,50}$')
SAFE_STRING_PATTERN = re.compile(r'^[a-zA-Z0-9\s\-_.,!?\\\'"()[\]{}@#$%^&*+=|\\:;<>/~`]{1,500}$')

class UserSetup(CamelCaseModel):
    username: str = Field(..., min_length=3, max_length=50)
    password: str = Field(..., min_length=8, max_length=72)  # Bcrypt limitation
    email: Optional[EmailStr] = None
    login_password_hint: Optional[str] = Field(None, max_length=255)
    
    recovery_questions: List[str] = Field(..., min_items=2, max_items=5)
    recovery_answers: List[str] = Field(..., min_items=2, max_items=5)
    
    diary_password: str = Field(..., min_length=8, max_length=72)  # Bcrypt limitation
    diary_password_hint: Optional[str] = Field(None, max_length=255)
    
    @field_validator('username')
    @classmethod
    def validate_username(cls, v):
        if not USERNAME_PATTERN.match(v):
            raise ValueError('Username can only contain letters, numbers, hyphens, and underscores')
        if v.lower() in ['admin', 'root', 'administrator', 'user', 'test', 'demo']:
            raise ValueError('This username is not allowed')
        return v
    
    @field_validator('password')
    @classmethod
    def validate_password_security(cls, v):
        if any(char in v for char in ['<', '>', '&', '"', "'"]):
            raise ValueError('Password contains unsafe characters')
        return v
    
    @field_validator('recovery_questions')
    @classmethod
    def validate_questions(cls, v):
        for question in v:
            if not SAFE_STRING_PATTERN.match(question):
                raise ValueError('Security questions contain invalid characters')
            if len(question.strip()) < 10:
                raise ValueError('Security questions must be at least 10 characters long')
        return [q.strip() for q in v]
    
    @field_validator('recovery_answers')
    @classmethod
    def validate_answers(cls, v):
        for answer in v:
            if not SAFE_STRING_PATTERN.match(answer):
                raise ValueError('Security answers contain invalid characters')
            if len(answer.strip()) < 2:
                raise ValueError('Security answers must be at least 2 characters long')
        return [a.strip() for a in v]
    
    @field_validator('diary_password')
    @classmethod
    def validate_diary_password(cls, v):
        if v and any(char in v for char in ['<', '>', '&', '"', "'"]):
            raise ValueError('Diary password contains unsafe characters')
        return v
    
    @model_validator(mode='after')
    def validate_matching_count(self):
        if hasattr(self, 'recovery_questions') and hasattr(self, 'recovery_answers'):
            if len(self.recovery_answers) != len(self.recovery_questions):
                raise ValueError('Number of questions and answers must match')
        return self

class UserLogin(CamelCaseModel):
    username: str = Field(..., min_length=3, max_length=50)
    password: str = Field(..., min_length=1, max_length=72)  # Bcrypt limitation
    
    @field_validator('username')
    @classmethod
    def validate_username(cls, v):
        if not USERNAME_PATTERN.match(v):
            raise ValueError('Invalid username format')
        return v

class PasswordChange(CamelCaseModel):
    current_password: str = Field(..., min_length=1, max_length=72)  # Bcrypt limitation
    new_password: str = Field(..., min_length=8, max_length=72)  # Bcrypt limitation
    
    @field_validator('new_password')
    @classmethod
    def validate_new_password(cls, v):
        if any(char in v for char in ['<', '>', '&', '"', "'"]):
            raise ValueError('Password contains unsafe characters')
        return v

class RecoveryReset(CamelCaseModel):
    username: Optional[str] = Field(None, min_length=3, max_length=50)
    answers: List[str] = Field(..., min_items=2, max_items=5)
    new_password: str = Field(..., min_length=8, max_length=72)  # Bcrypt limitation
    
    @field_validator('answers')
    @classmethod
    def validate_answers(cls, v):
        for answer in v:
            if not SAFE_STRING_PATTERN.match(answer):
                raise ValueError('Security answers contain invalid characters')
        return [a.strip() for a in v]
    
    @field_validator('new_password')
    @classmethod
    def validate_new_password(cls, v):
        if any(char in v for char in ['<', '>', '&', '"', "'"]):
            raise ValueError('Password contains unsafe characters')
        return v

class RecoveryKeyResponse(CamelCaseModel):
    recovery_key: str
    message: str

class TokenResponse(CamelCaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_in: int
    created_by: str  # Changed from int to str (UUID)
    username: str

class UserResponse(CamelCaseModel):
    uuid: str  # Changed from id: int to uuid: str
    username: str
    email: Optional[str]
    is_active: bool
    is_first_login: bool
    settings_json: str
    login_password_hint: Optional[str]
    diary_password_hint: Optional[str]
    created_at: datetime
    updated_at: datetime
    last_login: Optional[datetime]

class RefreshTokenRequest(CamelCaseModel):
    pass

class UsernameBody(CamelCaseModel):
    username: str = Field(..., min_length=3, max_length=50)

    @field_validator('username')
    @classmethod
    def validate_username(cls, v):
        if not USERNAME_PATTERN.match(v):
            raise ValueError('Invalid username format')
        return v

class LoginPasswordHintUpdate(CamelCaseModel):
    hint: str = Field(..., max_length=255)
    
    @field_validator('hint')
    @classmethod
    def validate_hint(cls, v):
        v = v.strip()
        if not v:
            raise ValueError('Hint cannot be empty')
        if len(v) < 2:
            raise ValueError('Hint must be at least 2 characters long')
        return v
