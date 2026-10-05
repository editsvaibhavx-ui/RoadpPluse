from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional
from app.database import get_db
from app.models.user import User
from app.schemas.auth import LoginRequest, TokenResponse, UserResponse
from app.utils.security import verify_password, create_access_token, get_password_hash, get_current_user

router = APIRouter(prefix="/api/auth", tags=["Authentication"])

class RegisterRequest(BaseModel):
    username: str
    password: str
    full_name: Optional[str] = "Authority Officer"
    email: Optional[str] = "officer@pmc.gov.in"
    role: Optional[str] = "authority"

@router.post("/register", response_model=TokenResponse)
def register(creds: RegisterRequest, db: Session = Depends(get_db)):
    existing = db.query(User).filter(User.username == creds.username).first()
    if existing:
        raise HTTPException(status_code=400, detail="Username already exists")

    new_user = User(
        username=creds.username,
        password_hash=get_password_hash(creds.password),
        full_name=creds.full_name or creds.username,
        email=creds.email or f"{creds.username}@pmc.gov.in",
        role=creds.role or "authority"
    )
    db.add(new_user)
    db.commit()
    db.refresh(new_user)

    access_token = create_access_token(data={"sub": new_user.username, "role": new_user.role})
    return {
        "access_token": access_token,
        "token_type": "bearer",
        "user": {
            "id": new_user.id,
            "username": new_user.username,
            "full_name": new_user.full_name,
            "email": new_user.email,
            "role": new_user.role
        }
    }

@router.post("/login", response_model=TokenResponse)
def login(creds: LoginRequest, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.username == creds.username).first()
    
    # If database is completely empty and user logs in with admin or authority, dynamically bootstrap user
    if not user and db.query(User).count() == 0 and creds.username in ["admin", "authority"]:
        user = User(
            username=creds.username,
            password_hash=get_password_hash(creds.password),
            full_name="Municipal Chief Administrator" if creds.username == "admin" else "Pune Road Authority",
            email=f"{creds.username}@pmc.gov.in",
            role=creds.username
        )
        db.add(user)
        db.commit()
        db.refresh(user)

    if not user or not verify_password(creds.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password. You can also register a new user.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    access_token = create_access_token(data={"sub": user.username, "role": user.role})
    return {
        "access_token": access_token,
        "token_type": "bearer",
        "user": {
            "id": user.id,
            "username": user.username,
            "full_name": user.full_name,
            "email": user.email,
            "role": user.role
        }
    }

@router.get("/me", response_model=UserResponse)
def get_me(current_user: User = Depends(get_current_user)):
    return current_user
