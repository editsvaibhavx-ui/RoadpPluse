from sqlalchemy import Column, Integer, String, DateTime, ForeignKey
from sqlalchemy.orm import relationship
from datetime import datetime
from app.database import Base

class Bus(Base):
    __tablename__ = "buses"

    id = Column(Integer, primary_key=True, index=True)
    bus_number = Column(String(50), unique=True, index=True, nullable=False)  # e.g., "BUS-001"
    route_id = Column(Integer, ForeignKey("routes.id"), nullable=True)
    status = Column(String(30), default="Active")  # Active, In Transit, Maintenance, Idle
    camera_source = Column(String(100), default="Smartphone Simulation")  # Transparent label
    device_info = Column(String(100), default="Android / iOS Smartphone Camera")
    last_active = Column(DateTime, default=datetime.utcnow)
    created_at = Column(DateTime, default=datetime.utcnow)

    route = relationship("Route", backref="buses")
