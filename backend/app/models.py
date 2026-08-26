"""Pydantic models — the API v2 contract.

Adds macro + key-micro nutrition, a user profile with calorie/nutrient targets,
a two-step capture (draft -> confirm), and nutrient-adequacy stats.
"""

from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import Optional

from pydantic import BaseModel, EmailStr, Field

# nutrient fields shared by items (absolute) — used for validation/docs
NUTRIENTS = [
    "calories", "protein_g", "carbs_g", "fat_g", "fiber_g", "sugar_g",
    "sodium_mg", "satfat_g", "iron_mg", "calcium_mg", "potassium_mg",
]


class MealType(str, Enum):
    breakfast = "breakfast"
    lunch = "lunch"
    dinner = "dinner"
    snack = "snack"


class CaptureSource(str, Enum):
    glasses = "glasses"
    phone = "phone"
    manual = "manual"


class QueryRoute(str, Enum):
    aggregate = "aggregate"
    semantic = "semantic"
    hybrid = "hybrid"


# --- auth ------------------------------------------------------------------

class SignupRequest(BaseModel):
    email: EmailStr
    password: str


class LoginRequest(BaseModel):
    email: str
    password: str


class AuthResponse(BaseModel):
    token: str
    user_id: str
    email: str


class MeResponse(BaseModel):
    user_id: str
    email: str


class MealItem(BaseModel):
    id: Optional[str] = None
    food_entity_id: Optional[int] = None
    raw_name: str
    canonical_name: str
    quantity: float = 1
    unit: str = "serving"
    grams: float = 100
    calories: int = 0
    protein_g: float = 0
    carbs_g: float = 0
    fat_g: float = 0
    fiber_g: float = 0
    sugar_g: float = 0
    sodium_mg: float = 0
    satfat_g: float = 0
    iron_mg: float = 0
    calcium_mg: float = 0
    potassium_mg: float = 0
    confidence: float = 0.9
    resolution_method: Optional[str] = None


class Meal(BaseModel):
    id: str
    user_id: str = "user-1"
    eaten_at: datetime
    meal_type: MealType
    location_text: Optional[str] = None
    photo_uri: Optional[str] = None  # primary thumbnail (first photo)
    photo_uris: list[str] = Field(default_factory=list)  # all photos for this meal
    note_text: Optional[str] = None
    description: str = ""
    tags: list[str] = Field(default_factory=list)
    source: CaptureSource = CaptureSource.phone
    confidence: float = 0.9
    total_calories: int = 0
    total_protein_g: float = 0
    total_carbs_g: float = 0
    total_fat_g: float = 0
    total_fiber_g: float = 0
    total_sugar_g: float = 0
    total_sodium_mg: float = 0
    total_satfat_g: float = 0
    total_iron_mg: float = 0
    total_calcium_mg: float = 0
    total_potassium_mg: float = 0
    created_at: Optional[datetime] = None
    items: list[MealItem] = Field(default_factory=list)


# --- capture (two-step: analyze -> confirm) --------------------------------

class DraftItem(BaseModel):
    """One editable item in an unsaved capture draft."""

    name: str
    quantity: float = 1
    unit: Optional[str] = None
    grams: Optional[float] = None
    calories: Optional[float] = None  # the draft's per-item kcal, anchors the density check on save


class CaptureDraft(BaseModel):
    """Result of /capture/analyze — NOT persisted. The user edits then POSTs /meals."""

    items: list[MealItem]
    meal_type: MealType
    location: Optional[str] = None
    note: Optional[str] = None
    source: CaptureSource = CaptureSource.phone
    photo_uri: Optional[str] = None
    photo_uris: list[str] = Field(default_factory=list)
    photo_count: int = 0
    description: str = ""
    tags: list[str] = Field(default_factory=list)
    confidence: float = 0.9
    total_calories: int = 0
    total_protein_g: float = 0
    total_carbs_g: float = 0
    total_fat_g: float = 0
    total_fiber_g: float = 0
    total_sugar_g: float = 0
    total_sodium_mg: float = 0
    total_satfat_g: float = 0
    total_iron_mg: float = 0
    total_calcium_mg: float = 0
    total_potassium_mg: float = 0
    extractor: str = ""
    extraction_note: str = ""


