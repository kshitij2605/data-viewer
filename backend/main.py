"""FastAPI application entry point."""
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from backend.db import init_db
from backend.seed import seed_users


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    seed_users()
    yield


app = FastAPI(title="Data Viewer", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

from backend.api.auth import router as auth_router  # noqa: E402
from backend.api.documents import router as documents_router  # noqa: E402
from backend.api.files import router as files_router  # noqa: E402
from backend.api.views import router as views_router  # noqa: E402

app.include_router(auth_router)
app.include_router(documents_router)
app.include_router(files_router)
app.include_router(views_router)
