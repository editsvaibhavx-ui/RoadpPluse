from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List
from app.database import get_db
from app.models.bus import Bus
from app.schemas.bus import BusResponse, BusCreate, BusUpdate
from app.utils.security import get_current_user

router = APIRouter(prefix="/api/buses", tags=["Bus & Fleet Management"])

@router.get("", response_model=List[BusResponse])
def get_buses(db: Session = Depends(get_db)):
    return db.query(Bus).all()

@router.post("", response_model=BusResponse, status_code=status.HTTP_201_CREATED)
def create_bus(payload: BusCreate, db: Session = Depends(get_db), current_user = Depends(get_current_user)):
    existing = db.query(Bus).filter(Bus.bus_number == payload.bus_number).first()
    if existing:
        raise HTTPException(status_code=400, detail="Bus number already registered")
    
    bus = Bus(**payload.dict())
    db.add(bus)
    db.commit()
    db.refresh(bus)
    return bus

@router.put("/{bus_id}", response_model=BusResponse)
def update_bus(bus_id: int, payload: BusUpdate, db: Session = Depends(get_db), current_user = Depends(get_current_user)):
    bus = db.query(Bus).filter(Bus.id == bus_id).first()
    if not bus:
        raise HTTPException(status_code=404, detail="Bus not found")
    
    update_data = payload.dict(exclude_unset=True)
    for key, value in update_data.items():
        setattr(bus, key, value)
    
    db.commit()
    db.refresh(bus)
    return bus

@router.delete("/{bus_id}")
def delete_bus(bus_id: int, db: Session = Depends(get_db), current_user = Depends(get_current_user)):
    bus = db.query(Bus).filter(Bus.id == bus_id).first()
    if not bus:
        raise HTTPException(status_code=404, detail="Bus not found")
    
    db.delete(bus)
    db.commit()
    return {"message": f"Bus {bus.bus_number} deleted successfully"}
