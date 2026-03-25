from passlib.hash import bcrypt
from backend.db import SessionLocal
from backend.models import User

def seed_users():
    db = SessionLocal()
    try:
        if db.query(User).count() == 0:
            users = [
                User(username="admin", password_hash=bcrypt.hash("admin"), display_name="Admin User"),
                User(username="reviewer1", password_hash=bcrypt.hash("reviewer1"), display_name="Reviewer 1"),
                User(username="reviewer2", password_hash=bcrypt.hash("reviewer2"), display_name="Reviewer 2"),
            ]
            db.add_all(users)
            db.commit()
    finally:
        db.close()