class MealCreate(BaseModel):
    """Confirmed meal to persist. Items are re-resolved server-side for correct
    nutrition, so edits to name/quantity flow through."""

    meal_type: MealType
    items: list[DraftItem]
    eaten_at: Optional[datetime] = None
    location: Optional[str] = None
    note: Optional[str] = None
    source: CaptureSource = CaptureSource.phone
    photo_uri: Optional[str] = None
    photo_uris: Optional[list[str]] = None
    description: Optional[str] = None
    tags: list[str] = Field(default_factory=list)


class QuickLogRequest(BaseModel):
    """Free-text description of one or more meals to parse into drafts."""

    text: str
    source: CaptureSource = CaptureSource.phone


class RefineRequest(BaseModel):
    """Apply a plain-language correction to a draft's items (re-estimate calories)."""

    items: list[DraftItem]
    correction: str
    meal_type: Optional[MealType] = None
    location: Optional[str] = None
    note: Optional[str] = None
    source: CaptureSource = CaptureSource.phone
    photo_uris: Optional[list[str]] = None


# --- profile + targets -----------------------------------------------------

class ProfileInput(BaseModel):
    age: Optional[int] = None
    sex: Optional[str] = None
    height_cm: Optional[float] = None
    weight_kg: Optional[float] = None
    activity_level: Optional[str] = None
    goal_type: Optional[str] = None       # lose | maintain | gain
    goal_rate: Optional[str] = None


class Profile(ProfileInput):
    user_id: str = "user-1"
    daily_calorie_target: Optional[int] = None
    protein_target_g: Optional[float] = None
    carb_target_g: Optional[float] = None
    fat_target_g: Optional[float] = None
    fiber_target_g: Optional[float] = None
    sugar_limit_g: Optional[float] = None
    sodium_limit_mg: Optional[float] = None
    satfat_limit_g: Optional[float] = None
    iron_target_mg: Optional[float] = None
    calcium_target_mg: Optional[float] = None
    potassium_target_mg: Optional[float] = None
    tdee_estimate: Optional[int] = None
    target_source: str = "formula"
    rationale: Optional[str] = None
    onboarded: bool = False
    updated_at: Optional[datetime] = None


# --- query -----------------------------------------------------------------

class QueryRequest(BaseModel):
    question: str


class QueryResponse(BaseModel):
    question: str
    answer: str
    route: QueryRoute
    router_note: str = ""
    meals: list[Meal] = Field(default_factory=list)
    data: dict = Field(default_factory=dict)
    sql: Optional[str] = None


# --- stats -----------------------------------------------------------------

class DayNutrition(BaseModel):
    date: str
    calories: int
    protein_g: float
    carbs_g: float
    fat_g: float
    meals: int


class TopFood(BaseModel):
    name: str
    count: int


class Adequacy(BaseModel):
    nutrient: str
    label: str
    unit: str
    amount: float
    target: Optional[float] = None
    pct: Optional[float] = None
    status: str = "unknown"   # low | ok | high | over | unknown
    kind: str = "target"      # target (hit it) | limit (stay under)


class Insight(BaseModel):
    kind: str          # calorie | nutrient_low | nutrient_high | swap | pattern
    severity: str      # info | suggest | watch
    title: str
    detail: str


class InsightsResponse(BaseModel):
    period: str
    headline: str
    insights: list[Insight] = Field(default_factory=list)


class StatsResponse(BaseModel):
    period: str
    start: str
    end: str
    total_meals: int
    total_calories: int
    days_tracked: int = 1  # distinct days with entries in the window (the avg divisor)
    logged_days_7d: int = 0  # distinct days logged in the last 7 (consistency signal)
    avg_calories_per_day: float
    avg_protein_per_day: float
    eat_out_meals: int
    eat_out_rate: float
    targets: Optional[Profile] = None
    adequacy: list[Adequacy] = Field(default_factory=list)
    by_day: list[DayNutrition] = Field(default_factory=list)
    top_foods: list[TopFood] = Field(default_factory=list)
    by_meal_type: dict[str, int] = Field(default_factory=dict)
