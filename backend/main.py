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
from backend.api.chunks import router as chunks_router  # noqa: E402
from backend.api.feedback import router as feedback_router  # noqa: E402
from backend.api.filesystem import router as filesystem_router  # noqa: E402

app.include_router(auth_router)
app.include_router(documents_router)
app.include_router(files_router)
app.include_router(views_router)
app.include_router(chunks_router)
app.include_router(feedback_router)
app.include_router(filesystem_router)

from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from pathlib import Path

frontend_dist = Path(__file__).parent.parent / "frontend" / "dist"
if frontend_dist.exists():
    app.mount("/assets", StaticFiles(directory=frontend_dist / "assets"), name="assets")

    @app.get("/{full_path:path}")
    async def serve_frontend(full_path: str):
        # Never intercept API routes — let them 404 naturally
        if full_path.startswith("api/"):
            from fastapi import HTTPException
            raise HTTPException(status_code=404, detail="Not found")
        file_path = frontend_dist / full_path
        if file_path.exists() and file_path.is_file():
            return FileResponse(file_path)
        return FileResponse(frontend_dist / "index.html")
