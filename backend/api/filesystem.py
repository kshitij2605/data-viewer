"""Filesystem browsing endpoint for directory tree navigation."""
from pathlib import Path
from typing import List

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from backend.auth import get_current_user
from backend.models import User

router = APIRouter(prefix="/api/filesystem", tags=["filesystem"])

SKIP_NAMES = {"__pycache__", "node_modules", ".git", ".venv", "venv"}


class BrowseRequest(BaseModel):
    path: str


class DirEntry(BaseModel):
    name: str
    path: str
    is_dir: bool
    has_metadata: bool  # True if this folder contains metadata.json
    children_count: int  # number of child items (dirs + files) for expand arrow


@router.post("/browse", response_model=List[DirEntry])
def browse_directory(
    body: BrowseRequest,
    current_user: User = Depends(get_current_user),
):
    folder = Path(body.path)
    if not folder.is_dir():
        raise HTTPException(status_code=400, detail="Path is not a valid directory")

    dirs: List[DirEntry] = []
    files: List[DirEntry] = []
    try:
        for child in sorted(folder.iterdir()):
            if child.name.startswith(".") or child.name in SKIP_NAMES:
                continue
            if child.is_dir():
                has_metadata = (child / "metadata.json").exists()
                try:
                    children_count = sum(
                        1 for c in child.iterdir()
                        if not c.name.startswith(".") and c.name not in SKIP_NAMES
                    )
                except PermissionError:
                    children_count = 0
                dirs.append(DirEntry(
                    name=child.name,
                    path=str(child),
                    is_dir=True,
                    has_metadata=has_metadata,
                    children_count=children_count,
                ))
            else:
                files.append(DirEntry(
                    name=child.name,
                    path=str(child),
                    is_dir=False,
                    has_metadata=False,
                    children_count=0,
                ))
    except PermissionError:
        raise HTTPException(status_code=403, detail="Permission denied")

    # Directories first, then files
    return dirs + files
