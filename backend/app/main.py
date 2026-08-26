"""FastAPI app — real Postgres + pgvector, LangGraph router, LLM/USDA nutrition,
with multi-user auth (email/password → JWT) wired into Row-Level Security.

Public: /health, /auth/*, /query/examples. Everything else requires a Bearer
token; the authenticated user_id flows into RLS so each user sees only their data.
"""

from __future__ import annotations

from contextlib import asynccontextmanager
from datetime import datetime, timedelta
from typing import Optional

from fastapi import (
    BackgroundTasks,
    Depends,
    FastAPI,
    File,
    Form,
    HTTPException,
    Query,
    UploadFile,
)
from fastapi.middleware.cors import CORSMiddleware

from . import auth, capture_service, config, db, insights_service, repo, seed, stats_service
from .graph import run_query
from .llm.targets import recommend_targets
from .models import (
    AuthResponse,
    CaptureDraft,
    CaptureSource,
    InsightsResponse,
    LoginRequest,
    Meal,
    MealCreate,
    MealType,
    MeResponse,
    Profile,
    ProfileInput,
    QueryRequest,
    QueryResponse,
    QuickLogRequest,
    RefineRequest,
    SignupRequest,
    StatsResponse,
)

CurrentUser = Depends(auth.current_user_id)


@asynccontextmanager
async def lifespan(_app: FastAPI):
    # Seed the shared food catalog on first run (needed for nutrition
    # resolution). Meals are seeded per-user at signup, not here.
    try:
        h = db.healthcheck()
        if h.get("connected") and not h.get("food_entities"):
            print("Seeding food catalog...")
            seed.seed_food_entities()
    except Exception as exc:  # pragma: no cover
        print(f"startup seed skipped: {exc}")
    yield
    db.close_pools()


app = FastAPI(
    title="Morsel API",
    version="0.3.0",
    lifespan=lifespan,
    description=(
        "Agentic food-memory API with multi-user auth. Postgres+pgvector, "
        "LangGraph dual-query router, vision extraction + USDA nutrition via a "
        "provider-agnostic LLM boundary, RLS-isolated per user."
    ),
)

app.add_middleware(
    CORSMiddleware, allow_origins=["*"], allow_credentials=False,
    allow_methods=["*"], allow_headers=["*"],
)


@app.get("/health")
def health() -> dict:
    return {
        "status": "ok",
        "db": db.healthcheck(),
        "llm": (
            f"{config.LLM_PROVIDER or config.LLM_KIND}:{config.LLM_MODEL}"
            if config.USE_REAL_LLM else "stub (no LLM key)"
        ),
        "embeddings": config.EMBED_MODEL,
        "time": datetime.now().isoformat(),
    }


# --- auth ------------------------------------------------------------------

@app.post("/auth/signup", response_model=AuthResponse)
def signup(body: SignupRequest, bg: BackgroundTasks) -> AuthResponse:
    user_id, token = auth.signup(body.email, body.password)
    if config.SEED_ON_SIGNUP:
        bg.add_task(seed.seed_all, user_id)  # sample meals so the app isn't empty
    return AuthResponse(token=token, user_id=user_id, email=body.email.strip().lower())


@app.post("/auth/login", response_model=AuthResponse)
def login(body: LoginRequest) -> AuthResponse:
    user_id, token = auth.login(body.email, body.password)
    return AuthResponse(token=token, user_id=user_id, email=body.email.strip().lower())


@app.get("/auth/me", response_model=MeResponse)
def me(user_id: str = CurrentUser) -> MeResponse:
    u = repo.get_user(user_id)
    if not u:
        raise HTTPException(status_code=404, detail="User not found")
    return MeResponse(user_id=u["id"], email=u["email"])


# --- profile ---------------------------------------------------------------

@app.get("/profile", response_model=Optional[Profile])
def get_profile(user_id: str = CurrentUser) -> Optional[Profile]:
    p = repo.get_profile(user_id)
    return Profile(**p) if p else None


@app.post("/profile", response_model=Profile)
def set_profile(body: ProfileInput, user_id: str = CurrentUser) -> Profile:
    targets = recommend_targets(body.model_dump())
    saved = repo.upsert_profile({**body.model_dump(), **targets}, user_id)
    return Profile(**saved)


# --- capture ---------------------------------------------------------------

@app.post("/capture/analyze", response_model=CaptureDraft)
def capture_analyze(
    photos: Optional[list[UploadFile]] = File(None),  # multiple: final dish + ingredients
    photo: Optional[UploadFile] = File(None),          # legacy single-photo clients
    note: Optional[str] = Form(None),
    meal_type: Optional[MealType] = Form(None),
    location: Optional[str] = Form(None),
    source: CaptureSource = Form(CaptureSource.phone),
    user_id: str = CurrentUser,
) -> CaptureDraft:
    files = list(photos or [])
    if photo:
        files.append(photo)
    images = [(f.file.read(), f.content_type or "image/jpeg") for f in files]
    draft = capture_service.analyze(
        note=note, images=images or None,
        meal_type=meal_type.value if meal_type else None,
        location=location, source=source.value,
    )
    return CaptureDraft(**draft)


