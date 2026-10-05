import json
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List
from app.database import get_db
from app.models.route import Route
from app.schemas.bus import RouteResponse, RouteCreate
from app.utils.security import get_current_user

router = APIRouter(prefix="/api/routes", tags=["Routes"])

@router.get("", response_model=List[RouteResponse])
def get_routes(db: Session = Depends(get_db)):
    return db.query(Route).all()

@router.post("", response_model=RouteResponse, status_code=status.HTTP_201_CREATED)
def create_route(payload: RouteCreate, db: Session = Depends(get_db), current_user = Depends(get_current_user)):
    existing = db.query(Route).filter(Route.route_code == payload.route_code).first()
    if existing:
        raise HTTPException(status_code=400, detail="Route code already exists")
    
    route = Route(**payload.dict())
    db.add(route)
    db.commit()
    db.refresh(route)
    return route

@router.get("/{route_id}", response_model=RouteResponse)
def get_route(route_id: int, db: Session = Depends(get_db)):
    route = db.query(Route).filter(Route.id == route_id).first()
    if not route:
        raise HTTPException(status_code=404, detail="Route not found")
    return route