@app.post("/capture/refine", response_model=CaptureDraft)
def capture_refine(body: RefineRequest, user_id: str = CurrentUser) -> CaptureDraft:
    """Re-estimate a draft from a plain-language correction (e.g. 'the dal is cooked,
    ~200 cal', 'only 2 rotis'). No DB write — the user still confirms via /meals."""
    if not body.correction.strip():
        raise HTTPException(status_code=400, detail="Empty correction")
    draft = capture_service.refine(
        items=[i.model_dump() for i in body.items],
        correction=body.correction,
        meal_type=body.meal_type.value if body.meal_type else None,
        location=body.location, note=body.note, source=body.source.value,
        photo_uris=body.photo_uris,
    )
    return CaptureDraft(**draft)


@app.post("/capture/quicklog", response_model=list[CaptureDraft])
def capture_quicklog(body: QuickLogRequest, user_id: str = CurrentUser) -> list[CaptureDraft]:
    """Parse free text ('oatmeal + coffee for breakfast, a chicken bowl at lunch, an
    apple') into one or more editable drafts. No DB write — confirm via /meals/batch."""
    if not body.text.strip():
        raise HTTPException(status_code=400, detail="Empty text")
    return [CaptureDraft(**d) for d in capture_service.quicklog(body.text, body.source.value)]


@app.post("/meals", response_model=Meal)
def create_meal(body: MealCreate, user_id: str = CurrentUser) -> Meal:
    if not body.items:
        raise HTTPException(status_code=400, detail="A meal needs at least one item")
    meal = capture_service.build_meal(body.model_dump())
    return Meal(**repo.persist_meal(meal, user_id))


@app.post("/meals/batch", response_model=list[Meal])
def create_meals_batch(bodies: list[MealCreate], user_id: str = CurrentUser) -> list[Meal]:
    """Persist several confirmed meals at once (the multi-meal quick-log flow)."""
    out = []
    for body in bodies:
        if not body.items:
            continue
        meal = capture_service.build_meal(body.model_dump())
        out.append(Meal(**repo.persist_meal(meal, user_id)))
    if not out:
        raise HTTPException(status_code=400, detail="No meals with items to save")
    return out


@app.get("/meals/suggestions", response_model=list[Meal])
def meal_suggestions(
    tz_offset: int = Query(0, ge=-840, le=840),
    user_id: str = CurrentUser,
) -> list[Meal]:
    """A few recent meals to quick-re-log, biased to the current time of day."""
    local = datetime.now() - timedelta(minutes=tz_offset)
    h = local.hour
    mt = "breakfast" if h < 11 else "lunch" if h < 15 else "snack" if h < 17 else "dinner"
    return [Meal(**m) for m in repo.suggested_meals(user_id, meal_type=mt)]


@app.get("/meals", response_model=list[Meal])
def list_meals(
    start: Optional[datetime] = Query(None),
    end: Optional[datetime] = Query(None),
    meal_type: Optional[MealType] = Query(None),
    q: Optional[str] = Query(None),
    limit: int = Query(200, ge=1, le=1000),
    user_id: str = CurrentUser,
) -> list[Meal]:
    rows = repo.list_meals(
        user_id, start=start, end=end,
        meal_type=meal_type.value if meal_type else None, q=q, limit=limit,
    )
    return [Meal(**r) for r in rows]


@app.get("/meals/{meal_id}", response_model=Meal)
def get_meal(meal_id: str, user_id: str = CurrentUser) -> Meal:
    meal = repo.get_meal(meal_id, user_id)
    if not meal:
        raise HTTPException(status_code=404, detail="Meal not found")
    return Meal(**meal)


# --- query -----------------------------------------------------------------

@app.post("/query", response_model=QueryResponse)
def query(req: QueryRequest, user_id: str = CurrentUser) -> QueryResponse:
    if not req.question.strip():
        raise HTTPException(status_code=400, detail="Empty question")
    result = run_query(req.question, user_id)
    result["meals"] = [Meal(**m) for m in result.get("meals", [])]
    return QueryResponse(**result)


@app.get("/query/examples", response_model=list[str])
def query_examples() -> list[str]:
    return [
        "How much protein did I eat this week?",
        "How many calories did I have today?",
        "How often did I eat out this week?",
        "What was that mushroom dish?",
        "Show me the meal I had near the office",
        "How much protein from meals with chicken this week?",
        "Am I getting enough fiber this week?",
    ]


# --- stats -----------------------------------------------------------------

@app.get("/stats", response_model=StatsResponse)
def stats(
    period: str = Query("week", pattern="^(day|week|month)$"),
    tz_offset: int = Query(0, ge=-840, le=840),  # browser Date.getTimezoneOffset() (minutes)
    user_id: str = CurrentUser,
) -> StatsResponse:
    return StatsResponse(**stats_service.compute_stats(period, user_id, tz_offset))


@app.get("/insights", response_model=InsightsResponse)
def insights(
    period: str = Query("week", pattern="^(day|week|month)$"),
    tz_offset: int = Query(0, ge=-840, le=840),
    user_id: str = CurrentUser,
) -> InsightsResponse:
    return InsightsResponse(**insights_service.compute_insights(period, user_id, tz_offset))


# --- admin -----------------------------------------------------------------

@app.post("/admin/reset")
def reset(user_id: str = CurrentUser) -> dict:
    """Reset the current user's meals back to freshly-seeded sample data."""
    return seed.reset(user_id)
